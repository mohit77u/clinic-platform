import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { entities } from './entities/index.js';
import { InitialSchema1760000000000 } from './migrations/1760000000000-InitialSchema.js';
import { AddAreas1760000100000 } from './migrations/1760000100000-AddAreas.js';
import { LiveQueueToggle1760000500000 } from './migrations/1760000500000-LiveQueueToggle.js';
import { TurnReminder1760000400000 } from './migrations/1760000400000-TurnReminder.js';
import { Billing1760000300000 } from './migrations/1760000300000-Billing.js';
import { BookingExtras1760000200000 } from './migrations/1760000200000-BookingExtras.js';

/** Shared by the Nest app (via TypeOrmModule) and the TypeORM CLI. Schema changes go through migrations only. */
export function buildDataSourceOptions(env: NodeJS.ProcessEnv = process.env): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 5432),
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities,
    migrations: [InitialSchema1760000000000, AddAreas1760000100000, BookingExtras1760000200000, Billing1760000300000, TurnReminder1760000400000, LiveQueueToggle1760000500000],
    synchronize: false,
  };
}

export default new DataSource(buildDataSourceOptions());
