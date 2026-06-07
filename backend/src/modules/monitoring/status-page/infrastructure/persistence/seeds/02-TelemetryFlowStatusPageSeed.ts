import { DataSource } from "typeorm";
import { BaseSeed } from "@/database/shared/BaseSeed";
import { v4 as uuidv4 } from "uuid";
import { OverallStatus } from "../../../domain/aggregates/StatusPage";
import { NotificationType, SubscriptionType } from "../../../domain/aggregates/Subscriber";

/**
 * Status Page Seed — TELEMETRYFLOW Organization
 *
 * Creates the "TelemetryFlow Platform Status" page for the TelemetryFlow org.
 * This page surfaces all uptime monitors under the TELEMETRYFLOW organization.
 *
 * Slug: telemetryflow-platform
 */
export class TelemetryFlowStatusPageSeed extends BaseSeed {
  name = "TelemetryFlowStatusPageSeed";
  moduleName = "monitoring-status-page";
  order = 2;

  private dataSource!: DataSource;

  async run(dataSource: DataSource): Promise<void> {
    this.dataSource = dataSource;
    console.log("📊 Seeding TelemetryFlow status page...");

    const orgResult = await this.dataSource.query(
      `SELECT organization_id FROM organizations WHERE code = 'TELEMETRYFLOW' LIMIT 1`,
    );

    if (!orgResult.length) {
      console.log("⚠️ Organization TELEMETRYFLOW not found. Skipping.");
      return;
    }

    const tableExists = await this.dataSource.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'status_pages'
      )
    `);

    if (!tableExists[0].exists) {
      console.log("  ℹ️ Status pages table does not exist yet. Run migrations first.");
      return;
    }

    const organizationId = orgResult[0].organization_id;
    const monitors = await this.getMonitors(organizationId);
    const statusPages = await this.seedStatusPage(organizationId, monitors);

    await this.seedSubscribers(organizationId, statusPages);

    console.log("📊 TelemetryFlow status page seeding completed!");
  }

  private async getMonitors(
    organizationId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const monitors = await this.dataSource.query(
      `SELECT id, name FROM uptime_monitors WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
      [organizationId],
    );
    return monitors || [];
  }

  private async seedStatusPage(
    organizationId: string,
    monitors: Array<{ id: string; name: string }>,
  ): Promise<Array<{ id: string; slug: string; title: string }>> {
    console.log("  📄 Creating status pages...");

    const page = {
      id: uuidv4(),
      title: "TelemetryFlow Platform Status",
      slug: "telemetryflow-platform",
      description:
        "Real-time status of the TelemetryFlow observability platform — APIs, collectors, and infrastructure services",
      is_public: true,
      overall_status: OverallStatus.OPERATIONAL,
      brand_color: "#6366F1",
      show_uptime_percentage: true,
      show_response_time: true,
      show_incident_history: true,
      show_maintenance_schedule: true,
      allow_subscriptions: true,
      show_legend: true,
      uptime_ranges: ["24h", "7d", "30d", "90d"],
      history_days: 90,
      monitors: monitors.map((m, i) => ({
        monitorId: m.id,
        displayName: m.name,
        displayOrder: i,
        isVisible: true,
      })),
    };

    const exists = await this.dataSource.query(
      `SELECT id, slug, title FROM status_pages WHERE slug = $1`,
      [page.slug],
    );

    if (exists.length > 0) {
      console.log(`    ⏭️ Status page "${page.title}" already exists`);
      return [{ id: exists[0].id, slug: exists[0].slug, title: exists[0].title }];
    }

    await this.dataSource.query(
      `INSERT INTO status_pages (
        id, title, slug, description, is_public, overall_status,
        brand_color, show_uptime_percentage, show_response_time,
        show_incident_history, show_maintenance_schedule, allow_subscriptions,
        show_legend, uptime_ranges, history_days, monitors,
        organization_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12,
        $13, $14, $15, $16,
        $17, NOW(), NOW()
      )`,
      [
        page.id,
        page.title,
        page.slug,
        page.description,
        page.is_public,
        page.overall_status,
        page.brand_color,
        page.show_uptime_percentage,
        page.show_response_time,
        page.show_incident_history,
        page.show_maintenance_schedule,
        page.allow_subscriptions,
        page.show_legend,
        JSON.stringify(page.uptime_ranges),
        page.history_days,
        JSON.stringify(page.monitors),
        organizationId,
      ],
    );

    console.log(`    ✅ Created status page: ${page.title}`);
    return [{ id: page.id, slug: page.slug, title: page.title }];
  }

  private async seedSubscribers(
    organizationId: string,
    statusPages: Array<{ id: string; slug: string; title: string }>,
  ): Promise<void> {
    console.log("  📧 Creating subscribers...");

    const tableExists = await this.dataSource.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'status_page_subscribers'
      )
    `);

    if (!tableExists[0].exists) {
      console.log("    ℹ️ Subscribers table does not exist yet. Skipping subscribers.");
      return;
    }

    const mainPage = statusPages.find((p) => p.slug === "telemetryflow-platform");
    if (!mainPage) return;

    const subscribers = [
      {
        email: "devops@telemetryflow.id",
        subscription_type: SubscriptionType.EMAIL,
        is_confirmed: true,
        notification_type: NotificationType.ALL,
      },
      {
        email: "alerts@telemetryflow.id",
        subscription_type: SubscriptionType.EMAIL,
        is_confirmed: true,
        notification_type: NotificationType.INCIDENTS_ONLY,
      },
    ];

    for (const subscriber of subscribers) {
      const exists = await this.dataSource.query(
        `SELECT id FROM status_page_subscribers WHERE status_page_id = $1 AND email = $2`,
        [mainPage.id, subscriber.email],
      );

      if (exists.length > 0) {
        console.log(`    ⏭️ Subscriber "${subscriber.email}" already exists`);
        continue;
      }

      const unsubscribeToken = `unsub-${uuidv4()}`;

      await this.dataSource.query(
        `INSERT INTO status_page_subscribers (
          id, status_page_id, email, webhook_url, subscription_type,
          is_confirmed, confirmation_token, unsubscribe_token,
          notification_type, confirmed_at,
          organization_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10,
          $11, NOW(), NOW()
        )`,
        [
          uuidv4(),
          mainPage.id,
          subscriber.email,
          null,
          subscriber.subscription_type,
          subscriber.is_confirmed,
          null,
          unsubscribeToken,
          subscriber.notification_type,
          subscriber.is_confirmed ? new Date() : null,
          organizationId,
        ],
      );

      console.log(`    ✅ Created subscriber: ${subscriber.email}`);
    }
  }
}
