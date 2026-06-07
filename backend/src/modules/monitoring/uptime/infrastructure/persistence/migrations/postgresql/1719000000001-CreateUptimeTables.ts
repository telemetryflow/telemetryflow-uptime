import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Uptime Migration: Create Uptime Monitoring Tables
 * Timestamp: 1719000000001 (Uptime module range)
 *
 * Creates tables for:
 * - uptime_monitors: Monitor configurations
 * - uptime_monitor_groups: Monitor grouping
 */
export class CreateUptimeTables1719000000001 implements MigrationInterface {
  name = "CreateUptimeTables1719000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create monitor_type enum
    await queryRunner.query(`
      CREATE TYPE monitor_type AS ENUM (
        'http', 'https', 'tcp', 'ping', 'dns', 'udp',
        'smtp', 'pop3', 'imap', 'keyword', 'json_query',
        'grpc', 'docker', 'postgres', 'mysql', 'mongodb',
        'redis', 'kafka', 'rabbitmq', 'mqtt', 'websocket',
        'ssl_certificate', 'game_server', 'custom'
      )
    `);

    // Create monitor_status enum
    await queryRunner.query(`
      CREATE TYPE monitor_status AS ENUM (
        'up', 'down', 'degraded', 'paused', 'pending', 'unknown'
      )
    `);

    // Create http_method enum
    await queryRunner.query(`
      CREATE TYPE http_method AS ENUM (
        'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'
      )
    `);

    // Create auth_method enum
    await queryRunner.query(`
      CREATE TYPE auth_method AS ENUM (
        'none', 'basic', 'bearer', 'api_key', 'oauth2', 'digest', 'ntlm'
      )
    `);

    // Create uptime_monitors table
    await queryRunner.query(`
      CREATE TABLE uptime_monitors (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        url TEXT NOT NULL,
        type monitor_type DEFAULT 'http',
        status monitor_status DEFAULT 'pending',
        interval INTEGER DEFAULT 60,
        timeout INTEGER DEFAULT 30,
        retries INTEGER DEFAULT 3,
        retry_interval INTEGER DEFAULT 10,
        is_active BOOLEAN DEFAULT TRUE,
        is_paused BOOLEAN DEFAULT FALSE,

        -- HTTP Config
        http_method http_method,
        http_headers JSONB,
        http_body TEXT,
        http_body_encoding VARCHAR(50),
        follow_redirects BOOLEAN DEFAULT TRUE,
        max_redirects INTEGER DEFAULT 5,
        accepted_status_codes JSONB,
        ignore_tls_errors BOOLEAN DEFAULT FALSE,

        -- Keyword Config
        keyword VARCHAR(500),
        keyword_invert BOOLEAN DEFAULT FALSE,

        -- JSON Query Config
        json_path VARCHAR(500),
        json_expected_value TEXT,
        json_operator VARCHAR(20),

        -- Auth Config
        auth_method auth_method,
        auth_username VARCHAR(255),
        auth_password VARCHAR(255),
        auth_token TEXT,
        api_key_header VARCHAR(100),
        api_key_value TEXT,

        -- Database Config
        db_connection_string TEXT,
        db_query TEXT,
        db_expected_result TEXT,

        -- DNS Config
        dns_resolve_server VARCHAR(255),
        dns_resolve_type VARCHAR(10),
        dns_expected_result TEXT,

        -- SSL Config
        ssl_expiry_warning_days INTEGER DEFAULT 14,
        ssl_check_chain BOOLEAN DEFAULT TRUE,

        -- Notification Config
        notification_channels JSONB,
        alert_after_down_count INTEGER DEFAULT 1,
        notification_resend_interval INTEGER,
        notify_on_recovery BOOLEAN DEFAULT TRUE,

        -- Grouping
        group_id UUID,
        tags JSONB DEFAULT '[]',

        -- Stats (cached)
        uptime_24h DECIMAL(5, 2) DEFAULT 0,
        uptime_7d DECIMAL(5, 2) DEFAULT 0,
        uptime_30d DECIMAL(5, 2) DEFAULT 0,
        uptime_90d DECIMAL(5, 2) DEFAULT 0,
        avg_response_time_24h DECIMAL(10, 2) DEFAULT 0,
        avg_response_time_7d DECIMAL(10, 2) DEFAULT 0,
        total_checks BIGINT DEFAULT 0,
        successful_checks BIGINT DEFAULT 0,
        failed_checks BIGINT DEFAULT 0,

        -- Check tracking
        last_check_at TIMESTAMP WITH TIME ZONE,
        last_response_time INTEGER,
        last_status_change TIMESTAMP WITH TIME ZONE,
        consecutive_down_count INTEGER DEFAULT 0,
        consecutive_up_count INTEGER DEFAULT 0,
        next_check_at TIMESTAMP WITH TIME ZONE,

        -- Multi-tenancy
        organization_id UUID NOT NULL,
        workspace_id UUID,

        -- Metadata
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP WITH TIME ZONE
      )
    `);

    // Create indexes for uptime_monitors
    await queryRunner.query(
      `CREATE INDEX idx_monitors_organization_id ON uptime_monitors(organization_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_monitors_org_status ON uptime_monitors(organization_id, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_monitors_group_id ON uptime_monitors(group_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_monitors_is_active ON uptime_monitors(is_active)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_monitors_next_check ON uptime_monitors(next_check_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_monitors_active_not_paused ON uptime_monitors(is_active, is_paused) WHERE deleted_at IS NULL`,
    );

    // Create uptime_monitor_groups table
    await queryRunner.query(`
      CREATE TABLE uptime_monitor_groups (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        display_order INTEGER DEFAULT 0,
        is_expanded BOOLEAN DEFAULT TRUE,
        monitor_ids JSONB DEFAULT '[]',
        organization_id UUID NOT NULL,
        workspace_id UUID,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for uptime_monitor_groups
    await queryRunner.query(
      `CREATE INDEX idx_monitor_groups_org ON uptime_monitor_groups(organization_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_monitor_groups_org_order ON uptime_monitor_groups(organization_id, display_order)`,
    );

    // Create update timestamp trigger
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_uptime_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_monitors_updated_at
      BEFORE UPDATE ON uptime_monitors
      FOR EACH ROW EXECUTE FUNCTION update_uptime_timestamp()
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_monitor_groups_updated_at
      BEFORE UPDATE ON uptime_monitor_groups
      FOR EACH ROW EXECUTE FUNCTION update_uptime_timestamp()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_monitor_groups_updated_at ON uptime_monitor_groups`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_monitors_updated_at ON uptime_monitors`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS update_uptime_timestamp()`,
    );

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS uptime_monitor_groups`);
    await queryRunner.query(`DROP TABLE IF EXISTS uptime_monitors`);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS auth_method`);
    await queryRunner.query(`DROP TYPE IF EXISTS http_method`);
    await queryRunner.query(`DROP TYPE IF EXISTS monitor_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS monitor_type`);
  }
}
