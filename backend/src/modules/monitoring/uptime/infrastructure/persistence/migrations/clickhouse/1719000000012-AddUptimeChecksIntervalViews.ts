import { ClickHouseClient } from "@clickhouse/client";
import { BaseClickHouseMigration } from "../../../../../../../database/shared/BaseClickHouseMigration";

/**
 * Uptime Checks Interval Views
 *
 * Adds 5m, 15m, and 6h materialized views to fill interval gaps
 * between existing 1h and 1d views.
 */
export class AddUptimeChecksIntervalViews1719000000012 extends BaseClickHouseMigration {
  name = "AddUptimeChecksIntervalViews1719000000012";
  moduleName = "monitoring-uptime";

  async up(client: ClickHouseClient, database: string): Promise<void> {
    this.log("Creating uptime_checks 5m, 15m, 6h interval views...");

    // 5-minute rollup
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_5m
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(five_minutes)
        ORDER BY (organization_id, monitor_id, region, five_minutes)
        AS SELECT
          toStartOfFiveMinutes(checked_at) AS five_minutes,
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
        GROUP BY five_minutes, monitor_id, monitor_name, region, organization_id, workspace_id, tenant_id
      `,
    });

    // 15-minute rollup
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_15m
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(fifteen_minutes)
        ORDER BY (organization_id, monitor_id, region, fifteen_minutes)
        AS SELECT
          toStartOfFifteenMinutes(checked_at) AS fifteen_minutes,
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
        GROUP BY fifteen_minutes, monitor_id, monitor_name, region, organization_id, workspace_id, tenant_id
      `,
    });

    // 6-hour rollup
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_6h
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(six_hours)
        ORDER BY (organization_id, monitor_id, region, six_hours)
        AS SELECT
          toStartOfInterval(checked_at, INTERVAL 6 HOUR) AS six_hours,
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
        GROUP BY six_hours, monitor_id, monitor_name, region, organization_id, workspace_id, tenant_id
      `,
    });

    this.log("Uptime checks interval views created");
  }

  async down(client: ClickHouseClient, database: string): Promise<void> {
    this.log("Dropping uptime_checks interval views...");
    await client.command({
      query: `DROP VIEW IF EXISTS ${database}.uptime_checks_6h`,
    });
    await client.command({
      query: `DROP VIEW IF EXISTS ${database}.uptime_checks_15m`,
    });
    await client.command({
      query: `DROP VIEW IF EXISTS ${database}.uptime_checks_5m`,
    });
    this.log("Uptime checks interval views dropped");
  }
}
