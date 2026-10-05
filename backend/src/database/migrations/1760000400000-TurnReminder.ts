import { MigrationInterface, QueryRunner } from 'typeorm';

/** Patient-chosen "remind me N minutes before my turn" (one WhatsApp message per booking). */
export class TurnReminder1760000400000 implements MigrationInterface {
  name = 'TurnReminder1760000400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE appointments ADD COLUMN remind_before_minutes SMALLINT CHECK (remind_before_minutes BETWEEN 5 AND 720)`);
    await q.query(`ALTER TABLE appointments DROP COLUMN reminder_sent_at`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE appointments ADD COLUMN reminder_sent_at TIMESTAMPTZ`);
    await q.query(`ALTER TABLE appointments DROP COLUMN remind_before_minutes`);
  }
}
