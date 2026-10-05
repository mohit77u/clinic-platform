import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsInt, IsNumberString, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination.js';

export class CreateAreaDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
export class UpdateAreaDto extends PartialType(CreateAreaDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreatePlanDto {
  @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsInt() @Min(1) @Max(36) durationMonths: number;
  @IsNumberString() price: string;
  @IsOptional() @IsNumberString() gstPercent?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}
export class UpdatePlanDto extends PartialType(CreatePlanDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateSettingsDto {
  @IsOptional() @IsInt() default_trial_days?: number;
  @IsOptional() @IsInt() grace_days?: number;
  @IsOptional() @IsInt() advance_booking_days?: number;
  @IsOptional() @IsInt() cancel_cutoff_minutes?: number;
  @IsOptional() @IsInt() default_reminder_minutes?: number;
}

export class CreateSpecializationDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(80) nameHi?: string;
}

export class AuditQuery extends PageQuery {
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsString() action?: string;
}
