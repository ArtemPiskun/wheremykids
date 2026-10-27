import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import { DB } from '../../database/database';
import type { Locale } from '../../database/types';
import { formatTime, renderMessage, type MessageParams, type NotificationKind } from './messages';
import { PUSH_DRIVER, type PushDriver, type PushMessage, type PushPriority } from './push-driver';

export interface PushJob {
  kind: NotificationKind | 'location_request';
  recipientUserIds: string[];
  params: Omit<MessageParams, 'time'>;
  /** Event time; rendered in each recipient's timezone. */
  at: string;
  data: Record<string, string>;
  /** For sos_repeat: only send while this SOS is still unacknowledged. */
  sosId?: string;
}

const QUEUE = 'push';

const ROUTING: Record<PushJob['kind'], { priority: PushPriority; channel: PushMessage['channel'] }> = {
  sos: { priority: 'critical', channel: 'sos' },
  sos_repeat: { priority: 'critical', channel: 'sos' },
  sos_cancelled: { priority: 'high', channel: 'sos' },
  sos_acknowledged: { priority: 'high', channel: 'sos' },
  geofence_enter: { priority: 'high', channel: 'zones' },
  geofence_exit: { priority: 'high', channel: 'zones' },
  child_joined: { priority: 'normal', channel: 'info' },
  child_left: { priority: 'high', channel: 'info' },
  sharing_paused: { priority: 'normal', channel: 'info' },
  sharing_resumed: { priority: 'normal', channel: 'info' },
  parent_joined: { priority: 'normal', channel: 'info' },
  location_request: { priority: 'high', channel: 'info' },
};

export const SOS_REPEAT_DELAY_MS = 60_000;
const SOS_MAX_REPEATS = 5;

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly connection: Redis;
  private readonly queue: Queue<PushJob>;
  private worker: Worker<PushJob> | null = null;
  private workerConnection: Redis | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Inject(DB) private readonly db: DB,
    @Inject(PUSH_DRIVER) private readonly driver: PushDriver,
  ) {
    // BullMQ requires its own connection with maxRetriesPerRequest disabled.
    this.connection = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue<PushJob>(QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    });
  }

  onModuleInit(): void {
    if (this.cfg.RUN_MODE === 'api') return;
    this.workerConnection = this.connection.duplicate();
    this.worker = new Worker<PushJob>(QUEUE, (job) => this.process(job), {
      connection: this.workerConnection,
      concurrency: 20,
    });
    this.worker.on('failed', (job, err) => this.logger.warn(`Push job ${job?.id} failed: ${err.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    // BullMQ does not close connections it was handed.
    await Promise.all([this.connection, this.workerConnection].map((c) => c?.quit().catch(() => c.disconnect())));
  }

  async enqueue(job: PushJob, opts: { delayMs?: number; jobId?: string } = {}): Promise<void> {
    if (job.recipientUserIds.length === 0) return;
    // SOS jobs jump the queue.
    const priority = ROUTING[job.kind].priority === 'critical' ? 1 : 5;
    await this.queue.add(job.kind, job, { priority, delay: opts.delayMs, jobId: opts.jobId });
  }

  scheduleSosRepeat(job: PushJob, attempt: number): Promise<void> {
    return this.enqueue(
      { ...job, kind: 'sos_repeat', data: { ...job.data, attempt: String(attempt) } },
      { delayMs: SOS_REPEAT_DELAY_MS, jobId: `sos-repeat:${job.sosId}:${attempt}` },
    );
  }

  /** Exposed for tests; the worker calls this for each job. */
  async process(job: Pick<Job<PushJob>, 'data'>): Promise<void> {
    const data = job.data;
    if (data.kind === 'sos_repeat' && data.sosId) {
      const sos = await this.db.selectFrom('sos_events').select('status').where('id', '=', data.sosId).executeTakeFirst();
      if (sos?.status !== 'active') return;
    }

    const recipients = await this.db
      .selectFrom('devices as d')
      .innerJoin('users as u', 'u.id', 'd.user_id')
      .select(['d.push_token', 'd.platform', 'u.locale', 'u.timezone'])
      .where('d.user_id', 'in', data.recipientUserIds)
      .where('d.revoked_at', 'is', null)
      .where('d.push_token', 'is not', null)
      .execute();

    const route = ROUTING[data.kind];
    const at = new Date(data.at);
    const messages: PushMessage[] = recipients.map((r) => ({
      token: r.push_token!,
      platform: r.platform,
      notification:
        data.kind === 'location_request'
          ? undefined
          : renderMessage(data.kind, r.locale as Locale, { ...data.params, time: formatTime(at, r.timezone) }),
      data: { type: data.kind, ...data.data },
      priority: route.priority,
      channel: route.channel,
      collapseKey: data.kind === 'location_request' ? 'location_request' : undefined,
    }));

    const result = await this.driver.send(messages);
    if (result.invalidTokens.length) {
      await this.db.updateTable('devices').set({ push_token: null }).where('push_token', 'in', result.invalidTokens).execute();
    }

    if (data.kind === 'sos_repeat' && data.sosId) {
      const attempt = Number(data.data.attempt ?? '1');
      if (attempt < SOS_MAX_REPEATS) await this.scheduleSosRepeat(data, attempt + 1);
    }
  }
}
