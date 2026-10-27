import { Type } from 'class-transformer';
import { Equals, IsBoolean, IsString, Length, Matches, ValidateNested } from 'class-validator';
import { DeviceInfoDto } from '../devices/devices.dto';

export class ConsentDto {
  /** The child saw the screen explaining who will see their location and how to stop it. */
  @IsBoolean() @Equals(true, { message: 'location sharing consent is required' })
  locationSharing!: boolean;

  @IsString() @Matches(/^\d{4}-\d{2}$/)
  version!: string;
}

export class RedeemInviteDto {
  @IsString() @Length(8, 12)
  code!: string;

  @ValidateNested() @Type(() => DeviceInfoDto)
  device!: DeviceInfoDto;

  @ValidateNested() @Type(() => ConsentDto)
  consent!: ConsentDto;
}

export class AcceptParentInviteDto {
  @IsString() @Length(8, 12)
  code!: string;
}
