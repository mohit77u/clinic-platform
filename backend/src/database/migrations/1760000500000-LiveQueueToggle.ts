import { MigrationInterface, QueryRunner } from 'typeorm';

/** Per-clinic switch: false => patients only see their token and approximate time (no live queue). */
export class LiveQueueToggle1760000500000 implements MigrationInterface {
  name = 'LiveQueueToggle1760000500000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE clinics ADD COLUMN live_queue_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
    // v_public_clinics selects c.* at creation time; recreate so it stays in sync with the new column.
    await q.query(`DROP VIEW v_public_clinics`);
    await q.query(`CREATE VIEW v_public_clinics AS
      SELECT c.* FROM clinics c
      WHERE c.status = 'approved'
        AND EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.clinic_id = c.id AND s.status = 'active'
            AND s.ends_at + make_interval(days => COALESCE(
              (SELECT value::int FROM app_settings WHERE key = 'grace_days'), 3)) > now()
        )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP VIEW v_public_clinics`);
    await q.query(`ALTER TABLE clinics DROP COLUMN live_queue_enabled`);
    await q.query(`CREATE VIEW v_public_clinics AS
      SELECT c.* FROM clinics c
      WHERE c.status = 'approved'
        AND EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.clinic_id = c.id AND s.status = 'active'
            AND s.ends_at + make_interval(days => COALESCE(
              (SELECT value::int FROM app_settings WHERE key = 'grace_days'), 3)) > now()
        )`);
  }
}
