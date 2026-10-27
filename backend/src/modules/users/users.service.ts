import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { DB } from '../../database/database';
import { AuditService } from '../audit/audit.service';
import { DevicesService } from '../devices/devices.service';
import { FamilyAccessService } from '../families/family-access.service';
import { LocationStateStore } from '../locations/location-state.store';
import type { EncryptedFix } from '../locations/location.types';
import { NotificationsService } from '../notifications/notifications.service';
import { limitsFor } from '../plans/plans';
import { RealtimeService } from '../realtime/realtime.service';
import { ServerEvents } from '../realtime/rooms';
import type { UpdateMeDto } from './users.dto';

/** Age from which a child may pause sharing on their own (partial civil capacity in Ukraine). */
export const SELF_PAUSE_MIN_AGE = 14;

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: DB,
    private readonly access: FamilyAccessService,
    private readonly devices: DevicesService,
    private readonly state: LocationStateStore,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async me(user: AuthUser) {
    const u = await this.db
      .selectFrom('users')
      .select(['id', 'role', 'email', 'display_name', 'avatar', 'locale', 'timezone', 'created_at'])
      .where('id', '=', user.userId)
      .executeTakeFirst();
    if (!u) throw AppError.unauthorized();
    const families = await this.db
      .selectFrom('family_members as m')
      .innerJoin('families as f', 'f.id', 'm.family_id')
      .select(['f.id', 'f.name', 'f.plan', 'm.role'])
      .where('m.user_id', '=', user.userId)
      .execute();
    return {
      id: u.id,
      role: u.role,
      email: u.email,
      displayName: u.display_name,
      avatar: u.avatar,
      locale: u.locale,
      timezone: u.timezone,
      createdAt: u.created_at,
      deviceId: user.deviceId,
      families: families.map((f) => ({ id: f.id, name: f.name, plan: f.plan, role: f.role })),
    };
  }

  async updateMe(user: AuthUser, dto: UpdateMeDto) {
    if (dto.timezone && !isValidTimezone(dto.timezone)) throw AppError.badRequest('INVALID_TIMEZONE', 'Unknown timezone');
    // Children's names are managed by their parents.
    if (user.role === 'child' && dto.displayName) throw AppError.forbidden('PARENT_MANAGED', 'Ask a parent to change your name');
    await this.db
      .updateTable('users')
      .set({
        ...(dto.displayName !== undefined && { display_name: dto.displayName }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        updated_at: new Date(),
      })
      .where('id', '=', user.userId)
      .execute();
    return this.me(user);
  }

  /** GDPR Art. 15/20: everything we hold about the parent and the children they manage. */
  async export(user: AuthUser, ip?: string) {
    const profile = await this.me(user);
    const familyIds = await this.access.parentFamilyIds(user.userId);
    const families = [];
    for (const familyId of familyIds) {
      const family = await this.db.selectFrom('families').selectAll().where('id', '=', familyId).executeTakeFirstOrThrow();
      const members = await this.db
        .selectFrom('family_members as m')
        .innerJoin('users as u', 'u.id', 'm.user_id')
        .select(['u.id', 'u.display_name', 'u.birth_year', 'u.avatar', 'u.phone', 'm.role', 'm.joined_at'])
        .where('m.family_id', '=', familyId)
        .execute();
      const childIds = members.filter((m) => m.role === 'child').map((m) => m.id);
      const since = new Date(Date.now() - limitsFor(family.plan).historyDays * 86_400_000);
      const children = [];
      for (const childId of childIds) {
        const rows = await this.db
          .selectFrom('locations')
          .select(['recorded_at', 'payload', 'key_version', 'source', 'battery'])
          .where('child_id', '=', childId)
          .where('recorded_at', '>=', since)
          .orderBy('recorded_at')
          .execute();
        const sos = await this.db.selectFrom('sos_events').selectAll().where('child_id', '=', childId).execute();
        const profile = members.find((m) => m.id === childId)!;
        children.push({
          id: childId,
          displayName: profile.display_name,
          birthYear: profile.birth_year,
          avatar: profile.avatar,
          phone: profile.phone,
          joinedAt: profile.joined_at,
          locations: rows.map((r) => ({
            ...this.state.cipher.decrypt<EncryptedFix>(r.payload, r.key_version, childId),
            recordedAt: r.recorded_at,
            source: r.source,
            battery: r.battery,
          })),
          sosEvents: sos.map((s) => ({
            id: s.id,
            status: s.status,
            createdAt: s.created_at,
            acknowledgedAt: s.acknowledged_at,
            closedAt: s.closed_at,
            battery: s.battery,
            location: s.payload && s.key_version ? this.state.cipher.decrypt<EncryptedFix>(s.payload, s.key_version, childId) : null,
          })),
          consents: await this.db.selectFrom('consents').select(['kind', 'version', 'granted_at', 'revoked_at']).where('user_id', '=', childId).execute(),
          devices: await this.db
            .selectFrom('devices')
            .select(['id', 'platform', 'model', 'app_version', 'created_at', 'last_seen_at', 'revoked_at'])
            .where('user_id', '=', childId)
            .execute(),
        });
      }
      families.push({
        id: family.id,
        name: family.name,
        plan: family.plan,
        createdAt: family.created_at,
        members: members.map((m) => ({ id: m.id, displayName: m.display_name, role: m.role, joinedAt: m.joined_at })),
        geofences: await this.db.selectFrom('geofences').selectAll().where('family_id', '=', familyId).execute(),
        geofenceEvents: await this.db.selectFrom('geofence_events').selectAll().where('family_id', '=', familyId).execute(),
        children,
      });
    }
    const myDevices = await this.db
      .selectFrom('devices')
      .select(['id', 'platform', 'model', 'app_version', 'created_at', 'last_seen_at', 'revoked_at'])
      .where('user_id', '=', user.userId)
      .execute();
    const consents = await this.db.selectFrom('consents').select(['kind', 'version', 'granted_at', 'revoked_at']).where('user_id', '=', user.userId).execute();
    const activity = await this.db
      .selectFrom('audit_log')
      .select(['action', 'target_type', 'target_id', 'created_at'])
      .where('actor_user_id', '=', user.userId)
      .orderBy('created_at', 'desc')
      .limit(1000)
      .execute();

    await this.audit.record({ action: 'data.exported', actorUserId: user.userId, actorDeviceId: user.deviceId, ip });
    return { exportedAt: new Date().toISOString(), format: 'de-moi-dity-export/1', profile, devices: myDevices, consents, activity, families };
  }

  /**
   * Erases the parent. Families they own are erased with every child, location and event in them;
   * in other families only their membership is removed.
   */
  async deleteAccount(user: AuthUser, ip?: string): Promise<void> {
    const owned = await this.db.selectFrom('families').select('id').where('owner_id', '=', user.userId).execute();
    const childIds: string[] = [];
    await this.db.transaction().execute(async (trx) => {
      for (const { id } of owned) {
        const children = await trx.selectFrom('family_members').select('user_id').where('family_id', '=', id).where('role', '=', 'child').execute();
        for (const c of children) {
          await this.devices.revokeAllForUser(trx, c.user_id);
          childIds.push(c.user_id);
        }
        if (children.length) await trx.deleteFrom('users').where('id', 'in', children.map((c) => c.user_id)).execute();
        await trx.deleteFrom('families').where('id', '=', id).execute();
      }
      await this.devices.revokeAllForUser(trx, user.userId);
      await trx.deleteFrom('users').where('id', '=', user.userId).execute();
    });
    for (const id of childIds) await this.state.clear(id);
    await this.realtime.disconnectUser(user.userId);
    await this.audit.record({ action: 'account.deleted', actorUserId: user.userId, ip, meta: { familiesErased: owned.length, childrenErased: childIds.length } });
  }

  // ---- Child-side endpoints ----

  async childMe(user: AuthUser) {
    const child = await this.db
      .selectFrom('users')
      .select(['id', 'display_name', 'avatar', 'birth_year', 'sharing_paused_until', 'locale'])
      .where('id', '=', user.userId)
      .executeTakeFirstOrThrow();
    const family = await this.access.familyOfChild(user.userId);
    const parents = family
      ? await this.db
          .selectFrom('family_members as m')
          .innerJoin('users as u', 'u.id', 'm.user_id')
          .select(['u.id', 'u.display_name', 'm.role'])
          .where('m.family_id', '=', family.familyId)
          .where('m.role', 'in', ['owner', 'parent'])
          .execute()
      : [];
    const familyName = family
      ? (await this.db.selectFrom('families').select('name').where('id', '=', family.familyId).executeTakeFirstOrThrow()).name
      : null;
    return {
      id: child.id,
      displayName: child.display_name,
      avatar: child.avatar,
      locale: child.locale,
      family: family ? { id: family.familyId, name: familyName } : null,
      // Shown on the child's home screen: who can see this phone's location.
      parents: parents.map((p) => ({ id: p.id, displayName: p.display_name })),
      sharingPausedUntil: child.sharing_paused_until,
      canPause: this.canSelfPause(child.birth_year),
      pauseMaxMinutes: 480,
    };
  }

  async pauseSharing(user: AuthUser, minutes: number, ip?: string) {
    const child = await this.db.selectFrom('users').select(['display_name', 'birth_year']).where('id', '=', user.userId).executeTakeFirstOrThrow();
    if (!this.canSelfPause(child.birth_year)) {
      throw AppError.forbidden('PAUSE_NOT_ALLOWED', 'Pausing is available from 14 years old; you can always leave the family');
    }
    const family = await this.requireFamily(user.userId);
    const until = new Date(Date.now() + minutes * 60_000);
    await this.db.updateTable('users').set({ sharing_paused_until: until, updated_at: new Date() }).where('id', '=', user.userId).execute();
    this.realtime.toFamilyParents(family, ServerEvents.SharingChanged, { childId: user.userId, paused: true, until: until.toISOString() });
    await this.notifications.enqueue({
      kind: 'sharing_paused',
      recipientUserIds: await this.access.parentIds(family),
      params: { child: child.display_name },
      at: until.toISOString(),
      data: { childId: user.userId },
    });
    await this.audit.record({ action: 'child.paused', actorUserId: user.userId, actorDeviceId: user.deviceId, ip, meta: { minutes } });
    return { sharingPausedUntil: until.toISOString() };
  }

  async resumeSharing(user: AuthUser) {
    const family = await this.requireFamily(user.userId);
    const child = await this.db
      .updateTable('users')
      .set({ sharing_paused_until: null, updated_at: new Date() })
      .where('id', '=', user.userId)
      .returning('display_name')
      .executeTakeFirstOrThrow();
    this.realtime.toFamilyParents(family, ServerEvents.SharingChanged, { childId: user.userId, paused: false, until: null });
    await this.notifications.enqueue({
      kind: 'sharing_resumed',
      recipientUserIds: await this.access.parentIds(family),
      params: { child: child.display_name },
      at: new Date().toISOString(),
      data: { childId: user.userId },
    });
    return { sharingPausedUntil: null };
  }

  /**
   * Withdrawal of consent. Always available, at any age: the child's devices are signed out
   * and stored history is erased. The profile stays so a parent can invite again, which needs fresh consent.
   */
  async leaveFamily(user: AuthUser, ip?: string): Promise<void> {
    const family = await this.requireFamily(user.userId);
    const child = await this.db.selectFrom('users').select('display_name').where('id', '=', user.userId).executeTakeFirstOrThrow();
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('locations').where('child_id', '=', user.userId).execute();
      await trx.deleteFrom('geofence_states').where('child_id', '=', user.userId).execute();
      await trx.updateTable('consents').set({ revoked_at: new Date() }).where('user_id', '=', user.userId).where('revoked_at', 'is', null).execute();
      await trx.updateTable('users').set({ sharing_paused_until: null }).where('id', '=', user.userId).execute();
      await this.devices.revokeAllForUser(trx, user.userId);
    });
    await this.state.clear(user.userId);
    this.realtime.toFamilyParents(family, ServerEvents.ChildLeft, { childId: user.userId });
    await this.notifications.enqueue({
      kind: 'child_left',
      recipientUserIds: await this.access.parentIds(family),
      params: { child: child.display_name },
      at: new Date().toISOString(),
      data: { childId: user.userId },
    });
    await this.audit.record({ action: 'child.left', actorUserId: user.userId, actorDeviceId: user.deviceId, ip });
  }

  private canSelfPause(birthYear: number | null): boolean {
    return birthYear !== null && new Date().getUTCFullYear() - birthYear >= SELF_PAUSE_MIN_AGE;
  }

  private async requireFamily(childId: string): Promise<string> {
    const family = await this.access.familyOfChild(childId);
    if (!family) throw AppError.forbidden('NOT_IN_FAMILY', 'This device is not connected to a family');
    return family.familyId;
  }
}
