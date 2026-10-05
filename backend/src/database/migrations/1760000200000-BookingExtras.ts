import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - patients.user_id nullable: walk-in patients without a phone have no account.
 * - patients.created_by_clinic_id: which clinic created a walk-in profile.
 * - appointments.reminder_sent_at / turn_near_sent_at: make notification jobs idempotent.
 */
export class BookingExtras1760000200000 implements MigrationInterface {
  name = 'BookingExtras1760000200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE patients ALTER COLUMN user_id DROP NOT NULL`);
    await q.query(`ALTER TABLE patients ADD COLUMN created_by_clinic_id BIGINT REFERENCES clinics(id)`);
    await q.query(`ALTER TABLE appointments ADD COLUMN reminder_sent_at TIMESTAMPTZ`);
    await q.query(`ALTER TABLE appointments ADD COLUMN turn_near_sent_at TIMESTAMPTZ`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE appointments DROP COLUMN turn_near_sent_at`);
    await q.query(`ALTER TABLE appointments DROP COLUMN reminder_sent_at`);
    await q.query(`ALTER TABLE patients DROP COLUMN created_by_clinic_id`);
    await q.query(`DELETE FROM patients WHERE user_id IS NULL`);
    await q.query(`ALTER TABLE patients ALTER COLUMN user_id SET NOT NULL`);
  }
}
