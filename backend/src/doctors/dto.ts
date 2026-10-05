import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateDoctorDto {
  @IsInt() specializationId: number;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(200) qualification?: string;
  @IsOptional() @IsInt() @Min(0) @Max(70) experienceYears?: number;
  @IsOptional() @IsString() @MaxLength(100) medicalRegNo?: string;
  @IsOptional() @IsNumberString() consultationFee?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateDoctorDto extends PartialType(CreateDoctorDto) {}

export class CreateScheduleDto {
  /** 0 = Sunday */
  @IsInt() @Min(0) @Max(6) weekday: number;
  @IsOptional() @IsString() @MaxLength(50) sessionName?: string;
  @Matches(HHMM, { message: 'startTime must be HH:MM (24h)' }) startTime: string;
  @Matches(HHMM, { message: 'endTime must be HH:MM (24h)' }) endTime: string;
  @IsOptional() @IsIn(['token', 'slot']) mode?: 'token' | 'slot';
  @IsOptional() @IsInt() @Min(1) @Max(240) slotMinutes?: number;
  @IsInt() @Min(1) @Max(500) maxTokens: number;
  @IsOptional() @IsInt() @Min(0) @Max(500) walkinReserved?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateScheduleDto extends PartialType(CreateScheduleDto) {}
