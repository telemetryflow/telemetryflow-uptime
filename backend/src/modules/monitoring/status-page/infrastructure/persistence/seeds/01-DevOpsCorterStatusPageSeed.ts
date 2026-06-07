import { DataSource } from "typeorm";
import { BaseSeed } from "@/database/shared/BaseSeed";
import { v4 as uuidv4 } from "uuid";
import { OverallStatus } from "../../../domain/aggregates/StatusPage";
import { IncidentStatus, IncidentImpact } from "../../../domain/aggregates/Incident";
import { NotificationType, SubscriptionType } from "../../../domain/aggregates/Subscriber";

/**
 * Status Page Seed — DEVOPSCORNER Organization
 *
 * Creates the primary "TelemetryFlow Status" public page for the DevOpsCorner org.
 * This page surfaces all uptime monitors under DEVOPSCORNER and includes sample
 * incidents and subscribers for demo purposes.
 *
 * Slug: telemetryflow
 */
export class DevOpsCornerStatusPageSeed extends BaseSeed {
  name = "DevOpsCornerStatusPageSeed";
  moduleName = "monitoring-status-page";
  order = 1;

  private dataSource!: DataSource;

  async run(dataSource: DataSource): Promise<void> {
    this.dataSource = dataSource;
    console.log("📊 Seeding DevOpsCorner status page...");

    const orgResult = await this.dataSource.query(
      `SELECT organization_id FROM organizations WHERE code = 'DEVOPSCORNER' LIMIT 1`,
    );

    if (!orgResult.length) {
      console.log("⚠️ Organization DEVOPSCORNER not found. Skipping.");
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

    await this.seedIncidents(organizationId, statusPages);
    await this.seedSubscribers(organizationId, statusPages);

    console.log("📊 DevOpsCorner status page seeding completed!");
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
      title: "TelemetryFlow Status",
      slug: "telemetryflow",
      description:
        "Real-time status of TelemetryFlow Platform services — Official Website, Demo, and GitHub Repository",
      is_public: true,
      overall_status: OverallStatus.OPERATIONAL,
      brand_color: "#10B981",
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

  private async seedIncidents(
    organizationId: string,
    statusPages: Array<{ id: string; slug: string; title: string }>,
  ): Promise<void> {
    console.log("  🚨 Creating incidents...");

    const tableExists = await this.dataSource.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'status_page_incidents'
      )
    `);

    if (!tableExists[0].exists) {
      console.log("    ℹ️ Incidents table does not exist yet. Skipping incidents.");
      return;
    }

    if (statusPages.length === 0) return;

    const mainPage = statusPages[0];
    const now = new Date();

    const incidents = [
      {
        id: uuidv4(),
        status_page_id: mainPage.id,
        title: "API Latency Degradation",
        impact: IncidentImpact.MINOR,
        status: IncidentStatus.RESOLVED,
        message: "We are investigating reports of increased API response times.",
        started_at: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        resolved_at: new Date(now.getTime() - 22 * 60 * 60 * 1000),
        is_scheduled_maintenance: false,
        updates: [
          {
            id: "tfo-incident-1-u1",
            status: IncidentStatus.INVESTIGATING,
            message: "We are investigating reports of increased API response times.",
            createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          },
          {
            id: "tfo-incident-1-u2",
            status: IncidentStatus.IDENTIFIED,
            message: "The issue has been identified as a database connection pool saturation.",
            createdAt: new Date(now.getTime() - 23.5 * 60 * 60 * 1000),
          },
          {
            id: "tfo-incident-1-u3",
            status: IncidentStatus.RESOLVED,
            message: "The issue has been resolved. Connection pool limits have been increased.",
            createdAt: new Date(now.getTime() - 22 * 60 * 60 * 1000),
          },
        ],
      },
      {
        id: uuidv4(),
        status_page_id: mainPage.id,
        title: "Scheduled Database Maintenance",
        impact: IncidentImpact.MINOR,
        status: IncidentStatus.SCHEDULED,
        message: "We will be performing scheduled database maintenance.",
        is_scheduled_maintenance: true,
        scheduled_start_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        scheduled_end_at: new Date(
          now.getTime() + 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000,
        ),
        started_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        resolved_at: null,
        updates: [
          {
            id: "tfo-maint-1-u1",
            status: IncidentStatus.SCHEDULED,
            message: "Database maintenance window scheduled. Expected downtime: 30 minutes.",
            createdAt: now,
          },
        ],
      },
      {
        id: uuidv4(),
        status_page_id: mainPage.id,
        title: "Authentication Service Outage",
        impact: IncidentImpact.MAJOR,
        status: IncidentStatus.RESOLVED,
        message: "Users were unable to log in to the platform.",
        is_scheduled_maintenance: false,
        started_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        resolved_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000),
        updates: [
          {
            id: "tfo-incident-2-u1",
            status: IncidentStatus.INVESTIGATING,
            message: "We are aware of issues affecting user authentication.",
            createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          },
          {
            id: "tfo-incident-2-u2",
            status: IncidentStatus.IDENTIFIED,
            message: "The root cause has been identified as a misconfigured load balancer.",
            createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000),
          },
          {
            id: "tfo-incident-2-u3",
            status: IncidentStatus.MONITORING,
            message: "A fix has been deployed and we are monitoring the situation.",
            createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 + 35 * 60 * 1000),
          },
          {
            id: "tfo-incident-2-u4",
            status: IncidentStatus.RESOLVED,
            message: "The incident has been fully resolved. All services are operational.",
            createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000),
          },
        ],
      },
    ];

    for (const incident of incidents) {
      const exists = await this.dataSource.query(
        `SELECT id FROM status_page_incidents WHERE status_page_id = $1 AND title = $2`,
        [incident.status_page_id, incident.title],
      );

      if (exists.length > 0) {
        console.log(`    ⏭️ Incident "${incident.title}" already exists`);
        continue;
      }

      await this.dataSource.query(
        `INSERT INTO status_page_incidents (
          id, status_page_id, title, impact, status, message,
          affected_monitor_ids, updates, is_scheduled_maintenance,
          scheduled_start_at, scheduled_end_at, started_at, resolved_at,
          organization_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          '[]', $7, $8,
          $9, $10, $11, $12,
          $13, NOW(), NOW()
        )`,
        [
          incident.id,
          incident.status_page_id,
          incident.title,
          incident.impact,
          incident.status,
          incident.message,
          JSON.stringify(incident.updates),
          incident.is_scheduled_maintenance,
          (incident as any).scheduled_start_at || null,
          (incident as any).scheduled_end_at || null,
          incident.started_at,
          incident.resolved_at || null,
          organizationId,
        ],
      );

      console.log(`    ✅ Created incident: ${incident.title}`);
    }
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

    const mainPage = statusPages.find((p) => p.slug === "telemetryflow");
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
      {
        email: "maintenance@telemetryflow.id",
        subscription_type: SubscriptionType.EMAIL,
        is_confirmed: true,
        notification_type: NotificationType.MAINTENANCE_ONLY,
      },
      {
        webhook_url: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXX",
        subscription_type: SubscriptionType.WEBHOOK,
        is_confirmed: true,
        notification_type: NotificationType.ALL,
      },
    ];

    for (const subscriber of subscribers) {
      const identifier = subscriber.email || subscriber.webhook_url;
      const lookupField = subscriber.email ? "email" : "webhook_url";

      const exists = await this.dataSource.query(
        `SELECT id FROM status_page_subscribers WHERE status_page_id = $1 AND ${lookupField} = $2`,
        [mainPage.id, identifier],
      );

      if (exists.length > 0) {
        console.log(`    ⏭️ Subscriber "${identifier}" already exists`);
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
          subscriber.email || null,
          (subscriber as any).webhook_url || null,
          subscriber.subscription_type,
          subscriber.is_confirmed,
          null,
          unsubscribeToken,
          subscriber.notification_type,
          subscriber.is_confirmed ? new Date() : null,
          organizationId,
        ],
      );

      console.log(`    ✅ Created subscriber: ${identifier}`);
    }
  }
}
