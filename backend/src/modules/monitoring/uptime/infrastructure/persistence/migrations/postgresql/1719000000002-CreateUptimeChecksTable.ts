import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Uptime Migration: Create Uptime Checks Table
 * Timestamp: 1719000000002 (Uptime module range)
 *
 * Creates table for:
 * - uptime_checks: Individual check results for monitors
 */
export class CreateUptimeChecksTable1719000000002 implements MigrationInterface {
  name = "CreateUptimeChecksTable1719000000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create check_status enum
    await queryRunner.query(`
      CREATE TYPE check_status AS ENUM ('success', 'failure', 'timeout', 'error')
    `);

    // Create uptime_checks table
    await queryRunner.query(`
      CREATE TABLE uptime_checks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        monitor_id UUID NOT NULL REFERENCES uptime_monitors(id) ON DELETE CASCADE,
        status check_status DEFAULT 'success',
        status_code INTEGER,
        response_time INTEGER NOT NULL,
        timing JSONB,
        message TEXT,
        error TEXT,
        ssl_info JSONB,
        response_body TEXT,
        response_headers JSONB,
        ip_address VARCHAR(50),
        region VARCHAR(50),
        checked_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for uptime_checks
    await queryRunner.query(
      `CREATE INDEX idx_checks_monitor_id ON uptime_checks(monitor_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_checks_monitor_checked_at ON uptime_checks(monitor_id, checked_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_checks_monitor_status ON uptime_checks(monitor_id, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_checks_checked_at ON uptime_checks(checked_at)`,
    );

    // Create partitioning on checked_at for better query performance on time-series data
    // Note: This is a comment for future optimization - actual partitioning would require
    // additional setup and is database-specific
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_checks_checked_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_checks_monitor_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_checks_monitor_checked_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_checks_monitor_id`);

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS uptime_checks`);

    // Drop enum
    await queryRunner.query(`DROP TYPE IF EXISTS check_status`);
  }
}
