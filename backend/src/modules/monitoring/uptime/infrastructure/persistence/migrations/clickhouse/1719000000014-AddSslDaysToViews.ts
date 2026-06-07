import { ClickHouseClient } from "@clickhouse/client";
import { BaseClickHouseMigration } from "../../../../../../../database/shared/BaseClickHouseMigration";

/**
 * Add ssl_days_remaining to all Uptime Materialized Views
 *
 * Before this migration, ssl_days_remaining was stored in the raw
 * uptime_checks table but NOT in any materialized view, making it
 * impossible to query SSL expiry trends without full-table scans.
 *
 * Changes:
 * - uptime_checks_1h  (AggregatingMergeTree): adds minState(ssl_days_remaining)
 * - uptime_checks_5m  (AggregatingMergeTree): adds minState(ssl_days_remaining)
 * - uptime_checks_15m (AggregatingMergeTree): adds minState(ssl_days_remaining)
 * - uptime_checks_6h  (AggregatingMergeTree): adds minState(ssl_days_remaining)
 * - uptime_checks_1d  (SummingMergeTree):     adds min(ssl_days_remaining)
 *
 * Query convention: filter `min_ssl_days_remaining >= 0` to exclude
 * non-HTTPS monitors (stored as -1).
 */
export class AddSslDaysToViews1719000000014 extends BaseClickHouseMigration {
  name = "AddSslDaysToViews1719000000014";
  moduleName = "monitoring-uptime";

  async up(client: ClickHouseClient, database: string): Promise<void> {
    this.log("Adding ssl_days_remaining to uptime materialized views...");

    const viewsToDrop = [
      "uptime_checks_1h",
      "uptime_checks_5m",
      "uptime_checks_15m",
      "uptime_checks_6h",
      "uptime_checks_1d",
    ];
    for (const view of viewsToDrop) {
      await client.command({
        query: `DROP VIEW IF EXISTS ${database}.${view}`,
      });
    }
    this.log("Dropped existing views for rebuild");

    const dimensionColumns = `monitor_id, monitor_name, region, organization_id, workspace_id, tenant_id`;

    // Shared aggregate columns for AggregatingMergeTree views (1h / 5m / 15m / 6h)
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
          quantileState(0.99)(response_time) AS p99_response_time,
          minState(ssl_days_remaining) AS min_ssl_days_remaining`;

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

    // ---- Recreate uptime_checks_1d (SummingMergeTree — no *State functions) ----
    // Note: region is not in ORDER BY for 1d view (aggregated across regions)
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
          avg(response_time) AS avg_response_time,
          min(ssl_days_remaining) AS min_ssl_days_remaining
        FROM ${database}.uptime_checks
        GROUP BY day, monitor_id, monitor_name, organization_id, workspace_id, tenant_id
      `,
    });

    this.log("Materialized views recreated with ssl_days_remaining column");

    // ---- Backfill 1h view from raw data ----
    try {
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
    } catch (err) {
      this.log(
        "Backfill skipped (no raw data or insert error) — new data will populate the view",
      );
    }

    // ---- Backfill 1d view from raw data ----
    try {
      await client.command({
        query: `
          INSERT INTO ${database}.uptime_checks_1d
          SELECT
            toDate(checked_at) AS day,
            monitor_id,
            monitor_name,
            organization_id,
            workspace_id,
            tenant_id,
            count() AS total_checks,
            countIf(status = 'success') AS success_count,
            countIf(status = 'failure' OR status = 'timeout' OR status = 'error') AS failure_count,
            avg(response_time) AS avg_response_time,
            min(ssl_days_remaining) AS min_ssl_days_remaining
          FROM ${database}.uptime_checks
          GROUP BY day, monitor_id, monitor_name, organization_id, workspace_id, tenant_id
        `,
      });
      this.log("Backfilled uptime_checks_1d from raw data");
    } catch (err) {
      this.log(
        "Backfill skipped (no raw data or insert error) — new data will populate the view",
      );
    }
  }

  async down(client: ClickHouseClient, database: string): Promise<void> {
    this.log(
      "Reverting ssl_days_remaining from views (restoring migration-13 state)...",
    );

    const viewsToDrop = [
      "uptime_checks_1h",
      "uptime_checks_5m",
      "uptime_checks_15m",
      "uptime_checks_6h",
      "uptime_checks_1d",
    ];
    for (const view of viewsToDrop) {
      await client.command({
        query: `DROP VIEW IF EXISTS ${database}.${view}`,
      });
    }

    const dimensionColumns = `monitor_id, monitor_name, region, organization_id, workspace_id, tenant_id`;

    // Restore migration-13 state (without ssl_days_remaining)
    const aggregateColumnsNoSsl = `
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

    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_1h
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(hour)
        ORDER BY (organization_id, monitor_id, region, hour)
        AS SELECT
          toStartOfHour(checked_at) AS hour,
          ${dimensionColumns},
          ${aggregateColumnsNoSsl}
        FROM ${database}.uptime_checks
        GROUP BY hour, ${dimensionColumns}
      `,
    });

    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_5m
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(five_minutes)
        ORDER BY (organization_id, monitor_id, region, five_minutes)
        AS SELECT
          toStartOfFiveMinutes(checked_at) AS five_minutes,
          ${dimensionColumns},
          ${aggregateColumnsNoSsl}
        FROM ${database}.uptime_checks
        GROUP BY five_minutes, ${dimensionColumns}
      `,
    });

    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_15m
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(fifteen_minutes)
        ORDER BY (organization_id, monitor_id, region, fifteen_minutes)
        AS SELECT
          toStartOfFifteenMinutes(checked_at) AS fifteen_minutes,
          ${dimensionColumns},
          ${aggregateColumnsNoSsl}
        FROM ${database}.uptime_checks
        GROUP BY fifteen_minutes, ${dimensionColumns}
      `,
    });

    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS ${database}.uptime_checks_6h
        ENGINE = AggregatingMergeTree()
        PARTITION BY toYYYYMM(six_hours)
        ORDER BY (organization_id, monitor_id, region, six_hours)
        AS SELECT
          toStartOfInterval(checked_at, INTERVAL 6 HOUR) AS six_hours,
          ${dimensionColumns},
          ${aggregateColumnsNoSsl}
        FROM ${database}.uptime_checks
        GROUP BY six_hours, ${dimensionColumns}
      `,
    });

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

    this.log(
      "Views restored to migration-13 state (without ssl_days_remaining)",
    );
  }
}
