import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import type { GeofenceKind } from '../../database/types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateGeofenceDto {
  @Transform(trim) @IsString() @Length(1, 48)
  name!: string;

  @IsIn(['home', 'school', 'sport', 'other'])
  kind!: GeofenceKind;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsInt() @Min(50) @Max(2000)
  radiusM!: number;

  @IsOptional() @IsBoolean()
  notifyEnter?: boolean;

  @IsOptional() @IsBoolean()
  notifyExit?: boolean;
}

export class UpdateGeofenceDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 48)
  name?: string;

  @IsOptional() @IsIn(['home', 'school', 'sport', 'other'])
  kind?: GeofenceKind;

  @IsOptional() @IsLatitude()
  lat?: number;

  @IsOptional() @IsLongitude()
  lng?: number;

  @IsOptional() @IsInt() @Min(50) @Max(2000)
  radiusM?: number;

  @IsOptional() @IsBoolean()
  notifyEnter?: boolean;

  @IsOptional() @IsBoolean()
  notifyExit?: boolean;
}
