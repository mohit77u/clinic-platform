import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { HttpAdapterHost } from '@nestjs/core';
import { SentryFilter } from './common/sentry.filter.js';
import { FileStorage, LocalFileStorage } from './common/storage.js';

/** Shared by main.ts and e2e tests so both run with identical middleware. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  if (config.get('TRUST_PROXY') === 'true') (app as NestExpressApplication).set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.enableCors({ origin: config.getOrThrow<string>('CORS_ORIGIN').split(','), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const dsn = config.get<string>('SENTRY_DSN');
  if (dsn) {
    Sentry.init({ dsn, environment: config.get('NODE_ENV') });
    app.useGlobalFilters(new SentryFilter(app.get(HttpAdapterHost).httpAdapter));
  }

  const storage = app.get(FileStorage);
  if (storage instanceof LocalFileStorage) {
    (app as NestExpressApplication).useStaticAssets(storage.root, { prefix: '/uploads' });
  }
}
