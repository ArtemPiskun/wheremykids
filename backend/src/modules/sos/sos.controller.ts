import { Body, Controller, Get, HttpCode, Ip, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth-context';
import { RateLimit } from '../../common/rate-limit';
import { UuidParam } from '../../common/validation';
import { ListSosQueryDto, RaiseSosDto } from './sos.dto';
import { SosService } from './sos.service';

@Controller({ version: '1' })
export class SosController {
  constructor(private readonly sos: SosService) {}

  @Post('sos')
  @Roles('child')
  @RateLimit({ by: 'user', limit: 10, windowSec: 600 })
  raise(@CurrentUser() user: AuthUser, @Body() dto: RaiseSosDto, @Ip() ip: string) {
    return this.sos.raise(user, dto, ip);
  }

  @Post('sos/:id/cancel')
  @Roles('child')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.sos.cancel(user, id);
  }

  @Post('sos/:id/ack')
  @Roles('parent')
  @HttpCode(200)
  ack(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.sos.acknowledge(user, id);
  }

  @Post('sos/:id/resolve')
  @Roles('parent')
  @HttpCode(200)
  resolve(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string) {
    return this.sos.resolve(user, id);
  }

  @Get('families/:familyId/sos')
  @Roles('parent')
  async list(@CurrentUser() user: AuthUser, @Param('familyId', UuidParam) familyId: string, @Query() q: ListSosQueryDto) {
    return { alerts: await this.sos.list(user, familyId, q.status !== 'all') };
  }
}
