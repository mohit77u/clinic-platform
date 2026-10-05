import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source.js';

/** Recreates the test schema from migrations once per run, then seeds reference data. */
export default async function setup() {
  const ds = new DataSource({
    ...buildDataSourceOptions({ ...process.env, DB_NAME: 'clinic_platform_test' }),
    dropSchema: true,
  });
  await ds.initialize();
  await ds.runMigrations();
  await ds.query(`INSERT INTO app_settings (key,value) VALUES ('default_trial_days','30'),('grace_days','3'),('advance_booking_days','7'),('cancel_cutoff_minutes','60'),('default_reminder_minutes','30')`);
  await ds.query(`INSERT INTO plans (name,duration_months,price,sort_order) VALUES ('Monthly',1,1199,1),('Quarterly',3,2999,2),('Half-Yearly',6,5499,3),('Annual',12,9999,4)`);
  await ds.query(`INSERT INTO specializations (name,name_hi,slug) VALUES ('Physician','फिजिशियन','physician'),('Pediatrician','बाल रोग विशेषज्ञ','pediatrician')`);
  await ds.query(`INSERT INTO areas (name,sort_order) VALUES ('Civil Lines',1),('Rajendra Nagar',2)`);
  await ds.destroy();
}
