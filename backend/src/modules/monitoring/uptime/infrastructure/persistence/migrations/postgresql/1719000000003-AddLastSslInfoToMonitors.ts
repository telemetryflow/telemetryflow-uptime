import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLastSslInfoToMonitors1719000000003 implements MigrationInterface {
  name = "AddLastSslInfoToMonitors1719000000003";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE uptime_monitors
      ADD COLUMN IF NOT EXISTS last_ssl_info jsonb NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE uptime_monitors
      DROP COLUMN IF EXISTS last_ssl_info
    `);
  }
}
