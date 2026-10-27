import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { sql } from 'kysely';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import { DB } from '../../database/database';
import { dropExpiredLocationPartitions, ensureLocationPartitions } from '../../database/partitions';
import { REDIS } from '../../redis/redis.module';
import { AUDIT_RETENTION_DAYS, MAX_HISTORY_DAYS, PLAN_LIMITS, SOS_RETENTION_DAYS } from '../plans/plans';

const LOCK_KEY = 'lock:retention';

@Injectable()
export class RetentionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @Inject(DB) private readonly db: DB,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await ensureLocationPartitions(this.db);
  }

  @Cron('17 3 * * *', { timeZone: 'Europe/Kyiv' })
  async nightly(): Promise<void> {
    if (this.cfg.RUN_MODE === 'api') return;
    // Only one instance runs the job.
    const locked = await this.redis.set(LOCK_KEY, '1', 'EX', 3600, 'NX');
    if (!locked) return;
    try {
      await this.run();
    } catch (err) {
      this.logger.error(`Retention run failed: ${String(err)}`);
    } finally {
      await this.redis.del(LOCK_KEY);
    }
  }

  async run(now = new Date()): Promise<void> {
    await ensureLocationPartitions(this.db, now);
    const dropped = await dropExpiredLocationPartitions(this.db, MAX_HISTORY_DAYS, now);

    // Per-plan retention inside the live partitions.
    let trimmed = 0;
    for (const [plan, limits] of Object.entries(PLAN_LIMITS)) {
      const res = await sql`
        DELETE FROM locations l
        USING family_members m, families f
        WHERE l.child_id = m.user_id AND m.role = 'child' AND f.id = m.family_id
          AND f.plan = ${plan}
          AND l.recorded_at < ${new Date(now.getTime() - limits.historyDays * 86_400_000)}`.execute(this.db);
      trimmed += Number(res.numAffectedRows ?? 0);
    }

    await this.db.deleteFrom('sos_events').where('created_at', '<', new Date(now.getTime() - SOS_RETENTION_DAYS * 86_400_000)).execute();
    await this.db.deleteFrom('audit_log').where('created_at', '<', new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86_400_000)).execute();
    await this.db.deleteFrom('invites').where('expires_at', '<', now).execute();
    await this.db
      .deleteFrom('refresh_tokens')
      .where((eb) => eb.or([eb('expires_at', '<', now), eb('revoked_at', '<', new Date(now.getTime() - 30 * 86_400_000))]))
      .execute();
    await this.db.deleteFrom('geofence_events').where('occurred_at', '<', new Date(now.getTime() - MAX_HISTORY_DAYS * 86_400_000)).execute();

    this.logger.log(`Retention: dropped partitions [${dropped.join(', ')}], trimmed ${trimmed} location rows`);
  }
}
