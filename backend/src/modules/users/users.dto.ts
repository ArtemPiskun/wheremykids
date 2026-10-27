import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import type { Locale } from '../../database/types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateMeDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 64)
  displayName?: string;

  @IsOptional() @IsIn(['uk', 'ru', 'en'])
  locale?: Locale;

  @IsOptional() @IsString() @Length(3, 64)
  timezone?: string;
}

export class PauseSharingDto {
  @IsInt() @Min(15) @Max(480)
  minutes!: number;
}
