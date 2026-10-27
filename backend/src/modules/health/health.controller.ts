import { Controller, Get, HttpCode, Inject, ServiceUnavailableException, VERSION_NEUTRAL } from '@nestjs/common';
import type Redis from 'ioredis';
import { sql } from 'kysely';
import { Public } from '../../common/auth-context';
import { DB } from '../../database/database';
import { REDIS } from '../../redis/redis.module';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
@Public()
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: DB,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get('live')
  @HttpCode(200)
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await sql`SELECT 1`.execute(this.db);
      await this.redis.ping();
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('dependencies unavailable');
    }
  }
}
