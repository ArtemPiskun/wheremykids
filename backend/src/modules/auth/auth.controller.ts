import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { CurrentUser, Public, type AuthUser } from '../../common/auth-context';
import { RateLimit } from '../../common/rate-limit';
import { LoginDto, RefreshDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @RateLimit({ by: 'ip', limit: 5, windowSec: 3600 })
  register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.auth.register(dto, ip);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit({ by: 'ip', limit: 10, windowSec: 60 }, { by: 'ip', limit: 50, windowSec: 3600 })
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @RateLimit({ by: 'ip', limit: 60, windowSec: 60 })
  refresh(@Body() dto: RefreshDto, @Ip() ip: string) {
    return this.auth.refresh(dto.refreshToken, ip);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Ip() ip: string): Promise<void> {
    await this.auth.logout(user, ip);
  }
}
