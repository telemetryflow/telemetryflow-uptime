import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Status Page Migration: Create Status Page Tables
 * Timestamp: 1720000000001 (Status Page module range)
 *
 * Creates tables for:
 * - status_pages: Status page configurations
 * - status_page_incidents: Incidents and maintenance
 * - status_page_subscribers: Email subscribers
 */
export class CreateStatusPageTables1720000000001 implements MigrationInterface {
  name = 'CreateStatusPageTables1720000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create overall_status enum
    await queryRunner.query(`
      CREATE TYPE overall_status AS ENUM (
        'operational', 'degraded_performance', 'partial_outage',
        'major_outage', 'maintenance', 'unknown'
      )
    `);

    // Create incident_impact enum
    await queryRunner.query(`
      CREATE TYPE incident_impact AS ENUM ('none', 'minor', 'major', 'critical')
    `);

    // Create incident_status enum
    await queryRunner.query(`
      CREATE TYPE incident_status AS ENUM (
        'investigating', 'identified', 'monitoring', 'resolved',
        'scheduled', 'in_progress', 'completed'
      )
    `);

    // Create notification_type enum
    await queryRunner.query(`
      CREATE TYPE notification_type AS ENUM ('all', 'incidents_only', 'maintenance_only')
    `);

    // Create status_pages table
    await queryRunner.query(`
      CREATE TABLE status_pages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        is_public BOOLEAN DEFAULT TRUE,
        overall_status overall_status DEFAULT 'unknown',

        -- Branding
        logo_url TEXT,
        favicon_url TEXT,
        brand_color VARCHAR(20) DEFAULT '#10B981',
        custom_css TEXT,
        header_text TEXT,
        footer_text TEXT,
        support_url TEXT,

        -- Display settings
        show_uptime_percentage BOOLEAN DEFAULT TRUE,
        show_response_time BOOLEAN DEFAULT TRUE,
        show_incident_history BOOLEAN DEFAULT TRUE,
        show_maintenance_schedule BOOLEAN DEFAULT TRUE,
        allow_subscriptions BOOLEAN DEFAULT TRUE,
        show_legend BOOLEAN DEFAULT TRUE,
        uptime_ranges JSONB DEFAULT '["24h", "7d", "30d", "90d"]',
        history_days INTEGER DEFAULT 90,

        -- Custom domain
        custom_domain VARCHAR(255),
        custom_domain_verified BOOLEAN DEFAULT FALSE,
        custom_domain_ssl BOOLEAN DEFAULT FALSE,
        custom_domain_verification_token VARCHAR(255),

        -- Monitors
        monitors JSONB DEFAULT '[]',
        last_status_check TIMESTAMP WITH TIME ZONE,

        -- Multi-tenancy
        organization_id UUID NOT NULL,
        workspace_id UUID,
        created_by UUID,

        -- Metadata
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP WITH TIME ZONE
      )
    `);

    // Create indexes for status_pages
    await queryRunner.query(`CREATE UNIQUE INDEX idx_status_pages_slug ON status_pages(slug)`);
    await queryRunner.query(`CREATE INDEX idx_status_pages_org ON status_pages(organization_id)`);
    await queryRunner.query(`CREATE INDEX idx_status_pages_public ON status_pages(is_public)`);
    await queryRunner.query(`CREATE INDEX idx_status_pages_custom_domain ON status_pages(custom_domain)`);

    // Create status_page_incidents table
    await queryRunner.query(`
      CREATE TABLE status_page_incidents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        impact incident_impact DEFAULT 'minor',
        status incident_status DEFAULT 'investigating',
        message TEXT,
        affected_monitor_ids JSONB DEFAULT '[]',
        updates JSONB DEFAULT '[]',
        is_scheduled_maintenance BOOLEAN DEFAULT FALSE,
        scheduled_start_at TIMESTAMP WITH TIME ZONE,
        scheduled_end_at TIMESTAMP WITH TIME ZONE,
        started_at TIMESTAMP WITH TIME ZONE NOT NULL,
        resolved_at TIMESTAMP WITH TIME ZONE,
        organization_id UUID NOT NULL,
        workspace_id UUID,
        created_by UUID,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP WITH TIME ZONE
      )
    `);

    // Create indexes for status_page_incidents
    await queryRunner.query(`CREATE INDEX idx_incidents_status_page ON status_page_incidents(status_page_id)`);
    await queryRunner.query(
      `CREATE INDEX idx_incidents_status_page_status ON status_page_incidents(status_page_id, status)`,
    );
    await queryRunner.query(`CREATE INDEX idx_incidents_org ON status_page_incidents(organization_id)`);
    await queryRunner.query(`CREATE INDEX idx_incidents_started_at ON status_page_incidents(started_at)`);
    await queryRunner.query(
      `CREATE INDEX idx_incidents_maintenance ON status_page_incidents(is_scheduled_maintenance)`,
    );

    // Create status_page_subscribers table
    await queryRunner.query(`
      CREATE TABLE status_page_subscribers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        is_confirmed BOOLEAN DEFAULT FALSE,
        confirmation_token VARCHAR(255),
        unsubscribe_token VARCHAR(255) NOT NULL,
        notification_type notification_type DEFAULT 'all',
        monitor_ids JSONB,
        confirmed_at TIMESTAMP WITH TIME ZONE,
        last_notified_at TIMESTAMP WITH TIME ZONE,
        organization_id UUID NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for status_page_subscribers
    await queryRunner.query(`CREATE INDEX idx_subscribers_status_page ON status_page_subscribers(status_page_id)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_subscribers_email ON status_page_subscribers(status_page_id, email)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_subscribers_confirmation ON status_page_subscribers(confirmation_token)`,
    );
    await queryRunner.query(`CREATE INDEX idx_subscribers_unsubscribe ON status_page_subscribers(unsubscribe_token)`);
    await queryRunner.query(`CREATE INDEX idx_subscribers_confirmed ON status_page_subscribers(is_confirmed)`);

    // Create update timestamp trigger
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_status_page_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_status_pages_updated_at
      BEFORE UPDATE ON status_pages
      FOR EACH ROW EXECUTE FUNCTION update_status_page_timestamp()
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_incidents_updated_at
      BEFORE UPDATE ON status_page_incidents
      FOR EACH ROW EXECUTE FUNCTION update_status_page_timestamp()
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_subscribers_updated_at
      BEFORE UPDATE ON status_page_subscribers
      FOR EACH ROW EXECUTE FUNCTION update_status_page_timestamp()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers
    await queryRunner.query(`DROP TRIGGER IF EXISTS trigger_subscribers_updated_at ON status_page_subscribers`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trigger_incidents_updated_at ON status_page_incidents`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trigger_status_pages_updated_at ON status_pages`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_status_page_timestamp()`);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS status_page_subscribers`);
    await queryRunner.query(`DROP TABLE IF EXISTS status_page_incidents`);
    await queryRunner.query(`DROP TABLE IF EXISTS status_pages`);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS notification_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS incident_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS incident_impact`);
    await queryRunner.query(`DROP TYPE IF EXISTS overall_status`);
  }
}
