import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add missing display columns to status_pages table
 *
 * The original CreateStatusPageTables migration was missing:
 * - theme: VARCHAR(20) DEFAULT 'light'
 * - google_analytics_id: VARCHAR(50)
 *
 * These columns exist on the StatusPageEntity but were never created in the DB.
 */
export class AddMissingDisplayColumns1720000000003 implements MigrationInterface {
  name = 'AddMissingDisplayColumns1720000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE status_pages
      ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'light'
    `);

    await queryRunner.query(`
      ALTER TABLE status_pages
      ADD COLUMN IF NOT EXISTS google_analytics_id VARCHAR(50)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE status_pages
      DROP COLUMN IF EXISTS google_analytics_id
    `);

    await queryRunner.query(`
      ALTER TABLE status_pages
      DROP COLUMN IF EXISTS theme
    `);
  }
}
