import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import { FieldCipher } from '../../common/crypto';
import { REDIS } from '../../redis/redis.module';
import type { LocationSource } from '../../database/types';
import type { EncryptedFix, LocationView } from './location.types';

const LAST_TTL_SEC = 30 * 86_400;
const PRESENCE_TTL_SEC = 7 * 86_400;

// Atomic "set if newer": out-of-order uploads from an offline queue never move the pin backwards.
const SET_IF_NEWER = `
local cur = redis.call('HGET', KEYS[1], 't')
if cur and tonumber(cur) >= tonumber(ARGV[1]) then return 0 end
redis.call('HSET', KEYS[1], 't', ARGV[1], 'p', ARGV[2], 'v', ARGV[3], 'm', ARGV[4])
redis.call('EXPIRE', KEYS[1], ARGV[5])
return 1`;

export interface PresenceSnapshot {
  lastSeenMs: number | null;
  battery: number | null;
  charging: boolean | null;
}

interface LastMeta {
  source: LocationSource;
  motion: string | null;
  battery: number | null;
}

/** Hot state in Redis: each child's last location (encrypted) and presence. */
@Injectable()
export class LocationStateStore {
  readonly cipher: FieldCipher;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) cfg: AppConfig,
  ) {
    this.cipher = new FieldCipher(cfg.LOCATION_ENC_KEYS, cfg.LOCATION_ENC_ACTIVE_KEY);
  }

  async setLastIfNewer(childId: string, recordedAt: Date, fix: EncryptedFix, meta: LastMeta): Promise<boolean> {
    const { payload, keyVersion } = this.cipher.encrypt(fix, childId);
    const res = await this.redis.eval(
      SET_IF_NEWER,
      1,
      `loc:last:${childId}`,
      String(recordedAt.getTime()),
      payload.toString('base64'),
      String(keyVersion),
      JSON.stringify(meta),
      String(LAST_TTL_SEC),
    );
    return res === 1;
  }

  async lastRecordedAt(childId: string): Promise<number | null> {
    const t = await this.redis.hget(`loc:last:${childId}`, 't');
    return t ? Number(t) : null;
  }

  async getLast(childIds: string[]): Promise<Map<string, LocationView>> {
    const result = new Map<string, LocationView>();
    if (childIds.length === 0) return result;
    const pipeline = this.redis.pipeline();
    for (const id of childIds) pipeline.hgetall(`loc:last:${id}`);
    const replies = (await pipeline.exec()) ?? [];
    replies.forEach(([err, raw], i) => {
      const h = raw as Record<string, string> | null;
      if (err || !h?.t) return;
      const fix = this.cipher.decrypt<EncryptedFix>(Buffer.from(h.p, 'base64'), Number(h.v), childIds[i]);
      const meta = JSON.parse(h.m) as LastMeta;
      result.set(childIds[i], {
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.acc,
        speed: fix.spd,
        heading: fix.hdg,
        recordedAt: new Date(Number(h.t)).toISOString(),
        source: meta.source,
        motion: meta.motion,
        battery: meta.battery,
      });
    });
    return result;
  }

  async clear(childId: string): Promise<void> {
    await this.redis.del(`loc:last:${childId}`, `presence:${childId}`);
  }

  /** Returns the previous lastSeen so callers can detect offline → online transitions. */
  async touchPresence(childId: string, battery?: { level: number; charging?: boolean }): Promise<number | null> {
    const key = `presence:${childId}`;
    const now = Date.now();
    const multi = this.redis.multi().hget(key, 't').hset(key, 't', String(now));
    if (battery) multi.hset(key, 'b', String(battery.level), 'c', battery.charging ? '1' : '0');
    multi.expire(key, PRESENCE_TTL_SEC);
    const res = await multi.exec();
    const prev = res?.[0]?.[1] as string | null;
    return prev ? Number(prev) : null;
  }

  async getPresence(childIds: string[]): Promise<Map<string, PresenceSnapshot>> {
    const result = new Map<string, PresenceSnapshot>();
    if (childIds.length === 0) return result;
    const pipeline = this.redis.pipeline();
    for (const id of childIds) pipeline.hmget(`presence:${id}`, 't', 'b', 'c');
    const replies = (await pipeline.exec()) ?? [];
    replies.forEach(([err, raw], i) => {
      const [t, b, c] = (err ? [null, null, null] : raw) as [string | null, string | null, string | null];
      result.set(childIds[i], {
        lastSeenMs: t ? Number(t) : null,
        battery: b ? Number(b) : null,
        charging: c === null ? null : c === '1',
      });
    });
    return result;
  }
}
