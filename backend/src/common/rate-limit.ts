import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import type { AuthedRequest } from './auth-context';
import { AppError } from './errors';

export interface RateLimitRule {
  /** Bucket identity: client IP or authenticated user. */
  by: 'ip' | 'user';
  limit: number;
  windowSec: number;
}

const RATE_LIMIT = 'rate-limit:rules';
const DEFAULT_RULES: RateLimitRule[] = [{ by: 'ip', limit: 600, windowSec: 60 }];

export const RateLimit = (...rules: RateLimitRule[]): MethodDecorator => SetMetadata(RATE_LIMIT, rules);

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Fixed-window counter. Throws RATE_LIMITED when the bucket is exhausted. */
  async consume(bucket: string, limit: number, windowSec: number): Promise<void> {
    const window = Math.floor(Date.now() / 1000 / windowSec);
    const key = `rl:${bucket}:${windowSec}:${window}`;
    const [[, count]] = (await this.redis.multi().incr(key).expire(key, windowSec + 1).exec()) as [[null, number]];
    if (count > limit) {
      const retryAfter = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
      throw AppError.tooManyRequests(retryAfter);
    }
  }

  async count(bucket: string, windowSec: number): Promise<number> {
    const window = Math.floor(Date.now() / 1000 / windowSec);
    return Number((await this.redis.get(`rl:${bucket}:${windowSec}:${window}`)) ?? 0);
  }
}

/** Runs after AuthGuard, so `by: 'user'` rules can use the authenticated identity. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const handler = ctx.getHandler();
    const route = `${ctx.getClass().name}.${handler.name}`;
    const rules = this.reflector.get<RateLimitRule[] | undefined>(RATE_LIMIT, handler);

    await this.limiter.consume(`global:ip:${req.ip}`, DEFAULT_RULES[0].limit, DEFAULT_RULES[0].windowSec);
    for (const rule of rules ?? []) {
      const subject = rule.by === 'user' ? req.user?.userId ?? req.ip : req.ip;
      await this.limiter.consume(`${route}:${rule.by}:${subject}`, rule.limit, rule.windowSec);
    }
    return true;
  }
}
