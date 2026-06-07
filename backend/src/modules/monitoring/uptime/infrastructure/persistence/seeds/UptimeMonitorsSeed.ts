import { DataSource } from "typeorm";
import { BaseSeed } from "@/database/shared/BaseSeed";
import { v4 as uuidv4 } from "uuid";
import { MonitorType, MonitorStatus, HttpMethod } from "../../../domain/aggregates/Monitor";
import { CheckStatus } from "../../../domain/aggregates/UptimeCheck";

/**
 * Uptime Monitor Module Seeds
 *
 * Creates sample uptime monitors, monitor groups, and check history for testing and demonstration.
 */

export class UptimeMonitorsSeed extends BaseSeed {
  name = "UptimeMonitorsSeed";
  moduleName = "monitoring-uptime";
  order = 1;

  private dataSource!: DataSource;

  async run(dataSource: DataSource): Promise<void> {
    this.dataSource = dataSource;
    console.log("📡 Seeding uptime monitors...");

    // Get default organization
    const orgResult = await this.dataSource.query(
      `SELECT organization_id FROM organizations WHERE code = 'DEVOPSCORNER' LIMIT 1`,
    );

    if (!orgResult.length) {
      console.log(
        "⚠️ No default organization found. Skipping uptime monitor seeds.",
      );
      return;
    }

    const organizationId = orgResult[0].organization_id;

    // Check if uptime_monitors table exists
    const tableExists = await this.dataSource.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'uptime_monitors'
      )
    `);

    if (!tableExists[0].exists) {
      console.log(
        "  ℹ️ Uptime monitors table does not exist yet. Run migrations first.",
      );
      return;
    }

    // Create monitor groups first
    const groups = await this.seedMonitorGroups(organizationId);

    // Create monitors
    const monitors = await this.seedMonitors(organizationId, groups);

    // Create historical check data
    await this.seedUptimeChecks(monitors);

    console.log("📡 Uptime monitors seeding completed!");
  }

  private async seedMonitorGroups(
    organizationId: string,
  ): Promise<Record<string, string>> {
    console.log("  📂 Creating monitor groups...");

    const groups = [
      {
        id: uuidv4(),
        name: "Production Services",
        description: "TelemetryFlow production services and websites",
        display_order: 0,
      },
    ];

    const groupMap: Record<string, string> = {};

    for (const group of groups) {
      const exists = await this.dataSource.query(
        `SELECT id FROM uptime_monitor_groups WHERE organization_id = $1 AND name = $2`,
        [organizationId, group.name],
      );

      if (exists.length > 0) {
        console.log(`    ⏭️ Group "${group.name}" already exists`);
        groupMap[group.name] = exists[0].id;
        continue;
      }

      await this.dataSource.query(
        `INSERT INTO uptime_monitor_groups (
          id, name, description, display_order, is_expanded, monitor_ids,
          organization_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, true, '[]', $5, NOW(), NOW())`,
        [
          group.id,
          group.name,
          group.description,
          group.display_order,
          organizationId,
        ],
      );

      groupMap[group.name] = group.id;
      console.log(`    ✅ Created group: ${group.name}`);
    }

    return groupMap;
  }

  private async seedMonitors(
    organizationId: string,
    groups: Record<string, string>,
  ): Promise<Array<{ id: string; name: string }>> {
    console.log("  🖥️ Creating monitors...");

    /**
     * SSL profiles (synced with CH seed + frontend mock):
     *   telemetryflow.id         → 39 days, Let's Encrypt
     *   demo.telemetryflow.id    → 39 days, Let's Encrypt
     *   github.com/telemetryflow → 86 days, DigiCert Global CA G2
     *
     * Days computed relative to seed date (2026-03-10):
     *   telemetryflow.id  validTo = 2026-04-18  → 39d
     *   demo              validTo = 2026-04-18  → 39d
     *   github            validTo = 2026-06-04  → 86d
     */
    const now = new Date();
    const sslProfiles: Record<string, {
      issuer: string;
      subject: string;
      daysUntilExpiry: number;
      protocol: string;
      cipher: string;
    }> = {
      "https://telemetryflow.id": {
        issuer: "Let's Encrypt",
        subject: "CN=telemetryflow.id",
        daysUntilExpiry: 39,
        protocol: "TLSv1.3",
        cipher: "TLS_AES_128_GCM_SHA256",
      },
      "https://demo.telemetryflow.id": {
        issuer: "Let's Encrypt",
        subject: "CN=demo.telemetryflow.id",
        daysUntilExpiry: 39,
        protocol: "TLSv1.3",
        cipher: "TLS_AES_128_GCM_SHA256",
      },
      "https://github.com/telemetryflow": {
        issuer: "DigiCert Global CA G2",
        subject: "CN=github.com",
        daysUntilExpiry: 86,
        protocol: "TLSv1.3",
        cipher: "TLS_AES_256_GCM_SHA384",
      },
    };

    const buildSslInfo = (url: string) => {
      const profile = sslProfiles[url];
      if (!profile) return null;
      const validTo = new Date(now.getTime() + profile.daysUntilExpiry * 24 * 60 * 60 * 1000);
      const validFrom = new Date(now.getTime() - 51 * 24 * 60 * 60 * 1000); // ~90d cert, 51d elapsed
      return {
        valid: true,
        issuer: profile.issuer,
        subject: profile.subject,
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        daysUntilExpiry: profile.daysUntilExpiry,
        protocol: profile.protocol,
        cipher: profile.cipher,
      };
    };

    const monitors = [
      {
        id: uuidv4(),
        name: "TelemetryFlow Official Website",
        description: "TelemetryFlow Official Website (Landing Page)",
        url: "https://telemetryflow.id",
        type: MonitorType.HTTPS,
        status: MonitorStatus.UP,
        interval: 60,
        timeout: 30,
        retries: 3,
        http_method: HttpMethod.GET,
        accepted_status_codes: [200, 301, 302],
        group_id: groups["Production Services"],
        tags: ["observability", "telemetryflow", "website"],
        environment: "production",
        uptime_24h: 100.0,
        uptime_7d: 99.98,
        uptime_30d: 99.95,
        uptime_90d: 99.92,
        avg_response_time_24h: 145,
        avg_response_time_7d: 152,
        ssl_expiry_warning_days: 30,
      },
      {
        id: uuidv4(),
        name: "TelemetryFlow Demo Website",
        description: "TelemetryFlow Demo Environment Website",
        url: "https://demo.telemetryflow.id",
        type: MonitorType.HTTPS,
        status: MonitorStatus.UP,
        interval: 60,
        timeout: 30,
        retries: 3,
        http_method: HttpMethod.GET,
        accepted_status_codes: [200, 301, 302],
        group_id: groups["Production Services"],
        tags: ["observability", "telemetryflow", "demo"],
        environment: "production",
        uptime_24h: 100.0,
        uptime_7d: 99.95,
        uptime_30d: 99.90,
        uptime_90d: 99.88,
        avg_response_time_24h: 180,
        avg_response_time_7d: 195,
        ssl_expiry_warning_days: 30,
      },
      {
        id: uuidv4(),
        name: "TelemetryFlow GitHub Repository",
        description: "TelemetryFlow GitHub Organization Repository",
        url: "https://github.com/telemetryflow",
        type: MonitorType.HTTPS,
        status: MonitorStatus.UP,
        interval: 120,
        timeout: 30,
        retries: 2,
        http_method: HttpMethod.GET,
        accepted_status_codes: [200, 301, 302],
        group_id: groups["Production Services"],
        tags: ["observability", "telemetryflow", "github", "repository"],
        environment: "production",
        uptime_24h: 100.0,
        uptime_7d: 99.99,
        uptime_30d: 99.97,
        uptime_90d: 99.95,
        avg_response_time_24h: 120,
        avg_response_time_7d: 135,
        ssl_expiry_warning_days: 30,
      },
    ];

    const createdMonitors: Array<{ id: string; name: string }> = [];

    for (const monitor of monitors) {
      const exists = await this.dataSource.query(
        `SELECT id FROM uptime_monitors WHERE organization_id = $1 AND url = $2`,
        [organizationId, monitor.url],
      );

      const sslInfo = buildSslInfo(monitor.url);

      if (exists.length > 0) {
        console.log(`    ⏭️ Monitor "${monitor.name}" already exists — backfilling last_ssl_info`);
        // Backfill last_ssl_info for monitors created before this column existed
        await this.dataSource.query(
          `UPDATE uptime_monitors SET last_ssl_info = $1 WHERE id = $2 AND last_ssl_info IS NULL`,
          [sslInfo ? JSON.stringify(sslInfo) : null, exists[0].id],
        );
        createdMonitors.push({ id: exists[0].id, name: monitor.name });
        continue;
      }

      await this.dataSource.query(
        `INSERT INTO uptime_monitors (
          id, name, description, url, type, status, interval, timeout, retries,
          retry_interval, is_active, is_paused, http_method, accepted_status_codes,
          group_id, tags, uptime_24h, uptime_7d, uptime_30d, uptime_90d,
          avg_response_time_24h, avg_response_time_7d, total_checks, successful_checks, failed_checks,
          consecutive_down_count, consecutive_up_count, ssl_expiry_warning_days, last_ssl_info,
          organization_id, next_check_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          10, true, false, $10, $11,
          $12, $13, $14, $15, $16, $17,
          $18, $19, 1000, 995, 5,
          0, 50, $21, $22,
          $20, NOW() + INTERVAL '1 minute', NOW(), NOW()
        )`,
        [
          monitor.id,
          monitor.name,
          monitor.description,
          monitor.url,
          monitor.type,
          monitor.status,
          monitor.interval,
          monitor.timeout,
          monitor.retries,
          monitor.http_method || null,
          monitor.accepted_status_codes
            ? JSON.stringify(monitor.accepted_status_codes)
            : null,
          monitor.group_id || null,
          JSON.stringify(monitor.tags || []),
          monitor.uptime_24h,
          monitor.uptime_7d,
          monitor.uptime_30d,
          monitor.uptime_90d,
          monitor.avg_response_time_24h,
          monitor.avg_response_time_7d,
          organizationId,
          monitor.ssl_expiry_warning_days ?? null,
          sslInfo ? JSON.stringify(sslInfo) : null,
        ],
      );

      createdMonitors.push({ id: monitor.id, name: monitor.name });
      console.log(`    ✅ Created monitor: ${monitor.name}`);
    }

    return createdMonitors;
  }

  private async seedUptimeChecks(
    monitors: Array<{ id: string; name: string }>,
  ): Promise<void> {
    console.log("  📈 Creating uptime check history...");

    // Check if uptime_checks table exists
    const tableExists = await this.dataSource.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'uptime_checks'
      )
    `);

    if (!tableExists[0].exists) {
      console.log(
        "    ℹ️ Uptime checks table does not exist yet. Skipping check history.",
      );
      return;
    }

    const now = new Date();

    for (const monitor of monitors) {
      // Check if we already have checks for this monitor
      const existingChecks = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM uptime_checks WHERE monitor_id = $1`,
        [monitor.id],
      );

      if (parseInt(existingChecks[0].count) > 0) {
        console.log(`    ⏭️ Checks for "${monitor.name}" already exist`);
        continue;
      }

      // Generate 100 historical checks over the last 24 hours
      const checks = [];
      for (let i = 0; i < 100; i++) {
        const checkedAt = new Date(now.getTime() - i * 15 * 60 * 1000); // Every 15 minutes
        const isSuccess = Math.random() > 0.02; // 98% success rate
        const responseTime = isSuccess
          ? Math.floor(Math.random() * 200) + 50
          : 0;

        checks.push({
          id: uuidv4(),
          monitor_id: monitor.id,
          status: isSuccess ? CheckStatus.SUCCESS : CheckStatus.FAILURE,
          status_code: isSuccess ? 200 : null,
          response_time: responseTime,
          timing: JSON.stringify({
            total: responseTime,
            dnsLookup: Math.floor(responseTime * 0.1),
            tcpConnection: Math.floor(responseTime * 0.2),
            tlsHandshake: Math.floor(responseTime * 0.3),
            firstByte: Math.floor(responseTime * 0.3),
            contentTransfer: Math.floor(responseTime * 0.1),
          }),
          message: isSuccess ? "OK" : "Connection timeout",
          error: isSuccess ? null : "ETIMEDOUT",
          checked_at: checkedAt.toISOString(),
        });
      }

      // Batch insert checks
      for (const check of checks) {
        await this.dataSource.query(
          `INSERT INTO uptime_checks (
            id, monitor_id, status, status_code, response_time, timing,
            message, error, checked_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
          [
            check.id,
            check.monitor_id,
            check.status,
            check.status_code,
            check.response_time,
            check.timing,
            check.message,
            check.error,
            check.checked_at,
          ],
        );
      }

      console.log(`    ✅ Created ${checks.length} checks for: ${monitor.name}`);
    }
  }
}

export const UptimeSeeds = [UptimeMonitorsSeed];

export const UptimeSeedConfig = {
  moduleName: "monitoring-uptime",
  database: "postgres" as const,
  seeds: UptimeSeeds,
};

export async function runUptimeSeeds(dataSource: DataSource): Promise<void> {
  console.log("\n========================================");
  console.log("📡 Running Uptime Monitor Seeds");
  console.log("========================================\n");

  for (const SeedClass of UptimeSeeds) {
    const seed = new SeedClass();
    await seed.run(dataSource);
  }

  console.log("\n========================================");
  console.log("✅ Uptime Monitor Seeds Complete");
  console.log("========================================\n");
}
