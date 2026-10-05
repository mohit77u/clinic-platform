import { Type } from 'class-transformer';
import {
  Equals, IsBoolean, IsIn, IsInt, IsNumberString, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class PatientInputDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsOptional() @IsInt() @Min(0) @Max(120) age?: number;
  @IsOptional() @IsIn(['M', 'F', 'O']) gender?: 'M' | 'F' | 'O';
}

export class CreateBookingDto {
  @IsNumberString() scheduleId: string;
  @Matches(DATE, { message: 'date must be YYYY-MM-DD' }) date: string;
  @IsOptional() @IsNumberString() patientId?: string;
  @IsOptional() @ValidateNested() @Type(() => PatientInputDto) patient?: PatientInputDto;
  /** "remind me this many minutes before my turn" (5 minutes - 12 hours); defaults to the platform setting */
  @IsOptional() @IsInt() @Min(5) @Max(720) remindBeforeMinutes?: number;
  /** privacy consent checkbox */
  @IsBoolean() @Equals(true, { message: 'Consent is required to book' }) consent: boolean;
}

export class MyBookingsQuery {
  @IsOptional() @IsIn(['upcoming', 'past']) scope?: 'upcoming' | 'past';
}

export class DateQuery {
  @IsOptional() @Matches(DATE, { message: 'date must be YYYY-MM-DD' }) date?: string;
}

export class CallNextDto {
  @IsNumberString() scheduleId: string;
  @Matches(DATE) date: string;
}

export class WalkinDto {
  @IsNumberString() scheduleId: string;
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsOptional() @IsInt() @Min(0) @Max(120) age?: number;
  @IsOptional() @IsIn(['M', 'F', 'O']) gender?: 'M' | 'F' | 'O';
  @IsOptional() @Matches(/^[+\d\s-]{10,16}$/) mobile?: string;
}

export class CancelByClinicDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class LeaveDto {
  @Matches(DATE, { message: 'date must be YYYY-MM-DD' }) date: string;
  @IsOptional() @IsNumberString() scheduleId?: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
