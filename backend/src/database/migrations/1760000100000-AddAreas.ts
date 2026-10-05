import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAreas1760000100000 implements MigrationInterface {
  name = 'AddAreas1760000100000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE areas (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order SMALLINT NOT NULL DEFAULT 0
    )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS areas`);
  }
}
