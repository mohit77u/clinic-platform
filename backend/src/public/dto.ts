import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PageQuery } from '../common/pagination.js';

export class SearchClinicsQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(80) area?: string;
  @IsOptional() @Matches(/^[a-z0-9-]+$/) specialization?: string;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() availableToday?: boolean;
}
