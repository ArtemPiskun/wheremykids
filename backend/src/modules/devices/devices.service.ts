import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Kysely, Transaction } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import { revokedDeviceKey, type AuthUser } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { DB } from '../../database/database';
import type { Database, Device } from '../../database/types';
import { REDIS } from '../../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { FamilyAccessService } from '../families/family-access.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { DeviceInfoDto, UpdateCurrentDeviceDto } from './devices.dto';

type Executor = Kysely<Database> | Transaction<Database>;

export interface DeviceView {
  id: string;
  userId: string;
  platform: string;
  model: string | null;
  appVersion: string | null;
  batteryLevel: number | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  current: boolean;
}

@Injectable()
export class DevicesService {
  constructor(
    @Inject(DB) private readonly db: DB,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly access: FamilyAccessService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  async create(trx: Executor, userId: string, info: DeviceInfoDto): Promise<string> {
    const id = uuidv7();
    if (info.pushToken) await this.releasePushToken(trx, info.pushToken);
    await trx
      .insertInto('devices')
      .values({
        id,
        user_id: userId,
        platform: info.platform,
        model: info.model ?? null,
        os_version: info.osVersion ?? null,
        app_version: info.appVersion ?? null,
        push_token: info.pushToken ?? null,
        last_seen_at: new Date(),
      })
      .execute();
    return id;
  }

  async updateCurrent(user: AuthUser, dto: UpdateCurrentDeviceDto): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      if (dto.pushToken) await this.releasePushToken(trx, dto.pushToken, user.deviceId);
      await trx
        .updateTable('devices')
        .set({
          ...(dto.pushToken !== undefined && { push_token: dto.pushToken }),
          ...(dto.appVersion !== undefined && { app_version: dto.appVersion }),
          ...(dto.osVersion !== undefined && { os_version: dto.osVersion }),
          ...(dto.battery && { battery_level: dto.battery.level, is_charging: dto.battery.charging ?? null }),
          last_seen_at: new Date(),
        })
        .where('id', '=', user.deviceId)
        .where('revoked_at', 'is', null)
        .execute();
    });
  }

  /** Devices of the caller and of every child in the caller's families. */
  async listVisible(user: AuthUser): Promise<DeviceView[]> {
    const childIds = await this.access.childIdsVisibleTo(user.userId);
    const rows = await this.db
      .selectFrom('devices')
      .selectAll()
      .where('user_id', 'in', [user.userId, ...childIds])
      .where('revoked_at', 'is', null)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((d) => this.toView(d, user.deviceId));
  }

  async revokeAsParent(user: AuthUser, deviceId: string, ip?: string): Promise<void> {
    const device = await this.db.selectFrom('devices').selectAll().where('id', '=', deviceId).executeTakeFirst();
    if (!device || device.revoked_at) throw AppError.notFound('DEVICE_NOT_FOUND', 'Device not found');
    if (device.user_id !== user.userId) await this.access.assertParentOf(user.userId, device.user_id);
    await this.revoke(this.db, deviceId);
    await this.audit.record({
      action: 'device.revoked',
      actorUserId: user.userId,
      actorDeviceId: user.deviceId,
      targetType: 'device',
      targetId: deviceId,
      ip,
    });
  }

  /** Revokes the device, all its refresh tokens, and cuts its live sockets. */
  async revoke(executor: Executor, deviceId: string): Promise<void> {
    const now = new Date();
    await executor
      .updateTable('devices')
      .set({ revoked_at: now, push_token: null })
      .where('id', '=', deviceId)
      .where('revoked_at', 'is', null)
      .execute();
    await executor
      .updateTable('refresh_tokens')
      .set({ revoked_at: now })
      .where('device_id', '=', deviceId)
      .where('revoked_at', 'is', null)
      .execute();
    await this.redis.set(revokedDeviceKey(deviceId), '1', 'EX', this.cfg.JWT_ACCESS_TTL_SEC + 60);
    await this.realtime.disconnectDevice(deviceId);
  }

  async revokeAllForUser(executor: Executor, userId: string): Promise<void> {
    const devices = await executor
      .selectFrom('devices')
      .select('id')
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
    for (const d of devices) await this.revoke(executor, d.id);
  }

  /** A push token belongs to one live device; reinstalling the app must not duplicate pushes. */
  private async releasePushToken(executor: Executor, token: string, exceptDeviceId?: string): Promise<void> {
    let q = executor.updateTable('devices').set({ push_token: null }).where('push_token', '=', token);
    if (exceptDeviceId) q = q.where('id', '!=', exceptDeviceId);
    await q.execute();
  }

  private toView(d: Device, currentDeviceId: string): DeviceView {
    return {
      id: d.id,
      userId: d.user_id,
      platform: d.platform,
      model: d.model,
      appVersion: d.app_version,
      batteryLevel: d.battery_level,
      lastSeenAt: d.last_seen_at,
      createdAt: d.created_at,
      current: d.id === currentDeviceId,
    };
  }
}
