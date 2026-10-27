import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { LocationSource } from '../../database/types';
import { BatteryDto } from '../devices/devices.dto';

export const MAX_BATCH = 100;

export class LocationPointDto {
  /** Generated on the device; makes re-uploads after a lost response idempotent. */
  @IsUUID()
  clientId!: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsNumber() @Min(0) @Max(10_000)
  accuracy!: number;

  @IsOptional() @IsNumber() @Min(0) @Max(150)
  speed?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(360)
  heading?: number;

  @IsOptional() @IsNumber() @Min(-500) @Max(10_000)
  altitude?: number;

  @IsISO8601({ strict: true })
  recordedAt!: string;

  @IsIn(['gps', 'network', 'fused', 'manual', 'sos'])
  source!: LocationSource;

  @IsOptional() @IsString() @MaxLength(16)
  motion?: string;
}

export class LocationBatchDto {
  @IsArray() @ArrayMinSize(0) @ArrayMaxSize(MAX_BATCH)
  @ValidateNested({ each: true }) @Type(() => LocationPointDto)
  points!: LocationPointDto[];

  @IsOptional() @ValidateNested() @Type(() => BatteryDto)
  battery?: BatteryDto;
}

export class HistoryQueryDto {
  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;

  @IsOptional() @IsIn(['true', 'false'])
  simplify?: 'true' | 'false';
}
