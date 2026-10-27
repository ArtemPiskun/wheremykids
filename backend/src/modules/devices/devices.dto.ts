import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';
import type { Platform } from '../../database/types';

export class DeviceInfoDto {
  @IsIn(['android', 'ios'])
  platform!: Platform;

  @IsOptional() @IsString() @Length(1, 64)
  model?: string;

  @IsOptional() @IsString() @Length(1, 32)
  osVersion?: string;

  @IsOptional() @IsString() @Length(1, 32)
  appVersion?: string;

  @IsOptional() @IsString() @Length(16, 4096)
  pushToken?: string;
}

export class BatteryDto {
  @IsInt() @Min(0) @Max(100)
  level!: number;

  @IsOptional() @IsBoolean()
  charging?: boolean;
}

export class UpdateCurrentDeviceDto {
  @IsOptional() @IsString() @Length(16, 4096)
  pushToken?: string;

  @IsOptional() @IsString() @Length(1, 32)
  appVersion?: string;

  @IsOptional() @IsString() @Length(1, 32)
  osVersion?: string;

  @IsOptional() @ValidateNested() @Type(() => BatteryDto)
  battery?: BatteryDto;
}
