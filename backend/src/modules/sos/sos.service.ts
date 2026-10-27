import { Inject, Injectable, Logger } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import type { AuthUser } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { DB } from '../../database/database';
import type { SosEvent, SosStatus } from '../../database/types';
import { AuditService } from '../audit/audit.service';
import { FamilyAccessService } from '../families/family-access.service';
import { LocationStateStore } from '../locations/location-state.store';
import type { EncryptedFix } from '../locations/location.types';
import { LocationsService } from '../locations/locations.service';
import { NotificationsService, type PushJob } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ServerEvents } from '../realtime/rooms';
import type { RaiseSosDto } from './sos.dto';

const ROUTE_MINUTES = 30;

@Injectable()
export class SosService {
  private readonly logger = new Logger(SosService.name);

  constructor(
    @Inject(DB) private readonly db: DB,
    private readonly access: FamilyAccessService,
    private readonly state: LocationStateStore,
    private readonly locations: LocationsService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async raise(user: AuthUser, dto: RaiseSosDto, ip?: string) {
    const family = await this.access.familyOfChild(user.userId);
    if (!family) throw AppError.forbidden('NOT_IN_FAMILY', 'This device is not connected to a family');

    const existing = await this.db
      .selectFrom('sos_events')
      .selectAll()
      .where('child_id', '=', user.userId)
      .where('client_id', '=', dto.clientId)
      .executeTakeFirst();
    if (existing) return this.view(existing);

    const hasFix = dto.lat !== undefined && dto.lng !== undefined;
    let fix: EncryptedFix | null = hasFix ? { lat: dto.lat!, lng: dto.lng!, acc: dto.accuracy ?? 0 } : null;
    if (!fix) {
      // No fresh fix on the device: fall back to the last known location so parents still see something.
      const last = (await this.state.getLast([user.userId])).get(user.userId);
      if (last) fix = { lat: last.lat, lng: last.lng, acc: last.accuracy };
    }
    const encrypted = fix ? this.state.cipher.encrypt(fix, user.userId) : null;

    const inserted = await this.db
      .insertInto('sos_events')
      .values({
        id: uuidv7(),
        family_id: family.familyId,
        child_id: user.userId,
        device_id: user.deviceId,
        client_id: dto.clientId,
        status: 'active',
        payload: encrypted?.payload ?? null,
        key_version: encrypted?.keyVersion ?? null,
        battery: dto.battery?.level ?? null,
      })
      .onConflict((oc) => oc.columns(['child_id', 'client_id']).doNothing())
      .returningAll()
      .executeTakeFirst();
    if (!inserted) {
      const row = await this.db.selectFrom('sos_events').selectAll().where('child_id', '=', user.userId).where('client_id', '=', dto.clientId).executeTakeFirstOrThrow();
      return this.view(row);
    }

    // The SOS point also lands in history and moves the pin, even while sharing is paused.
    if (hasFix) {
      await this.locations
        .ingest(user, {
          points: [{ clientId: dto.clientId, lat: dto.lat!, lng: dto.lng!, accuracy: dto.accuracy ?? 0, recordedAt: new Date().toISOString(), source: 'sos' }],
          battery: dto.battery,
        })
        .catch((err: unknown) => this.logger.error(`SOS location ingest failed: ${String(err)}`));
    }

    const child = await this.db.selectFrom('users').select(['display_name', 'phone']).where('id', '=', user.userId).executeTakeFirstOrThrow();
    const route = await this.locations.recentRoute(user.userId, ROUTE_MINUTES);
    const view = this.view(inserted);
    this.realtime.toFamilyParents(family.familyId, ServerEvents.SosRaised, {
      ...view,
      childName: child.display_name,
      childPhone: child.phone,
      route,
    });
    this.realtime.toChild(user.userId, ServerEvents.SosUpdated, view);

    const job: PushJob = {
      kind: 'sos',
      recipientUserIds: await this.access.parentIds(family.familyId),
      params: { child: child.display_name, battery: dto.battery?.level },
      at: inserted.created_at.toISOString(),
      data: { sosId: inserted.id, childId: user.userId },
      sosId: inserted.id,
    };
    await this.notifications.enqueue(job);
    await this.notifications.scheduleSosRepeat(job, 1);

    await this.audit.record({ action: 'sos.raised', actorUserId: user.userId, actorDeviceId: user.deviceId, targetType: 'sos', targetId: inserted.id, ip });
    return view;
  }

  async cancel(user: AuthUser, sosId: string) {
    const sos = await this.transition(sosId, ['active', 'acknowledged'], 'cancelled', (q) => q.where('child_id', '=', user.userId));
    const child = await this.db.selectFrom('users').select('display_name').where('id', '=', user.userId).executeTakeFirstOrThrow();
    const view = this.view(sos);
    this.realtime.toFamilyParents(sos.family_id, ServerEvents.SosUpdated, view);
    this.realtime.toChild(user.userId, ServerEvents.SosUpdated, view);
    await this.notifications.enqueue({
      kind: 'sos_cancelled',
      recipientUserIds: await this.access.parentIds(sos.family_id),
      params: { child: child.display_name },
      at: new Date().toISOString(),
      data: { sosId, childId: user.userId },
    });
    await this.audit.record({ action: 'sos.cancelled', actorUserId: user.userId, actorDeviceId: user.deviceId, targetType: 'sos', targetId: sosId });
    return view;
  }

  async acknowledge(user: AuthUser, sosId: string) {
    const familyId = await this.familyOfSos(user, sosId);
    const sos = await this.transition(sosId, ['active'], 'acknowledged', (q) => q.where('family_id', '=', familyId), {
      acknowledged_by: user.userId,
      acknowledged_at: new Date(),
    });
    const parent = await this.db.selectFrom('users').select('display_name').where('id', '=', user.userId).executeTakeFirstOrThrow();
    const view = { ...this.view(sos), acknowledgedByName: parent.display_name };
    this.realtime.toFamilyParents(familyId, ServerEvents.SosUpdated, view);
    this.realtime.toChild(sos.child_id, ServerEvents.SosUpdated, view);
    await this.notifications.enqueue({
      kind: 'sos_acknowledged',
      recipientUserIds: [sos.child_id],
      params: { parent: parent.display_name },
      at: new Date().toISOString(),
      data: { sosId },
    });
    await this.audit.record({ action: 'sos.acknowledged', actorUserId: user.userId, actorDeviceId: user.deviceId, targetType: 'sos', targetId: sosId });
    return view;
  }

  async resolve(user: AuthUser, sosId: string) {
    const familyId = await this.familyOfSos(user, sosId);
    const sos = await this.transition(sosId, ['active', 'acknowledged'], 'resolved', (q) => q.where('family_id', '=', familyId));
    const view = this.view(sos);
    this.realtime.toFamilyParents(familyId, ServerEvents.SosUpdated, view);
    this.realtime.toChild(sos.child_id, ServerEvents.SosUpdated, view);
    await this.audit.record({ action: 'sos.resolved', actorUserId: user.userId, actorDeviceId: user.deviceId, targetType: 'sos', targetId: sosId });
    return view;
  }

  async list(user: AuthUser, familyId: string, onlyOpen: boolean) {
    await this.access.assertParentIn(user.userId, familyId);
    let q = this.db.selectFrom('sos_events').selectAll().where('family_id', '=', familyId).orderBy('created_at', 'desc').limit(50);
    if (onlyOpen) q = q.where('status', 'in', ['active', 'acknowledged']);
    const rows = await q.execute();
    return Promise.all(
      rows.map(async (r) => ({
        ...this.view(r),
        route: r.status === 'active' || r.status === 'acknowledged' ? await this.locations.recentRoute(r.child_id, ROUTE_MINUTES) : undefined,
      })),
    );
  }

  private async familyOfSos(user: AuthUser, sosId: string): Promise<string> {
    const sos = await this.db.selectFrom('sos_events').select('family_id').where('id', '=', sosId).executeTakeFirst();
    if (!sos) throw AppError.notFound('SOS_NOT_FOUND', 'Alert not found');
    await this.access.assertParentIn(user.userId, sos.family_id);
    return sos.family_id;
  }

  private async transition(
    sosId: string,
    from: SosStatus[],
    to: SosStatus,
    scope: (q: any) => any,
    extra: Partial<Pick<SosEvent, 'acknowledged_by' | 'acknowledged_at'>> = {},
  ): Promise<SosEvent> {
    const closing = to === 'resolved' || to === 'cancelled';
    let q = this.db
      .updateTable('sos_events')
      .set({ status: to, ...extra, ...(closing && { closed_at: new Date() }) })
      .where('id', '=', sosId)
      .where('status', 'in', from);
    q = scope(q);
    const row = (await q.returningAll().executeTakeFirst()) as SosEvent | undefined;
    if (row) return row;
    const exists = await scope(this.db.selectFrom('sos_events').select('status').where('id', '=', sosId)).executeTakeFirst();
    if (!exists) throw AppError.notFound('SOS_NOT_FOUND', 'Alert not found');
    throw AppError.conflict('SOS_STATE', `Alert is already ${exists.status}`);
  }

  private view(s: SosEvent) {
    const fix = s.payload && s.key_version ? this.state.cipher.decrypt<EncryptedFix>(s.payload, s.key_version, s.child_id) : null;
    return {
      id: s.id,
      childId: s.child_id,
      familyId: s.family_id,
      status: s.status,
      createdAt: s.created_at.toISOString(),
      battery: s.battery,
      location: fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.acc } : null,
      acknowledgedBy: s.acknowledged_by,
      acknowledgedAt: s.acknowledged_at?.toISOString() ?? null,
      closedAt: s.closed_at?.toISOString() ?? null,
    };
  }
}
