import { ClickHouseClient } from "@clickhouse/client";
import { BaseClickHouseMigration } from "../../../../../../../database/shared/BaseClickHouseMigration";

/**
 * Uptime Checks Materialized Views
 *
 * Rollup cascade for uptime check data:
 * - uptime_checks_1h: Hourly aggregation (response time stats, success/failure counts)
 * - uptime_checks_1d: Daily aggregation (uptime percentage, avg latency per region)
 */
export class CreateUptimeChecksViews1719000000011 extends BaseClickHouseMigration {
  name = "CreateUptimeChecksViews1719000000011";
  moduleName = "monitoring-uptime";

  async up(client: ClickHouseClient, database: string): Promise<void> {
    this.log("Creating uptime_checks materialized views...");

    // Hourly aggregation: response time percentiles + success/failure counts
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_1h
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(hour)
        ORDER BY (organization_id, monitor_id, region, hour)
        AS SELECT
          toStartOfHour(checked_at) AS hour,
          monitor_id,
          monitor_name,
          region,
          organization_id,
          workspace_id,
          tenant_id,
          countState() AS total_checks,
          countIfState(status = 'success') AS success_count,
          countIfState(status = 'failure' OR status = 'timeout' OR status = 'error') AS failure_count,
          avgState(response_time) AS avg_response_time,
          maxState(response_time) AS max_response_time,
          minState(response_time) AS min_response_time,
          quantileState(0.50)(response_time) AS p50_response_time,
          quantileState(0.95)(response_time) AS p95_response_time,
          quantileState(0.99)(response_time) AS p99_response_time
        FROM ${database}.uptime_checks
        GROUP BY hour, monitor_id, monitor_name, region, organization_id, workspace_id, tenant_id
      `,
    });

    // Daily aggregation: uptime percentage + avg response time per monitor
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_1d
        ENGINE = SummingMergeTree()
        PARTITION BY toYYYYMM(day)
        ORDER BY (organization_id, monitor_id, day)
        AS SELECT
          toDate(checked_at) AS day,
          monitor_id,
          monitor_name,
          organization_id,
          workspace_id,
          tenant_id,
          count() AS total_checks,
          countIf(status = 'success') AS success_count,
          countIf(status = 'failure' OR status = 'timeout' OR status = 'error') AS failure_count,
          avg(response_time) AS avg_response_time
        FROM ${database}.uptime_checks
        GROUP BY day, monitor_id, monitor_name, organization_id, workspace_id, tenant_id
      `,
    });

    this.log("Uptime checks views created");
  }

  async down(client: ClickHouseClient, database: string): Promise<void> {
    this.log("Dropping uptime_checks materialized views...");

    await client.command({
      query: `DROP VIEW IF EXISTS ${database}.uptime_checks_1d`,
    });
    await client.command({
      query: `DROP VIEW IF EXISTS ${database}.uptime_checks_1h`,
    });

    this.log("Uptime checks views dropped");
  }
}
