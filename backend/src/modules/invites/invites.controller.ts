import { Body, Controller, HttpCode, Ip, Param, Post } from '@nestjs/common';
import { CurrentUser, Public, Roles, type AuthUser } from '../../common/auth-context';
import { RateLimit } from '../../common/rate-limit';
import { UuidParam } from '../../common/validation';
import { AcceptParentInviteDto, RedeemInviteDto } from './invites.dto';
import { InvitesService } from './invites.service';

@Controller({ version: '1' })
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post('families/:familyId/children/:childId/invites')
  @Roles('parent')
  @RateLimit({ by: 'user', limit: 20, windowSec: 3600 })
  createChildInvite(
    @CurrentUser() user: AuthUser,
    @Param('familyId', UuidParam) familyId: string,
    @Param('childId', UuidParam) childId: string,
    @Ip() ip: string,
  ) {
    return this.invites.createChildInvite(user, familyId, childId, ip);
  }

  @Post('families/:familyId/parent-invites')
  @Roles('parent')
  @RateLimit({ by: 'user', limit: 20, windowSec: 3600 })
  createParentInvite(@CurrentUser() user: AuthUser, @Param('familyId', UuidParam) familyId: string, @Ip() ip: string) {
    return this.invites.createParentInvite(user, familyId, ip);
  }

  /** Brute-force budget: 5/min and 20/h per IP against a 32^8 code space with 24h TTL. */
  @Public()
  @Post('invites/redeem')
  @HttpCode(200)
  @RateLimit({ by: 'ip', limit: 5, windowSec: 60 }, { by: 'ip', limit: 20, windowSec: 3600 })
  redeem(@Body() dto: RedeemInviteDto, @Ip() ip: string) {
    return this.invites.redeemChildInvite(dto, ip);
  }

  @Post('parent-invites/accept')
  @Roles('parent')
  @HttpCode(200)
  @RateLimit({ by: 'user', limit: 5, windowSec: 60 }, { by: 'user', limit: 20, windowSec: 3600 })
  accept(@CurrentUser() user: AuthUser, @Body() dto: AcceptParentInviteDto, @Ip() ip: string) {
    return this.invites.acceptParentInvite(user, dto.code, ip);
  }
}
