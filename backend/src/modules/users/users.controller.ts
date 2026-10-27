import { Body, Controller, Delete, Get, HttpCode, Ip, Patch, Post } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth-context';
import { RateLimit } from '../../common/rate-limit';
import { PauseSharingDto, UpdateMeDto } from './users.dto';
import { UsersService } from './users.service';

@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user, dto);
  }

  @Get('export')
  @Roles('parent')
  @RateLimit({ by: 'user', limit: 3, windowSec: 3600 })
  export(@CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.users.export(user, ip);
  }

  @Delete()
  @Roles('parent')
  @HttpCode(204)
  @RateLimit({ by: 'user', limit: 3, windowSec: 3600 })
  async delete(@CurrentUser() user: AuthUser, @Ip() ip: string): Promise<void> {
    await this.users.deleteAccount(user, ip);
  }
}

@Controller({ path: 'child', version: '1' })
@Roles('child')
export class ChildController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.childMe(user);
  }

  @Post('sharing/pause')
  @HttpCode(200)
  @RateLimit({ by: 'user', limit: 10, windowSec: 3600 })
  pause(@CurrentUser() user: AuthUser, @Body() dto: PauseSharingDto, @Ip() ip: string) {
    return this.users.pauseSharing(user, dto.minutes, ip);
  }

  @Post('sharing/resume')
  @HttpCode(200)
  resume(@CurrentUser() user: AuthUser) {
    return this.users.resumeSharing(user);
  }

  @Post('leave')
  @HttpCode(204)
  async leave(@CurrentUser() user: AuthUser, @Ip() ip: string): Promise<void> {
    await this.users.leaveFamily(user, ip);
  }
}
