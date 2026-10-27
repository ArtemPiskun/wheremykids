import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import { hmacSha256 } from '../../common/crypto';
import { DB } from '../../database/database';

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.refresh_reuse'
  | 'auth.logout'
  | 'invite.created'
  | 'invite.redeemed'
  | 'invite.redeem_failed'
  | 'device.revoked'
  | 'child.created'
  | 'child.deleted'
  | 'child.paused'
  | 'child.left'
  | 'history.viewed'
  | 'data.exported'
  | 'account.deleted'
  | 'family.member_joined'
  | 'sos.raised'
  | 'sos.cancelled'
  | 'sos.acknowledged'
  | 'sos.resolved';

export interface AuditEntry {
  action: AuditAction;
  actorUserId?: string | null;
  actorDeviceId?: string | null;
  targetType?: string;
  targetId?: string;
  ip?: string;
  /** Never put coordinates or secrets here. */
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(DB) private readonly db: DB,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  /** Best effort: an audit write failure is logged but never fails the user's request. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db
        .insertInto('audit_log')
        .values({
          action: entry.action,
          actor_user_id: entry.actorUserId ?? null,
          actor_device_id: entry.actorDeviceId ?? null,
          target_type: entry.targetType ?? null,
          target_id: entry.targetId ?? null,
          ip_hash: entry.ip ? hmacSha256(this.cfg.AUDIT_IP_SALT, entry.ip) : null,
          meta: entry.meta ? JSON.stringify(entry.meta) : null,
        })
        .execute();
    } catch (err) {
      this.logger.error(`Audit write failed for ${entry.action}: ${String(err)}`);
    }
  }
}
