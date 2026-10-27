import { Transform, Type } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength, ValidateNested } from 'class-validator';
import type { Locale } from '../../database/types';
import { DeviceInfoDto } from '../devices/devices.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export const PRIVACY_POLICY_VERSION = '2026-10';

export class RegisterDto {
  @Transform(lower) @IsEmail() @MaxLength(254)
  email!: string;

  // Length over complexity rules (NIST SP 800-63B); 128 caps argon2 work per request.
  @IsString() @MinLength(10) @MaxLength(128)
  password!: string;

  @Transform(trim) @IsString() @Length(1, 64)
  displayName!: string;

  @IsOptional() @IsIn(['uk', 'ru', 'en'])
  locale?: Locale;

  @IsBoolean() @Equals(true, { message: 'privacy policy must be accepted' })
  acceptPrivacyPolicy!: boolean;

  @ValidateNested() @Type(() => DeviceInfoDto)
  device!: DeviceInfoDto;
}

export class LoginDto {
  @Transform(lower) @IsEmail() @MaxLength(254)
  email!: string;

  @IsString() @MinLength(1) @MaxLength(128)
  password!: string;

  @ValidateNested() @Type(() => DeviceInfoDto)
  device!: DeviceInfoDto;
}

export class RefreshDto {
  @IsString() @Length(20, 128)
  refreshToken!: string;
}
