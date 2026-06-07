/**
 * Uptime Checks Seed (ClickHouse): Sample uptime check history
 * Generates 90 days of realistic check data synced with PG monitor seeds.
 */

import { ClickHouseClient } from "@clickhouse/client";
import { BaseClickHouseSeed } from "../../../../../../../database/shared/BaseClickHouseSeed";

export class SeedUptimeChecks1719000000020 extends BaseClickHouseSeed {
  name = "SeedUptimeChecks1719000000020";
  moduleName = "monitoring-uptime";
  order = 1;
  dependencies: string[] = [];

  async run(client: ClickHouseClient, database: string): Promise<void> {
    this.log("Seeding uptime check history...");

    const hasData = await this.hasRecords(client, database, "uptime_checks");
    if (hasData) {
      this.logSkip("Uptime check data already exists, skipping");
      return;
    }

    // Resolve real IDs from PostgreSQL
    const pgIds = await this.resolvePostgresIds();
    if (!pgIds.organizationId) {
      this.logError(
        "Cannot seed — default organization not found in PostgreSQL",
      );
      return;
    }

    // Get monitors from PG
    const monitors = await this.resolveMonitors(pgIds.organizationId);
    if (monitors.length === 0) {
      this.logError(
        "Cannot seed — no uptime monitors found. Run PG seeds first.",
      );
      return;
    }

    const now = Date.now();
    const regions = ["ap-southeast-3", "ap-southeast-3"];

    let totalRecords = 0;

    for (const monitor of monitors) {
      const records: Record<string, unknown>[] = [];

      // 90 days of checks, every 60 seconds = ~129,600 per monitor
      // For seed data: every 5 minutes for 90 days = ~25,920 per monitor
      for (let day = 0; day < 90; day++) {
        for (let check = 0; check < 288; check++) {
          // 288 checks per day (every 5 min)
          const checkedAt = new Date(
            now - day * 24 * 60 * 60 * 1000 - check * 5 * 60 * 1000,
          );

          // Simulate realistic uptime (99.5-99.99% based on monitor)
          const uptimeRate = monitor.uptimeRate;
          const isSuccess = Math.random() < uptimeRate;

          // Simulate response time (varies by time of day)
          const hourOfDay = checkedAt.getUTCHours();
          const isPeakHour = hourOfDay >= 8 && hourOfDay <= 18;
          const baseLatency = monitor.baseLatency;
          const jitter = isPeakHour ? 80 : 40;
          const responseTime = isSuccess
            ? Math.floor(baseLatency + Math.random() * jitter - jitter / 2)
            : 0;

          const region = regions[check % regions.length];

          records.push({
            checked_at: checkedAt
              .toISOString()
              .replace("T", " ")
              .replace("Z", ""),
            monitor_id: monitor.id,
            monitor_name: monitor.name,
            status: isSuccess
              ? "success"
              : Math.random() > 0.5
                ? "timeout"
                : "failure",
            status_code: isSuccess ? 200 : 0,
            response_time: responseTime,
            ip_address: `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            region,
            error_message: isSuccess ? "" : "Connection timed out",
            ssl_days_remaining: isSuccess
              ? Math.max(0, monitor.sslBaseDays - day)
              : -1,
            organization_id: pgIds.organizationId,
            workspace_id: pgIds.workspaceId,
            tenant_id: pgIds.tenantId,
          });
        }
      }

      // Insert in batches
      const batchSize = 5000;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await this.insertBatch(client, database, "uptime_checks", batch);
      }

      totalRecords += records.length;
    }

    this.logSuccess(
      `Seeded ${totalRecords} uptime check records for ${monitors.length} monitors (90 days)`,
    );
  }

  /**
   * SSL base days per monitor name — synced with frontend mock and PG seed.
   * Each monitor has a different SSL certificate profile.
   *   telemetryflow.co.id         → 39 days (Let's Encrypt)
   *   demo.telemetryflow.co.id    → 39 days (Let's Encrypt)
   *   github.com/telemetryflow → 86 days (DigiCert Global CA G2)
   */
  private getSslBaseDays(name: string): number {
    if (name.includes("Official Website")) return 39;
    if (name.includes("Demo Website")) return 39;
    if (name.includes("GitHub")) return 86;
    return 90; // default for any future monitor
  }

  private async resolveMonitors(
    organizationId: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      uptimeRate: number;
      baseLatency: number;
      sslBaseDays: number;
    }>
  > {
    const { DataSource } = await import("typeorm");
    const pgDataSource = new DataSource({
      type: "postgres",
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432"),
      username: process.env.POSTGRES_USERNAME || "postgres",
      password: process.env.POSTGRES_PASSWORD || "postgres",
      database: process.env.POSTGRES_DB || "telemetryflow_db",
    });

    try {
      await pgDataSource.initialize();
      const rows = await pgDataSource.query(
        `SELECT id, name, avg_response_time_24h, uptime_90d FROM uptime_monitors
         WHERE organization_id = $1 AND deleted_at IS NULL
         ORDER BY name`,
        [organizationId],
      );

      return rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        uptimeRate: (parseFloat(r.uptime_90d) || 99.9) / 100,
        baseLatency: parseFloat(r.avg_response_time_24h) || 150,
        sslBaseDays: this.getSslBaseDays(r.name),
      }));
    } catch {
      return [];
    } finally {
      if (pgDataSource.isInitialized) {
        await pgDataSource.destroy();
      }
    }
  }
}
