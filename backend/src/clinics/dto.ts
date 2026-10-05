import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { PageQuery } from '../common/pagination.js';
import { isAllowedMapUrl } from './map-url.js';

@ValidatorConstraint({ name: 'mapUrl', async: false })
class MapUrlConstraint implements ValidatorConstraintInterface {
  validate(v: unknown) {
    return typeof v === 'string' && isAllowedMapUrl(v);
  }
  defaultMessage() {
    return 'Map link must be a Google Maps share link (google.com/maps or maps.app.goo.gl)';
  }
}

const digitsOnly = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value);

export class CreateClinicDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @Transform(digitsOnly) @Matches(/^\+?\d{8,14}$/, { message: 'Enter a valid phone number' })
  phone: string;

  @IsOptional() @Transform(digitsOnly) @Matches(/^\+?\d{8,14}$/, { message: 'Enter a valid WhatsApp number' })
  whatsapp?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsString() @MinLength(3) @MaxLength(300)
  addressLine: string;

  @IsString() @MinLength(2)
  area: string;

  @IsOptional() @Matches(/^\d{6}$/, { message: 'Pincode must be 6 digits' })
  pincode?: string;

  @IsOptional() @Validate(MapUrlConstraint)
  mapUrl?: string;

  @IsOptional() @IsNumberString()
  latitude?: string;

  @IsOptional() @IsNumberString()
  longitude?: string;

  @IsOptional() @IsString() @MaxLength(100)
  registrationNo?: string;

  @IsOptional() @IsInt() @Min(0) @Max(365)
  trialDays?: number;

  /** false: no live queue page for this clinic's patients (token + approximate time only) */
  @IsOptional() @IsBoolean()
  liveQueueEnabled?: boolean;
}

export class UpdateClinicDto extends PartialType(CreateClinicDto) {}

export class ListClinicsQuery extends PageQuery {
  @IsOptional() @IsIn(['pending', 'approved', 'rejected', 'suspended'])
  status?: string;

  @IsOptional() @IsString() @MaxLength(100)
  q?: string;
}

export class PublishDto {
  @IsOptional() @IsInt() @Min(0) @Max(365)
  trialDays?: number;
}

export class RejectDto {
  @IsString() @MinLength(3) @MaxLength(500)
  reason: string;
}

export class GiftDaysDto {
  @IsInt() @Min(1) @Max(730)
  days: number;

  @IsOptional() @IsString() @MaxLength(300)
  reason?: string;
}

export class AddMemberDto {
  @IsString() @Matches(/^[+\d\s-]{10,16}$/)
  mobile: string;

  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsIn(['clinic_owner', 'clinic_staff'])
  role: 'clinic_owner' | 'clinic_staff';
}

export class ReorderImagesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsNumberString({}, { each: true })
  ids: string[];
}
