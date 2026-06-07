import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add webhook subscription support to status_page_subscribers table
 * - subscription_type: 'email' | 'webhook'
 * - webhook_url: nullable URL for webhook subscriptions
 */
export class AddWebhookSubscription1720000000002 implements MigrationInterface {
  name = 'AddWebhookSubscription1720000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create subscription_type enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE subscription_type AS ENUM ('email', 'webhook');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add subscription_type column (default 'email' for existing rows)
    await queryRunner.query(`
      ALTER TABLE status_page_subscribers
      ADD COLUMN IF NOT EXISTS subscription_type subscription_type DEFAULT 'email' NOT NULL
    `);

    // Add webhook_url column
    await queryRunner.query(`
      ALTER TABLE status_page_subscribers
      ADD COLUMN IF NOT EXISTS webhook_url VARCHAR(2048)
    `);

    // Make email nullable (webhook subscribers don't need an email)
    await queryRunner.query(`
      ALTER TABLE status_page_subscribers
      ALTER COLUMN email DROP NOT NULL
    `);

    // Add index on subscription_type for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscribers_subscription_type
      ON status_page_subscribers (subscription_type)
    `);

    // Update unique index: include subscription_type (allow same email for different status pages)
    // Drop old unique index and recreate with subscription_type
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_subscribers_email
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_subscribers_email_type
      ON status_page_subscribers (status_page_id, COALESCE(email, ''), COALESCE(webhook_url, ''))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_email_type`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_subscription_type`);
    await queryRunner.query(`
      ALTER TABLE status_page_subscribers
      ALTER COLUMN email SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE status_page_subscribers
      DROP COLUMN IF EXISTS webhook_url
    `);
    await queryRunner.query(`
      ALTER TABLE status_page_subscribers
      DROP COLUMN IF EXISTS subscription_type
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS subscription_type`);
    // Restore original unique index
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_subscribers_email
      ON status_page_subscribers (status_page_id, email)
    `);
  }
}
