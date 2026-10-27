import { Inject, Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import type { AuthUser } from '../../common/auth-context';
import { formatInviteCode, generateInviteCode, hmacSha256, normalizeInviteCode } from '../../common/crypto';
import { AppError } from '../../common/errors';
import { RateLimitService } from '../../common/rate-limit';
import { DB } from '../../database/database';
import { AuditService } from '../audit/audit.service';
import { DevicesService } from '../devices/devices.service';
import { FamilyAccessService } from '../families/family-access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { limitsFor } from '../plans/plans';
import { RealtimeService } from '../realtime/realtime.service';
import { ServerEvents } from '../realtime/rooms';
import { TokensService } from '../auth/tokens.service';
import type { RedeemInviteDto } from './invites.dto';

const INVITE_TTL_MS = 24 * 3_600_000;
/** Above this many failed redeems per minute across all clients we stop accepting codes for a while. */
const GLOBAL_FAILURE_LIMIT = 500;
export const INVITE_DEEP_LINK = 'demoidity://invite';

export interface InviteView {
  code: string;
  qrPayload: string;
  expiresAt: string;
}

@Injectable()
export class InvitesService {
  constructor(
    @Inject(DB) private readonly db: DB,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly access: FamilyAccessService,
    private readonly tokens: TokensService,
    private readonly devices: DevicesService,
    private readonly limiter: RateLimitService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async createChildInvite(user: AuthUser, familyId: string, childId: string, ip?: string): Promise<InviteView> {
    const { familyId: actual } = await this.access.assertParentOf(user.userId, childId);
    if (actual !== familyId) throw AppError.notFound('CHILD_NOT_FOUND', 'Child not found');
    return this.createInvite(user, familyId, 'child', childId, ip);
  }

  async createParentInvite(user: AuthUser, familyId: string, ip?: string): Promise<InviteView> {
    await this.access.assertOwner(user.userId, familyId);
    return this.createInvite(user, familyId, 'parent', null, ip);
  }

  async redeemChildInvite(dto: RedeemInviteDto, ip: string) {
    const invite = await this.lookup(dto.code, 'child', ip);
    const childId = invite.child_id!;

    const result = await this.db.transaction().execute(async (trx) => {
      // Single use, enforced atomically: two phones racing with the same code cannot both win.
      const claimed = await trx
        .updateTable('invites')
        .set({ used_at: new Date(), used_by_user: childId })
        .where('id', '=', invite.id)
        .where('used_at', 'is', null)
        .returning('id')
        .executeTakeFirst();
      if (!claimed) throw AppError.badRequest('INVITE_INVALID', 'This code is invalid or expired');

      const deviceId = await this.devices.create(trx, childId, dto.device);
      await trx
        .insertInto('consents')
        .values({ id: uuidv7(), user_id: childId, kind: 'location_tracking', version: dto.consent.version, granted_by: childId })
        .execute();
      await trx
        .insertInto('consents')
        .values({ id: uuidv7(), user_id: childId, kind: 'parental', version: dto.consent.version, granted_by: invite.created_by })
        .execute();
      const pair = await this.tokens.issue(trx, childId, 'child', deviceId);
      return { pair, deviceId };
    });

    const child = await this.db.selectFrom('users').select(['display_name', 'avatar']).where('id', '=', childId).executeTakeFirstOrThrow();
    const parentIds = await this.access.parentIds(invite.family_id);
    this.realtime.toFamilyParents(invite.family_id, ServerEvents.ChildJoined, { childId, deviceId: result.deviceId });
    await this.notifications.enqueue({
      kind: 'child_joined',
      recipientUserIds: parentIds,
      params: { child: child.display_name },
      at: new Date().toISOString(),
      data: { childId },
    });
    await this.audit.record({
      action: 'invite.redeemed',
      actorUserId: childId,
      actorDeviceId: result.deviceId,
      targetType: 'invite',
      targetId: invite.id,
      ip,
    });

    return {
      ...result.pair,
      deviceId: result.deviceId,
      user: { id: childId, role: 'child' as const, displayName: child.display_name, avatar: child.avatar },
      familyId: invite.family_id,
    };
  }

  async acceptParentInvite(user: AuthUser, code: string, ip: string) {
    const invite = await this.lookup(code, 'parent', ip);
    await this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('family_members')
        .select('role')
        .where('family_id', '=', invite.family_id)
        .where('user_id', '=', user.userId)
        .executeTakeFirst();
      if (existing) throw AppError.conflict('ALREADY_MEMBER', 'You are already in this family');

      const family = await trx.selectFrom('families').select('plan').where('id', '=', invite.family_id).forUpdate().executeTakeFirstOrThrow();
      const { count } = await trx
        .selectFrom('family_members')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('family_id', '=', invite.family_id)
        .where('role', 'in', ['owner', 'parent'])
        .executeTakeFirstOrThrow();
      const limit = limitsFor(family.plan).maxParents;
      if (Number(count) >= limit) throw AppError.planLimit('Parent limit reached for the current plan', { limit });

      const claimed = await trx
        .updateTable('invites')
        .set({ used_at: new Date(), used_by_user: user.userId })
        .where('id', '=', invite.id)
        .where('used_at', 'is', null)
        .returning('id')
        .executeTakeFirst();
      if (!claimed) throw AppError.badRequest('INVITE_INVALID', 'This code is invalid or expired');
      await trx.insertInto('family_members').values({ family_id: invite.family_id, user_id: user.userId, role: 'parent' }).execute();
    });

    await this.realtime.joinFamilyRoom(user.userId, invite.family_id);
    const me = await this.db.selectFrom('users').select('display_name').where('id', '=', user.userId).executeTakeFirstOrThrow();
    const others = (await this.access.parentIds(invite.family_id)).filter((id) => id !== user.userId);
    await this.notifications.enqueue({
      kind: 'parent_joined',
      recipientUserIds: others,
      params: { parent: me.display_name },
      at: new Date().toISOString(),
      data: { familyId: invite.family_id },
    });
    await this.audit.record({ action: 'family.member_joined', actorUserId: user.userId, targetType: 'family', targetId: invite.family_id, ip });
    return { familyId: invite.family_id };
  }

  private async createInvite(user: AuthUser, familyId: string, kind: 'child' | 'parent', childId: string | null, ip?: string): Promise<InviteView> {
    const code = generateInviteCode();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.db.transaction().execute(async (trx) => {
      // A fresh code supersedes older unused ones, so a code read off a lost screenshot stops working.
      let stale = trx.deleteFrom('invites').where('family_id', '=', familyId).where('kind', '=', kind).where('used_at', 'is', null);
      stale = childId ? stale.where('child_id', '=', childId) : stale;
      await stale.execute();
      await trx
        .insertInto('invites')
        .values({
          id: uuidv7(),
          kind,
          family_id: familyId,
          child_id: childId,
          code_hash: this.hashCode(code),
          created_by: user.userId,
          expires_at: expiresAt,
        })
        .execute();
    });
    await this.audit.record({
      action: 'invite.created',
      actorUserId: user.userId,
      targetType: kind === 'child' ? 'child' : 'family',
      targetId: childId ?? familyId,
      ip,
      meta: { kind },
    });
    return {
      code: formatInviteCode(code),
      qrPayload: `${INVITE_DEEP_LINK}?c=${code}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async lookup(rawCode: string, kind: 'child' | 'parent', ip: string) {
    if ((await this.limiter.count('invite:fail:global', 60)) > GLOBAL_FAILURE_LIMIT) {
      throw AppError.tooManyRequests(60);
    }
    const code = normalizeInviteCode(rawCode);
    const invite = code
      ? await this.db
          .selectFrom('invites')
          .selectAll()
          .where('code_hash', '=', this.hashCode(code))
          .where('kind', '=', kind)
          .where('used_at', 'is', null)
          .where('expires_at', '>', new Date())
          .executeTakeFirst()
      : undefined;
    if (!invite) {
      await this.limiter.consume('invite:fail:global', Number.MAX_SAFE_INTEGER, 60);
      await this.audit.record({ action: 'invite.redeem_failed', ip, meta: { kind } });
      // One generic error for unknown, used and expired codes: nothing to learn from the response.
      throw AppError.badRequest('INVITE_INVALID', 'This code is invalid or expired');
    }
    return invite;
  }

  private hashCode(code: string): Buffer {
    return hmacSha256(this.cfg.INVITE_PEPPER, code);
  }
}
