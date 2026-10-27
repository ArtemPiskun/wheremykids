import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Kysely, Transaction } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import type { AccessTokenClaims } from '../../common/auth-context';
import { randomToken, sha256 } from '../../common/crypto';
import { AppError } from '../../common/errors';
import { DB } from '../../database/database';
import type { Database, UserRole } from '../../database/types';
import { AuditService } from '../audit/audit.service';

type Executor = Kysely<Database> | Transaction<Database>;

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

@Injectable()
export class TokensService {
  constructor(
    @Inject(DB) private readonly db: DB,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async issue(executor: Executor, userId: string, role: UserRole, deviceId: string, chainId = uuidv7()): Promise<TokenPair> {
    const refreshToken = randomToken(32);
    const ttlDays = role === 'child' ? this.cfg.REFRESH_TTL_DAYS_CHILD : this.cfg.REFRESH_TTL_DAYS_PARENT;
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
    await executor
      .insertInto('refresh_tokens')
      .values({
        id: uuidv7(),
        device_id: deviceId,
        user_id: userId,
        token_hash: sha256(refreshToken),
        chain_id: chainId,
        expires_at: expiresAt,
      })
      .execute();
    return {
      accessToken: await this.signAccess({ sub: userId, role, did: deviceId }),
      accessTokenExpiresIn: this.cfg.JWT_ACCESS_TTL_SEC,
      refreshToken,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    };
  }

  signAccess(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(claims, { expiresIn: this.cfg.JWT_ACCESS_TTL_SEC });
  }

  /**
   * Rotates a refresh token. Presenting an already-rotated token means it leaked
   * (or a client bug), so the whole chain is revoked and the device must sign in again.
   */
  async rotate(refreshToken: string, ip?: string): Promise<TokenPair> {
    const hash = sha256(refreshToken);
    const outcome = await this.db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom('refresh_tokens as t')
        .innerJoin('devices as d', 'd.id', 't.device_id')
        .innerJoin('users as u', 'u.id', 't.user_id')
        .select(['t.id', 't.chain_id', 't.user_id', 't.device_id', 't.expires_at', 't.revoked_at', 't.replaced_by', 'd.revoked_at as device_revoked_at', 'u.role'])
        .where('t.token_hash', '=', hash)
        .forUpdate('t')
        .executeTakeFirst();

      if (!row) throw AppError.unauthorized('REFRESH_INVALID', 'Refresh token is invalid');
      if (row.device_revoked_at) throw AppError.unauthorized('DEVICE_REVOKED', 'This device has been signed out');
      // Reuse is handled after this transaction, otherwise throwing would roll the chain revocation back.
      if (row.revoked_at) return { reused: row, pair: undefined };
      if (row.expires_at.getTime() <= Date.now()) {
        throw AppError.unauthorized('REFRESH_EXPIRED', 'Session expired, please sign in again');
      }

      const pair = await this.issue(trx, row.user_id, row.role, row.device_id, row.chain_id);
      const next = await trx
        .selectFrom('refresh_tokens')
        .select('id')
        .where('token_hash', '=', sha256(pair.refreshToken))
        .executeTakeFirstOrThrow();
      await trx
        .updateTable('refresh_tokens')
        .set({ revoked_at: new Date(), replaced_by: next.id })
        .where('id', '=', row.id)
        .execute();
      await trx.updateTable('devices').set({ last_seen_at: new Date() }).where('id', '=', row.device_id).execute();
      return { pair, reused: undefined };
    });

    if (outcome.pair) return outcome.pair;
    const reused = outcome.reused!;
    if (reused.replaced_by) {
      await this.db
        .updateTable('refresh_tokens')
        .set({ revoked_at: new Date() })
        .where('chain_id', '=', reused.chain_id)
        .where('revoked_at', 'is', null)
        .execute();
      await this.audit.record({ action: 'auth.refresh_reuse', actorUserId: reused.user_id, actorDeviceId: reused.device_id, ip });
    }
    throw AppError.unauthorized('REFRESH_REUSED', 'Session expired, please sign in again');
  }
}
