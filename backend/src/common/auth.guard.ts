import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { AccessTokenClaims, AuthedRequest, IS_PUBLIC, revokedDeviceKey, ROLES } from './auth-context';
import type { UserRole } from '../database/types';
import { AppError } from './errors';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw AppError.unauthorized();

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(header.slice(7));
    } catch {
      throw AppError.unauthorized('TOKEN_INVALID', 'Access token is invalid or expired');
    }
    // Access tokens are short-lived; a revoked device is blocked immediately via a Redis marker.
    if (await this.redis.exists(revokedDeviceKey(claims.did))) {
      throw AppError.unauthorized('DEVICE_REVOKED', 'This device has been signed out');
    }
    req.user = { userId: claims.sub, role: claims.role, deviceId: claims.did };

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(claims.role)) throw AppError.forbidden('ROLE_FORBIDDEN', 'Not allowed for this role');
    return true;
  }
}
