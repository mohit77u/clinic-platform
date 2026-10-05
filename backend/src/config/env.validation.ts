import { plainToInstance } from 'class-transformer';
import { IsBooleanString, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  @IsString()
  DB_HOST: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT: number = 5432;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_NAME: string;

  @IsString()
  REDIS_URL: string = 'redis://localhost:6379';

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @IsString()
  CORS_ORIGIN: string = 'http://localhost:3000';

  @IsBooleanString()
  COOKIE_SECURE: string = 'false';

  @IsString()
  WEB_BASE_URL: string = 'http://localhost:3000';

  @IsOptional() @IsString() RAZORPAY_KEY_ID?: string;
  @IsOptional() @IsString() RAZORPAY_KEY_SECRET?: string;
  @IsOptional() @IsString() RAZORPAY_WEBHOOK_SECRET?: string;

  @IsOptional() @IsInt() @Min(1) RATE_LIMIT_PER_MIN?: number;
  @IsBooleanString() TRUST_PROXY: string = 'false';
  @IsOptional() @IsString() SENTRY_DSN?: string;
  @IsOptional() @IsString() NOTIFIER?: string;
  @IsOptional() @IsString() WHATSAPP_API_KEY?: string;

  @IsString() COMPANY_NAME: string = 'Clinic Platform';
  @IsString() COMPANY_GSTIN: string = 'GSTIN-PENDING';
  @IsString() COMPANY_ADDRESS: string = 'Rewa, Madhya Pradesh';
  @IsString() COMPANY_STATE: string = 'Madhya Pradesh';
  @IsString() PRIVATE_DIR: string = 'private';

  @IsString()
  UPLOAD_DIR: string = 'uploads';

  @IsString()
  PUBLIC_BASE_URL: string = 'http://localhost:3001';

  /** Mobile of the super admin created by the seed script */
  @IsOptional()
  @IsString()
  SEED_ADMIN_MOBILE?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const msg = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  return validated;
}
