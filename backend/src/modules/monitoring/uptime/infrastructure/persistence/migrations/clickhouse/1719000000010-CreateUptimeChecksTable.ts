import { ClickHouseClient } from "@clickhouse/client";
import { BaseClickHouseMigration } from "../../../../../../../database/shared/BaseClickHouseMigration";

/**
 * Uptime Checks ClickHouse Migration
 *
 * Creates the time-series table for uptime probe check results.
 * High-volume data: each monitor runs every 60s from multiple regions.
 *
 * Materialized views for:
 * - uptime_checks_1h: Hourly aggregation (avg/p95/p99 response time, success rate)
 * - uptime_checks_1d: Daily aggregation (uptime %, avg response time)
 */
export class CreateUptimeChecksTable1719000000010 extends BaseClickHouseMigration {
  name = "CreateUptimeChecksTable1719000000010";
  moduleName = "monitoring-uptime";

  async up(client: ClickHouseClient, database: string): Promise<void> {
    this.log("Creating uptime_checks table and views...");

    // Create uptime_checks table
    await client.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${database}.uptime_checks (
          -- Timestamps
          checked_at DateTime64(3),

          -- Monitor identification
          monitor_id String,
          monitor_name String,

          -- Check result
          status Enum8('success' = 1, 'failure' = 2, 'timeout' = 3, 'error' = 4),
          status_code UInt16,
          response_time UInt32,

          -- Network details
          ip_address String DEFAULT '',
          region String DEFAULT '',

          -- Error details
          error_message String DEFAULT '',

          -- SSL info
          ssl_days_remaining Int32 DEFAULT -1,

          -- Multi-tenancy
          organization_id String DEFAULT '',
          workspace_id String DEFAULT '',
          tenant_id String DEFAULT ''
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMMDD(checked_at)
        ORDER BY (organization_id, monitor_id, checked_at)
        TTL toDateTime(checked_at) + INTERVAL 90 DAY
        SETTINGS index_granularity = 8192
      `,
    });

    // Create indexes
    const indexes = [
      { name: "idx_checked_at", column: "checked_at", type: "minmax" },
      {
        name: "idx_monitor_id",
        column: "monitor_id",
        type: "bloom_filter",
      },
      { name: "idx_status", column: "status", type: "set(4)" },
      { name: "idx_region", column: "region", type: "set(20)" },
      {
        name: "idx_organization_id",
        column: "organization_id",
        type: "bloom_filter",
      },
      {
        name: "idx_workspace_id",
        column: "workspace_id",
        type: "bloom_filter",
      },
    ];

    for (const idx of indexes) {
      try {
        await client.command({
          query: `ALTER TABLE ${database}.uptime_checks ADD INDEX IF NOT EXISTS ${idx.name} ${idx.column} TYPE ${idx.type} GRANULARITY 1`,
        });
      } catch {
        // Index might already exist
      }
    }

    this.log("uptime_checks table created");
  }

  async down(client: ClickHouseClient, database: string): Promise<void> {
    this.log("Dropping uptime_checks table...");

    await client.command({
      query: `DROP TABLE IF EXISTS ${database}.uptime_checks`,
    });

    this.log("uptime_checks table dropped");
  }
}
