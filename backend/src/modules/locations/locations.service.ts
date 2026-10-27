import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import type { AuthUser } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { simplifyPath } from '../../common/geo';
import { DB } from '../../database/database';
import { AuditService } from '../audit/audit.service';
import { FamilyAccessService } from '../families/family-access.service';
import { GeofencesService, type TimedFix } from '../geofences/geofences.service';
import { NotificationsService } from '../notifications/notifications.service';
import { limitsFor } from '../plans/plans';
import { RealtimeService } from '../realtime/realtime.service';
import { ServerEvents } from '../realtime/rooms';
import { LocationStateStore } from './location-state.store';
import { presenceStatus, type EncryptedFix, type LocationView } from './location.types';
import type { LocationBatchDto, LocationPointDto } from './locations.dto';

const MAX_PAST_MS = 7 * 86_400_000;
const MAX_FUTURE_MS = 5 * 60_000;
const MAX_HISTORY_RANGE_MS = 7 * 86_400_000;
const MAX_HISTORY_POINTS = 5_000;
const SIMPLIFY_EPSILON_M = 10;

export interface IngestResult {
  accepted: number;
  duplicates: number;
  rejected: number;
  paused: boolean;
}

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    @Inject(DB) private readonly db: DB,
    private readonly access: FamilyAccessService,
    private readonly state: LocationStateStore,
    private readonly geofences: GeofencesService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async ingest(user: AuthUser, dto: LocationBatchDto): Promise<IngestResult> {
    const family = await this.access.familyOfChild(user.userId);
    if (!family) throw AppError.forbidden('NOT_IN_FAMILY', 'This device is not connected to a family');
    const child = await this.db
      .selectFrom('users')
      .select(['display_name', 'sharing_paused_until'])
      .where('id', '=', user.userId)
      .executeTakeFirstOrThrow();

    const now = Date.now();
    const paused = !!child.sharing_paused_until && child.sharing_paused_until.getTime() > now;
    let rejected = 0;
    const valid: Array<LocationPointDto & { at: Date }> = [];
    for (const p of dto.points) {
      const at = new Date(p.recordedAt);
      const age = now - at.getTime();
      if (Number.isNaN(at.getTime()) || age > MAX_PAST_MS || age < -MAX_FUTURE_MS) {
        rejected++;
        continue;
      }
      // While paused nothing but SOS is stored: the pause is a promise to the child.
      if (paused && p.source !== 'sos') {
        rejected++;
        continue;
      }
      valid.push({ ...p, at });
    }
    valid.sort((a, b) => a.at.getTime() - b.at.getTime());

    let inserted = 0;
    if (valid.length > 0) {
      const res = await this.db
        .insertInto('locations')
        .values(
          valid.map((p) => {
            const { payload, keyVersion } = this.state.cipher.encrypt(toFix(p), user.userId);
            return {
              child_id: user.userId,
              device_id: user.deviceId,
              client_id: p.clientId,
              recorded_at: p.at,
              payload,
              key_version: keyVersion,
              battery: dto.battery?.level ?? null,
              source: p.source,
              motion: p.motion ?? null,
            };
          }),
        )
        .onConflict((oc) => oc.columns(['child_id', 'client_id', 'recorded_at']).doNothing())
        .executeTakeFirst();
      inserted = Number(res.numInsertedOrUpdatedRows ?? 0);
    }

    await this.db
      .updateTable('devices')
      .set({
        last_seen_at: new Date(),
        ...(dto.battery && { battery_level: dto.battery.level, is_charging: dto.battery.charging ?? null }),
      })
      .where('id', '=', user.deviceId)
      .execute();
    const prevSeen = await this.state.touchPresence(user.userId, dto.battery);

    const prevLastAt = await this.state.lastRecordedAt(user.userId);
    const fresh = valid.filter((p) => prevLastAt === null || p.at.getTime() > prevLastAt);
    const newest = fresh.at(-1);
    if (newest) {
      const meta = { source: newest.source, motion: newest.motion ?? null, battery: dto.battery?.level ?? null };
      if (await this.state.setLastIfNewer(user.userId, newest.at, toFix(newest), meta)) {
        this.realtime.toFamilyParents(family.familyId, ServerEvents.LocationUpdated, {
          childId: user.userId,
          ...toView(newest, dto.battery?.level ?? null),
        });
      }
      try {
        await this.geofences.evaluateForChild(
          user.userId,
          child.display_name,
          family.familyId,
          fresh.map<TimedFix>((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, recordedAt: p.at })),
        );
      } catch (err) {
        // Geofencing must never cause the device to re-upload (and duplicate) its batch.
        this.logger.error(`Geofence evaluation failed for ${user.userId}: ${String(err)}`);
      }
    }

    if (presenceStatus(prevSeen, now) !== 'online') {
      this.realtime.toFamilyParents(family.familyId, ServerEvents.ChildPresence, {
        childId: user.userId,
        status: paused ? 'paused' : 'online',
        lastSeenAt: new Date(now).toISOString(),
        battery: dto.battery?.level ?? null,
      });
    }

    return { accepted: inserted, duplicates: valid.length - inserted, rejected, paused };
  }

  async latestForFamily(user: AuthUser, familyId: string) {
    await this.access.assertParentIn(user.userId, familyId);
    const children = await this.db
      .selectFrom('family_members as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select(['u.id', 'u.sharing_paused_until'])
      .where('m.family_id', '=', familyId)
      .where('m.role', '=', 'child')
      .execute();
    const ids = children.map((c) => c.id);
    const [last, presence] = await Promise.all([this.state.getLast(ids), this.state.getPresence(ids)]);
    const now = Date.now();
    return children.map((c) => {
      const p = presence.get(c.id);
      return {
        childId: c.id,
        status: presenceStatus(p?.lastSeenMs ?? null, now, c.sharing_paused_until),
        lastSeenAt: p?.lastSeenMs ? new Date(p.lastSeenMs).toISOString() : null,
        battery: p?.battery ?? null,
        charging: p?.charging ?? null,
        sharingPausedUntil: c.sharing_paused_until,
        location: last.get(c.id) ?? null,
      };
    });
  }

  async history(user: AuthUser, childId: string, from: Date, to: Date, simplify: boolean, ip?: string) {
    const { plan } = await this.access.assertParentOf(user.userId, childId);
    if (to <= from) throw AppError.badRequest('INVALID_RANGE', '`to` must be after `from`');
    if (to.getTime() - from.getTime() > MAX_HISTORY_RANGE_MS) {
      throw AppError.badRequest('RANGE_TOO_LARGE', 'History range is limited to 7 days per request');
    }
    // Plan retention is enforced on read too, so data awaiting nightly cleanup never leaks.
    const floor = new Date(Date.now() - limitsFor(plan).historyDays * 86_400_000);
    const effectiveFrom = from < floor ? floor : from;

    const rows = await this.db
      .selectFrom('locations')
      .select(['recorded_at', 'payload', 'key_version', 'source', 'motion', 'battery'])
      .where('child_id', '=', childId)
      .where('recorded_at', '>=', effectiveFrom)
      .where('recorded_at', '<=', to)
      .orderBy('recorded_at', 'asc')
      .limit(MAX_HISTORY_POINTS + 1)
      .execute();

    const truncated = rows.length > MAX_HISTORY_POINTS;
    const points: LocationView[] = rows.slice(0, MAX_HISTORY_POINTS).map((r) => {
      const fix = this.state.cipher.decrypt<EncryptedFix>(r.payload, r.key_version, childId);
      return {
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.acc,
        speed: fix.spd,
        heading: fix.hdg,
        recordedAt: r.recorded_at.toISOString(),
        source: r.source,
        motion: r.motion,
        battery: r.battery,
      };
    });
    const result = simplify ? simplifyPath(points, SIMPLIFY_EPSILON_M, (p) => p.source === 'sos') : points;

    await this.audit.record({
      action: 'history.viewed',
      actorUserId: user.userId,
      actorDeviceId: user.deviceId,
      targetType: 'child',
      targetId: childId,
      ip,
      meta: { from: effectiveFrom.toISOString(), to: to.toISOString() },
    });
    return { childId, from: effectiveFrom.toISOString(), to: to.toISOString(), truncated, historyDays: limitsFor(plan).historyDays, points: result };
  }

  /** Asks the child's devices for a fresh fix, over the socket and as a data-only push. */
  async requestFreshLocation(user: AuthUser, childId: string): Promise<void> {
    await this.access.assertParentOf(user.userId, childId);
    const requestId = crypto.randomUUID();
    this.realtime.toChild(childId, ServerEvents.LocationRequest, { requestId, reason: 'parent' });
    await this.notifications.enqueue({
      kind: 'location_request',
      recipientUserIds: [childId],
      params: {},
      at: new Date().toISOString(),
      data: { requestId },
    });
  }

  /** Last N minutes of a child's route, used for the SOS screen. */
  async recentRoute(childId: string, minutes: number): Promise<LocationView[]> {
    const rows = await this.db
      .selectFrom('locations')
      .select(['recorded_at', 'payload', 'key_version', 'source'])
      .where('child_id', '=', childId)
      .where('recorded_at', '>=', sql<Date>`now() - make_interval(mins => ${minutes})`)
      .orderBy('recorded_at', 'asc')
      .limit(500)
      .execute();
    return simplifyPath(
      rows.map((r) => {
        const fix = this.state.cipher.decrypt<EncryptedFix>(r.payload, r.key_version, childId);
        return { lat: fix.lat, lng: fix.lng, accuracy: fix.acc, recordedAt: r.recorded_at.toISOString(), source: r.source };
      }),
      SIMPLIFY_EPSILON_M,
    );
  }
}

function toFix(p: LocationPointDto): EncryptedFix {
  return {
    lat: p.lat,
    lng: p.lng,
    acc: p.accuracy,
    ...(p.speed !== undefined && { spd: p.speed }),
    ...(p.heading !== undefined && { hdg: p.heading }),
    ...(p.altitude !== undefined && { alt: p.altitude }),
  };
}

function toView(p: LocationPointDto & { at: Date }, battery: number | null): LocationView {
  return {
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    speed: p.speed,
    heading: p.heading,
    recordedAt: p.at.toISOString(),
    source: p.source,
    motion: p.motion ?? null,
    battery,
  };
}
