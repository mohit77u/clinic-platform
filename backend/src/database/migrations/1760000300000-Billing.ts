import { MigrationInterface, QueryRunner } from 'typeorm';

/** Gapless per-financial-year invoice numbering + manual (offline) payments. */
export class Billing1760000300000 implements MigrationInterface {
  name = 'Billing1760000300000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE invoice_counters (fy TEXT PRIMARY KEY, last_no INT NOT NULL DEFAULT 0)`);
    await q.query(`ALTER TABLE payments ADD COLUMN method TEXT NOT NULL DEFAULT 'razorpay'`);
    await q.query(`ALTER TABLE payments ADD COLUMN reference TEXT`);
    await q.query(`ALTER TABLE payments ADD COLUMN created_by BIGINT REFERENCES users(id)`);
    await q.query(`CREATE INDEX idx_payments_clinic_created ON payments (clinic_id, created_at DESC)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_payments_clinic_created`);
    await q.query(`ALTER TABLE payments DROP COLUMN created_by`);
    await q.query(`ALTER TABLE payments DROP COLUMN reference`);
    await q.query(`ALTER TABLE payments DROP COLUMN method`);
    await q.query(`DROP TABLE invoice_counters`);
  }
}
