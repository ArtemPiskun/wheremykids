import { Inject, Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import type { AuthUser } from '../../common/auth-context';
import { sha256 } from '../../common/crypto';
import { AppError } from '../../common/errors';
import { RateLimitService } from '../../common/rate-limit';
import { DB } from '../../database/database';
import { AuditService } from '../audit/audit.service';
import { DevicesService } from '../devices/devices.service';
import { LoginDto, PRIVACY_POLICY_VERSION, RegisterDto } from './auth.dto';
import { hashPassword, verifyPassword } from './passwords';
import { TokenPair, TokensService } from './tokens.service';

export interface AuthResult extends TokenPair {
  user: { id: string; role: 'parent' | 'child'; displayName: string; email: string | null; locale: string };
  deviceId: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: DB,
    private readonly tokens: TokensService,
    private readonly devices: DevicesService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimitService,
  ) {}

  async register(dto: RegisterDto, ip?: string): Promise<AuthResult> {
    const passwordHash = await hashPassword(dto.password);
    const result = await this.db.transaction().execute(async (trx) => {
      const existing = await trx.selectFrom('users').select('id').where('email', '=', dto.email).executeTakeFirst();
      if (existing) throw AppError.conflict('EMAIL_TAKEN', 'An account with this email already exists');

      const userId = uuidv7();
      await trx
        .insertInto('users')
        .values({
          id: userId,
          role: 'parent',
          email: dto.email,
          password_hash: passwordHash,
          display_name: dto.displayName,
          locale: dto.locale ?? 'uk',
        })
        .execute();
      await trx
        .insertInto('consents')
        .values({ id: uuidv7(), user_id: userId, kind: 'privacy_policy', version: PRIVACY_POLICY_VERSION, granted_by: userId })
        .execute();
      const deviceId = await this.devices.create(trx, userId, dto.device);
      const pair = await this.tokens.issue(trx, userId, 'parent', deviceId);
      return {
        ...pair,
        deviceId,
        user: { id: userId, role: 'parent' as const, displayName: dto.displayName, email: dto.email, locale: dto.locale ?? 'uk' },
      };
    });
    await this.audit.record({ action: 'auth.register', actorUserId: result.user.id, actorDeviceId: result.deviceId, ip });
    return result;
  }

  async login(dto: LoginDto, ip?: string): Promise<AuthResult> {
    // Per-account limit on top of the per-IP route limit: slows distributed guessing of one password.
    await this.limiter.consume(`login:email:${sha256(dto.email).toString('hex')}`, 10, 900);

    const user = await this.db
      .selectFrom('users')
      .select(['id', 'role', 'display_name', 'email', 'locale', 'password_hash'])
      .where('email', '=', dto.email)
      .where('role', '=', 'parent')
      .executeTakeFirst();

    const ok = await verifyPassword(user?.password_hash ?? null, dto.password);
    if (!user || !ok) {
      await this.audit.record({ action: 'auth.login_failed', actorUserId: user?.id ?? null, ip });
      throw AppError.unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect');
    }

    const result = await this.db.transaction().execute(async (trx) => {
      const deviceId = await this.devices.create(trx, user.id, dto.device);
      const pair = await this.tokens.issue(trx, user.id, 'parent', deviceId);
      return { ...pair, deviceId };
    });
    await this.audit.record({ action: 'auth.login', actorUserId: user.id, actorDeviceId: result.deviceId, ip });
    return {
      ...result,
      user: { id: user.id, role: 'parent', displayName: user.display_name, email: user.email, locale: user.locale },
    };
  }

  refresh(refreshToken: string, ip?: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken, ip);
  }

  async logout(user: AuthUser, ip?: string): Promise<void> {
    await this.devices.revoke(this.db, user.deviceId);
    await this.audit.record({ action: 'auth.logout', actorUserId: user.userId, actorDeviceId: user.deviceId, ip });
  }
}
