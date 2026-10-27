import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Accepts "+380 67 123 45 67", "067-123-45-67", "0671234567" and normalises to E.164. */
const toE164Ua = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const digits = value.replace(/[^\d+]/g, '');
  if (/^0\d{9}$/.test(digits)) return `+38${digits}`;
  if (/^380\d{9}$/.test(digits)) return `+${digits}`;
  return digits;
};

// Preset avatar keys ("fox", "owl", …) or an https URL from our own media storage.
const AVATAR = /^([a-z0-9_-]{1,32}|https:\/\/[\w.-]+\/[\w./-]{1,200})$/;
const currentYear = new Date().getUTCFullYear();

export class CreateFamilyDto {
  @Transform(trim) @IsString() @Length(1, 64)
  name!: string;
}

export class CreateChildDto {
  @Transform(trim) @IsString() @Length(1, 64)
  displayName!: string;

  @IsOptional() @IsInt() @Min(currentYear - 18) @Max(currentYear)
  birthYear?: number;

  @IsOptional() @Matches(AVATAR)
  avatar?: string;

  /** Used for "Call child"; optional because younger children may not have a SIM. */
  @IsOptional() @Transform(toE164Ua) @Matches(/^\+\d{10,15}$/, { message: 'phone must be a valid number, e.g. +380671234567' })
  phone?: string;
}

export class UpdateChildDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 64)
  displayName?: string;

  @IsOptional() @IsInt() @Min(currentYear - 18) @Max(currentYear)
  birthYear?: number;

  @IsOptional() @Matches(AVATAR)
  avatar?: string;

  @IsOptional() @Transform(toE164Ua) @Matches(/^\+\d{10,15}$/, { message: 'phone must be a valid number, e.g. +380671234567' })
  phone?: string;
}
