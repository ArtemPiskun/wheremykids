import { Type } from 'class-transformer';
import { IsIn, IsLatitude, IsLongitude, IsNumber, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { BatteryDto } from '../devices/devices.dto';

export class RaiseSosDto {
  /** Device-generated; a retried request after a lost response returns the same SOS. */
  @IsUUID()
  clientId!: string;

  @IsOptional() @IsLatitude()
  lat?: number;

  @IsOptional() @IsLongitude()
  lng?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(10_000)
  accuracy?: number;

  @IsOptional() @ValidateNested() @Type(() => BatteryDto)
  battery?: BatteryDto;
}

export class ListSosQueryDto {
  @IsOptional() @IsIn(['active', 'all'])
  status?: 'active' | 'all';
}
