import { UptimeCheck } from "../aggregates/UptimeCheck";

/**
 * ClickHouse record for uptime_checks table
 */
export interface UptimeCheckRecord {
  checked_at: string;
  monitor_id: string;
  monitor_name: string;
  status: string;
  status_code: number;
  response_time: number;
  ip_address: string;
  region: string;
  error_message: string;
  ssl_days_remaining: number;
  organization_id: string;
  workspace_id: string;
  tenant_id: string;
}

/**
 * Hourly aggregation from uptime_checks_1h materialized view
 */
export interface UptimeCheckHourlyStat {
  hour: string;
  monitor_id: string;
  monitor_name: string;
  region: string;
  organization_id: string;
  total_checks: number;
  success_count: number;
  failure_count: number;
  avg_response_time: number;
  max_response_time: number;
  min_response_time: number;
  p50_response_time: number;
  p75_response_time: number;
  p90_response_time: number;
  p95_response_time: number;
  p99_response_time: number;
}

/**
 * Daily aggregation from uptime_checks_1d materialized view
 */
export interface UptimeCheckDailyStat {
  day: string;
  monitor_id: string;
  monitor_name: string;
  organization_id: string;
  total_checks: number;
  success_count: number;
  failure_count: number;
  avg_response_time: number;
}

/**
 * Uptime Check ClickHouse Repository Interface
 *
 * Handles time-series storage for uptime check results.
 * Write: insert check results for analytics + materialized view rollups.
 * Read: query raw checks + aggregated stats from materialized views.
 */
export interface IUptimeCheckClickHouseRepository {
  /** Insert a single check result */
  insertCheck(
    check: UptimeCheck,
    context: {
      monitorName: string;
      organizationId: string;
      workspaceId?: string;
      tenantId?: string;
    },
  ): Promise<void>;

  /** Insert a batch of check results */
  insertChecks(
    checks: UptimeCheck[],
    context: {
      monitorName: string;
      organizationId: string;
      workspaceId?: string;
      tenantId?: string;
    },
  ): Promise<void>;

  /** Query raw check results */
  queryChecks(params: {
    monitorId: string;
    organizationId: string;
    from?: Date;
    to?: Date;
    status?: string;
    limit?: number;
  }): Promise<UptimeCheckRecord[]>;

  /** Query hourly aggregated stats from materialized view */
  queryHourlyStats(params: {
    monitorId: string;
    organizationId: string;
    from: Date;
    to: Date;
  }): Promise<UptimeCheckHourlyStat[]>;

  /** Query daily aggregated stats from materialized view */
  queryDailyStats(params: {
    monitorId: string;
    organizationId: string;
    from: Date;
    to: Date;
  }): Promise<UptimeCheckDailyStat[]>;
}

export const UPTIME_CHECK_CLICKHOUSE_REPOSITORY = Symbol(
  "UPTIME_CHECK_CLICKHOUSE_REPOSITORY",
);
