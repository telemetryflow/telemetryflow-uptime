import { ClickHouseClient } from "@clickhouse/client";
import { BaseClickHouseMigration } from "../../../../../../../database/shared/BaseClickHouseMigration";

/**
 * Add P75/P90 Percentile Columns to Materialized Views
 *
 * The stats endpoint requires P50/P75/P90/P95/P99 but the existing views
 * only have P50/P95/P99. This migration:
 * 1. Drops and recreates 1h, 5m, 15m, 6h views with P75/P90 added
 * 2. Backfills the 1h view from raw uptime_checks data
 *
 * Daily view (uptime_checks_1d) is untouched — SummingMergeTree does not
 * support AggregateFunction columns (quantileState).
 */
export class AddPercentileColumns1719000000013 extends BaseClickHouseMigration {
  name = "AddPercentileColumns1719000000013";
  moduleName = "monitoring-uptime";

  async up(client: ClickHouseClient, database: string): Promise<void> {
    this.log("Adding P75/P90 percentile columns to materialized views...");

    // ---- Drop existing views ----
    const viewsToDrop = [
      "uptime_checks_1h",
      "uptime_checks_5m",
      "uptime_checks_15m",
      "uptime_checks_6h",
    ];
    for (const view of viewsToDrop) {
      await client.command({
        query: `DROP VIEW IF EXISTS ${database}.${view}`,
      });
    }
    this.log("Dropped existing views for rebuild");

    // ---- Shared column set (all AggregatingMergeTree views) ----
    const aggregateColumns = `
          countState() AS total_checks,
          countIfState(status = 'success') AS success_count,
          countIfState(status = 'failure' OR status = 'timeout' OR status = 'error') AS failure_count,
          avgState(response_time) AS avg_response_time,
          maxState(response_time) AS max_response_time,
          minState(response_time) AS min_response_time,
          quantileState(0.50)(response_time) AS p50_response_time,
          quantileState(0.75)(response_time) AS p75_response_time,
          quantileState(0.90)(response_time) AS p90_response_time,
          quantileState(0.95)(response_time) AS p95_response_time,
          quantileState(0.99)(response_time) AS p99_response_time`;

    const dimensionColumns = `monitor_id, monitor_name, region, organization_id, workspace_id, tenant_id`;

    // ---- Recreate uptime_checks_1h ----
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_1h
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(hour)
        ORDER BY (organization_id, monitor_id, region, hour)
        AS SELECT
          toStartOfHour(checked_at) AS hour,
          ${dimensionColumns},
          ${aggregateColumns}
        FROM ${database}.uptime_checks
        GROUP BY hour, ${dimensionColumns}
      `,
    });

    // ---- Recreate uptime_checks_5m ----
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_5m
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(five_minutes)
        ORDER BY (organization_id, monitor_id, region, five_minutes)
        AS SELECT
          toStartOfFiveMinutes(checked_at) AS five_minutes,
          ${dimensionColumns},
          ${aggregateColumns}
        FROM ${database}.uptime_checks
        GROUP BY five_minutes, ${dimensionColumns}
      `,
    });

    // ---- Recreate uptime_checks_15m ----
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_15m
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(fifteen_minutes)
        ORDER BY (organization_id, monitor_id, region, fifteen_minutes)
        AS SELECT
          toStartOfFifteenMinutes(checked_at) AS fifteen_minutes,
          ${dimensionColumns},
          ${aggregateColumns}
        FROM ${database}.uptime_checks
        GROUP BY fifteen_minutes, ${dimensionColumns}
      `,
    });

    // ---- Recreate uptime_checks_6h ----
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_6h
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(six_hours)
        ORDER BY (organization_id, monitor_id, region, six_hours)
        AS SELECT
          toStartOfInterval(checked_at, INTERVAL 6 HOUR) AS six_hours,
          ${dimensionColumns},
          ${aggregateColumns}
        FROM ${database}.uptime_checks
        GROUP BY six_hours, ${dimensionColumns}
      `,
    });

    this.log("Materialized views recreated with P75/P90 columns");

    // ---- Backfill 1h view from raw data ----
    await client.command({
      query: `
        INSERT INTO ${database}.uptime_checks_1h
        SELECT
          toStartOfHour(checked_at) AS hour,
          ${dimensionColumns},
          ${aggregateColumns}
        FROM ${database}.uptime_checks
        GROUP BY hour, ${dimensionColumns}
      `,
    });

    this.log("Backfilled uptime_checks_1h from raw data");
  }

  async down(client: ClickHouseClient, database: string): Promise<void> {
    this.log("Reverting P75/P90 percentile columns (restoring original views)...");

    const viewsToDrop = [
      "uptime_checks_1h",
      "uptime_checks_5m",
      "uptime_checks_15m",
      "uptime_checks_6h",
    ];
    for (const view of viewsToDrop) {
      await client.command({
        query: `DROP VIEW IF EXISTS ${database}.${view}`,
      });
    }

    // Original columns without P75/P90
    const originalAggregateColumns = `
          countState() AS total_checks,
          countIfState(status = 'success') AS success_count,
          countIfState(status = 'failure' OR status = 'timeout' OR status = 'error') AS failure_count,
          avgState(response_time) AS avg_response_time,
          maxState(response_time) AS max_response_time,
          minState(response_time) AS min_response_time,
          quantileState(0.50)(response_time) AS p50_response_time,
          quantileState(0.95)(response_time) AS p95_response_time,
          quantileState(0.99)(response_time) AS p99_response_time`;

    const dimensionColumns = `monitor_id, monitor_name, region, organization_id, workspace_id, tenant_id`;

    // Restore original 1h view
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_1h
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(hour)
        ORDER BY (organization_id, monitor_id, region, hour)
        AS SELECT
          toStartOfHour(checked_at) AS hour,
          ${dimensionColumns},
          ${originalAggregateColumns}
        FROM ${database}.uptime_checks
        GROUP BY hour, ${dimensionColumns}
      `,
    });

    // Restore original 5m view
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_5m
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(five_minutes)
        ORDER BY (organization_id, monitor_id, region, five_minutes)
        AS SELECT
          toStartOfFiveMinutes(checked_at) AS five_minutes,
          ${dimensionColumns},
          ${originalAggregateColumns}
        FROM ${database}.uptime_checks
        GROUP BY five_minutes, ${dimensionColumns}
      `,
    });

    // Restore original 15m view
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_15m
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(fifteen_minutes)
        ORDER BY (organization_id, monitor_id, region, fifteen_minutes)
        AS SELECT
          toStartOfFifteenMinutes(checked_at) AS fifteen_minutes,
          ${dimensionColumns},
          ${originalAggregateColumns}
        FROM ${database}.uptime_checks
        GROUP BY fifteen_minutes, ${dimensionColumns}
      `,
    });

    // Restore original 6h view
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_6h
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(six_hours)
        ORDER BY (organization_id, monitor_id, region, six_hours)
        AS SELECT
          toStartOfInterval(checked_at, INTERVAL 6 HOUR) AS six_hours,
          ${dimensionColumns},
          ${originalAggregateColumns}
        FROM ${database}.uptime_checks
        GROUP BY six_hours, ${dimensionColumns}
      `,
    });

    this.log("Original views restored without P75/P90");
  }
}
