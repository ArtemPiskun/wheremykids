import { Inject, Injectable, Logger } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import type { AuthUser } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { DB } from '../../database/database';
import type { Geofence } from '../../database/types';
import { FamilyAccessService } from '../families/family-access.service';
import { LocationStateStore } from '../locations/location-state.store';
import { NotificationsService } from '../notifications/notifications.service';
import { limitsFor } from '../plans/plans';
import { RealtimeService } from '../realtime/realtime.service';
import { ServerEvents } from '../realtime/rooms';
import type { CreateGeofenceDto, UpdateGeofenceDto } from './geofences.dto';
import { evaluateFence, type FenceState, type FixSample } from './geofence-engine';

export interface TimedFix extends FixSample {
  recordedAt: Date;
}

export interface GeofenceView {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lng: number;
  radiusM: number;
  notifyEnter: boolean;
  notifyExit: boolean;
  createdAt: Date;
}

@Injectable()
export class GeofencesService {
  private readonly logger = new Logger(GeofencesService.name);

  constructor(
    @Inject(DB) private readonly db: DB,
    private readonly access: FamilyAccessService,
    private readonly state: LocationStateStore,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser, familyId: string): Promise<GeofenceView[]> {
    await this.access.assertParentIn(user.userId, familyId);
    const rows = await this.db.selectFrom('geofences').selectAll().where('family_id', '=', familyId).orderBy('created_at').execute();
    return rows.map(toView);
  }

  async create(user: AuthUser, familyId: string, dto: CreateGeofenceDto): Promise<GeofenceView> {
    await this.access.assertParentIn(user.userId, familyId);
    const family = await this.db.selectFrom('families').select('plan').where('id', '=', familyId).executeTakeFirstOrThrow();
    const { count } = await this.db
      .selectFrom('geofences')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('family_id', '=', familyId)
      .executeTakeFirstOrThrow();
    const limit = limitsFor(family.plan).maxGeofences;
    if (Number(count) >= limit) throw AppError.planLimit('Geofence limit reached for the current plan', { limit });

    const row = await this.db
      .insertInto('geofences')
      .values({
        id: uuidv7(),
        family_id: familyId,
        name: dto.name,
        kind: dto.kind,
        lat: dto.lat,
        lng: dto.lng,
        radius_m: dto.radiusM,
        notify_enter: dto.notifyEnter ?? true,
        notify_exit: dto.notifyExit ?? true,
        created_by: user.userId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.seedStates(row);
    return toView(row);
  }

  async update(user: AuthUser, familyId: string, id: string, dto: UpdateGeofenceDto): Promise<GeofenceView> {
    await this.access.assertParentIn(user.userId, familyId);
    const row = await this.db
      .updateTable('geofences')
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.kind !== undefined && { kind: dto.kind }),
        ...(dto.lat !== undefined && { lat: dto.lat }),
        ...(dto.lng !== undefined && { lng: dto.lng }),
        ...(dto.radiusM !== undefined && { radius_m: dto.radiusM }),
        ...(dto.notifyEnter !== undefined && { notify_enter: dto.notifyEnter }),
        ...(dto.notifyExit !== undefined && { notify_exit: dto.notifyExit }),
      })
      .where('id', '=', id)
      .where('family_id', '=', familyId)
      .returningAll()
      .executeTakeFirst();
    if (!row) throw AppError.notFound('GEOFENCE_NOT_FOUND', 'Geofence not found');
    if (dto.lat !== undefined || dto.lng !== undefined || dto.radiusM !== undefined) {
      // Geometry changed: forget the old side so moving a fence does not fire a fake transition.
      await this.db.deleteFrom('geofence_states').where('geofence_id', '=', id).execute();
      await this.seedStates(row);
    }
    return toView(row);
  }

  async remove(user: AuthUser, familyId: string, id: string): Promise<void> {
    await this.access.assertParentIn(user.userId, familyId);
    const res = await this.db.deleteFrom('geofences').where('id', '=', id).where('family_id', '=', familyId).executeTakeFirst();
    if (!res.numDeletedRows) throw AppError.notFound('GEOFENCE_NOT_FOUND', 'Geofence not found');
  }

  async events(user: AuthUser, familyId: string, before?: Date, limit = 50) {
    await this.access.assertParentIn(user.userId, familyId);
    let q = this.db
      .selectFrom('geofence_events as e')
      .innerJoin('geofences as g', 'g.id', 'e.geofence_id')
      .select(['e.id', 'e.geofence_id', 'g.name', 'g.kind as zone_kind', 'e.child_id', 'e.kind', 'e.occurred_at'])
      .where('e.family_id', '=', familyId)
      .orderBy('e.occurred_at', 'desc')
      .limit(Math.min(limit, 100));
    if (before) q = q.where('e.occurred_at', '<', before);
    const rows = await q.execute();
    return rows.map((r) => ({
      id: r.id,
      geofenceId: r.geofence_id,
      geofenceName: r.name,
      geofenceKind: r.zone_kind,
      childId: r.child_id,
      kind: r.kind,
      occurredAt: r.occurred_at,
    }));
  }

  /**
   * Runs fixes (oldest first) through every family fence. State is written with an
   * optimistic check, so with several API instances each transition is recorded once.
   */
  async evaluateForChild(childId: string, childName: string, familyId: string, fixes: TimedFix[]): Promise<void> {
    if (fixes.length === 0) return;
    const fences = await this.db.selectFrom('geofences').selectAll().where('family_id', '=', familyId).execute();
    if (fences.length === 0) return;

    const stateRows = await this.db
      .selectFrom('geofence_states')
      .selectAll()
      .where('child_id', '=', childId)
      .where('geofence_id', 'in', fences.map((f) => f.id))
      .execute();
    const states = new Map(stateRows.map((s) => [s.geofence_id, { inside: s.inside, outsideStreak: s.outside_streak }]));

    for (const fence of fences) {
      const initial: FenceState = states.get(fence.id) ?? { inside: null, outsideStreak: 0 };
      let current = initial;
      const transitions: Array<{ kind: 'enter' | 'exit'; at: Date }> = [];
      for (const fix of fixes) {
        const res = evaluateFence({ lat: fence.lat, lng: fence.lng, radiusM: fence.radius_m }, current, fix);
        current = res.next;
        if (res.transition) transitions.push({ kind: res.transition, at: fix.recordedAt });
      }
      if (current.inside === initial.inside && current.outsideStreak === initial.outsideStreak) continue;

      const written = await this.writeState(fence.id, childId, initial, current, states.has(fence.id));
      if (!written) continue;
      for (const t of transitions) await this.emitTransition(fence, childId, childName, t.kind, t.at);
    }
  }

  private async writeState(fenceId: string, childId: string, prev: FenceState, next: FenceState, existed: boolean): Promise<boolean> {
    if (!existed) {
      const res = await this.db
        .insertInto('geofence_states')
        .values({ geofence_id: fenceId, child_id: childId, inside: next.inside, outside_streak: next.outsideStreak, changed_at: new Date() })
        .onConflict((oc) => oc.columns(['geofence_id', 'child_id']).doNothing())
        .executeTakeFirst();
      return Number(res.numInsertedOrUpdatedRows ?? 0) > 0;
    }
    let q = this.db
      .updateTable('geofence_states')
      .set({ inside: next.inside, outside_streak: next.outsideStreak, changed_at: new Date() })
      .where('geofence_id', '=', fenceId)
      .where('child_id', '=', childId)
      .where('outside_streak', '=', prev.outsideStreak);
    q = prev.inside === null ? q.where('inside', 'is', null) : q.where('inside', '=', prev.inside);
    const res = await q.executeTakeFirst();
    return Number(res.numUpdatedRows) > 0;
  }

  private async emitTransition(fence: Geofence, childId: string, childName: string, kind: 'enter' | 'exit', at: Date): Promise<void> {
    const eventId = uuidv7();
    await this.db
      .insertInto('geofence_events')
      .values({ id: eventId, geofence_id: fence.id, child_id: childId, family_id: fence.family_id, kind, occurred_at: at })
      .execute();
    this.realtime.toFamilyParents(fence.family_id, ServerEvents.GeofenceTransition, {
      id: eventId,
      childId,
      geofenceId: fence.id,
      name: fence.name,
      zoneKind: fence.kind,
      kind,
      at: at.toISOString(),
    });
    const wanted = kind === 'enter' ? fence.notify_enter : fence.notify_exit;
    if (!wanted) return;
    try {
      await this.notifications.enqueue({
        kind: kind === 'enter' ? 'geofence_enter' : 'geofence_exit',
        recipientUserIds: await this.access.parentIds(fence.family_id),
        params: { child: childName, zone: fence.name },
        at: at.toISOString(),
        data: { childId, geofenceId: fence.id, eventId },
      });
    } catch (err) {
      this.logger.error(`Failed to enqueue geofence push: ${String(err)}`);
    }
  }

  /** Decides the starting side for every child from their last known fix, without notifying. */
  private async seedStates(fence: Geofence): Promise<void> {
    const children = await this.db
      .selectFrom('family_members')
      .select('user_id')
      .where('family_id', '=', fence.family_id)
      .where('role', '=', 'child')
      .execute();
    const last = await this.state.getLast(children.map((c) => c.user_id));
    for (const [childId, loc] of last) {
      const res = evaluateFence(
        { lat: fence.lat, lng: fence.lng, radiusM: fence.radius_m },
        { inside: null, outsideStreak: 0 },
        { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy },
      );
      if (res.next.inside === null) continue;
      await this.db
        .insertInto('geofence_states')
        .values({ geofence_id: fence.id, child_id: childId, inside: res.next.inside, outside_streak: 0, changed_at: new Date() })
        .onConflict((oc) => oc.columns(['geofence_id', 'child_id']).doNothing())
        .execute();
    }
  }
}

function toView(g: Geofence): GeofenceView {
  return {
    id: g.id,
    name: g.name,
    kind: g.kind,
    lat: g.lat,
    lng: g.lng,
    radiusM: g.radius_m,
    notifyEnter: g.notify_enter,
    notifyExit: g.notify_exit,
    createdAt: g.created_at,
  };
}
