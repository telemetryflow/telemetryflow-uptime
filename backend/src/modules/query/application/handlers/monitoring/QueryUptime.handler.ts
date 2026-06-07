import { QueryHandler, IQueryHandler } from "@nestjs/cqrs";
import { Logger, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ClickHouseService } from "@/shared/clickhouse/clickhouse.service";
import { DEFAULT_QUERY_LIMIT } from "@/shared/dto/pagination.dto";
import {
  QueryUptimeMonitorsQuery,
  GetUptimeMonitorByIdQuery,
  GetUptimeMonitorStatsQuery,
  GetUptimeMonitorChecksQuery,
  GetUptimeMonitorDailyStatsQuery,
  GetUptimeMonitorHourlyStatsQuery,
  GetUptimeMonitorSSLTrendQuery,
  GetUptimeSSLSummaryQuery,
} from "../../queries/monitoring";

// Explicit column lists (avoids SELECT alias.*)
const MONITOR_COLUMNS = [
  "m.id",
  "m.name",
  "m.description",
  "m.url",
  "m.type",
  "m.status",
  "m.interval",
  "m.timeout",
  "m.retries",
  "m.retry_interval",
  "m.is_active",
  "m.is_paused",
  "m.http_method",
  "m.http_headers",
  "m.http_body",
  "m.http_body_encoding",
  "m.follow_redirects",
  "m.max_redirects",
  "m.accepted_status_codes",
  "m.ignore_tls_errors",
  "m.keyword",
  "m.keyword_invert",
  "m.json_path",
  "m.json_expected_value",
  "m.json_operator",
  "m.auth_method",
  "m.auth_username",
  "m.auth_password",
  "m.auth_token",
  "m.api_key_header",
  "m.api_key_value",
  "m.db_connection_string",
  "m.db_query",
  "m.db_expected_result",
  "m.dns_resolve_server",
  "m.dns_resolve_type",
  "m.dns_expected_result",
  "m.ssl_expiry_warning_days",
  "m.ssl_check_chain",
  "m.notification_channels",
  "m.alert_after_down_count",
  "m.notification_resend_interval",
  "m.notify_on_recovery",
  "m.group_id",
  "m.tags",
  "m.uptime_24h",
  "m.uptime_7d",
  "m.uptime_30d",
  "m.uptime_90d",
  "m.avg_response_time_24h",
  "m.avg_response_time_7d",
  "m.total_checks",
  "m.successful_checks",
  "m.failed_checks",
  "m.last_check_at",
  "m.last_response_time",
  "m.last_status_change",
  "m.consecutive_down_count",
  "m.consecutive_up_count",
  "m.next_check_at",
  "m.organization_id",
  "m.workspace_id",
  "m.metadata",
  "m.created_at",
  "m.updated_at",
  "m.deleted_at",
].join(", ");
const CHECK_COLUMNS = [
  "c.id",
  "c.monitor_id",
  "c.status",
  "c.status_code",
  "c.response_time",
  "c.timing",
  "c.message",
  "c.error",
  "c.ssl_info",
  "c.response_body",
  "c.response_headers",
  "c.ip_address",
  "c.region",
  "c.checked_at",
  "c.created_at",
].join(", ");

/**
 * Query Uptime Monitors Handler
 * Lists uptime monitors with filtering, pagination, and tenant context
 */
@QueryHandler(QueryUptimeMonitorsQuery)
export class QueryUptimeMonitorsHandler implements IQueryHandler<QueryUptimeMonitorsQuery> {
  private readonly logger = new Logger(QueryUptimeMonitorsHandler.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(query: QueryUptimeMonitorsQuery) {
    const { tenantContext, filter, pagination } = query;
    const page = pagination?.page || 1;
    const limit = pagination?.limit || DEFAULT_QUERY_LIMIT;
    const offset = pagination?.offset ?? (page - 1) * limit;

    const qb = this.dataSource
      .createQueryBuilder()
      .select(MONITOR_COLUMNS)
      .addSelect(
        `(SELECT COALESCE(json_agg(sub ORDER BY sub.checked_at ASC), '[]'::json)
          FROM (
            SELECT c.status, c.checked_at
            FROM uptime_checks c
            WHERE c.monitor_id = m.id
            ORDER BY c.checked_at DESC
            LIMIT 100
          ) sub)`,
        "heartbeats",
      )
      .from("uptime_monitors", "m")
      .where("m.organization_id = :organizationId", {
        organizationId: tenantContext.organizationId,
      })
      .andWhere("m.deleted_at IS NULL");

    if (tenantContext.workspaceId) {
      qb.andWhere("m.workspace_id = :workspaceId", {
        workspaceId: tenantContext.workspaceId,
      });
    }

    // Apply filters
    if (filter?.name) {
      qb.andWhere("m.name ILIKE :name", { name: `%${filter.name}%` });
    }
    if (filter?.url) {
      qb.andWhere("m.url ILIKE :url", { url: `%${filter.url}%` });
    }
    if (filter?.type) {
      qb.andWhere("m.type = :type", { type: filter.type });
    }
    if (filter?.status) {
      qb.andWhere("m.status = :status", { status: filter.status });
    }
    if (filter?.statuses && filter.statuses.length > 0) {
      qb.andWhere("m.status IN (:...statuses)", {
        statuses: filter.statuses,
      });
    }
    if (filter?.isActive !== undefined) {
      qb.andWhere("m.is_active = :isActive", { isActive: filter.isActive });
    }
    if (filter?.isPaused !== undefined) {
      qb.andWhere("m.is_paused = :isPaused", { isPaused: filter.isPaused });
    }
    if (filter?.groupId) {
      qb.andWhere("m.group_id = :groupId", { groupId: filter.groupId });
    }
    if (filter?.tags && filter.tags.length > 0) {
      qb.andWhere("m.tags && :tags", { tags: filter.tags });
    }

    // Get total count
    const countQb = qb.clone();
    const countResult = await countQb.select("COUNT(*)", "count").getRawOne();
    const total = parseInt(countResult?.count || "0", 10);

    // Apply pagination
    qb.orderBy("m.created_at", "DESC");
    qb.limit(limit);
    qb.offset(offset);

    const data = await qb.getRawMany();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
}

/**
 * Get Uptime Monitor By ID Handler
 */
@QueryHandler(GetUptimeMonitorByIdQuery)
export class GetUptimeMonitorByIdHandler implements IQueryHandler<GetUptimeMonitorByIdQuery> {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(query: GetUptimeMonitorByIdQuery) {
    const { tenantContext, monitorId } = query;

    const result = await this.dataSource
      .createQueryBuilder()
      .select(MONITOR_COLUMNS)
      .from("uptime_monitors", "m")
      .where("m.id = :monitorId", { monitorId })
      .andWhere("m.organization_id = :organizationId", {
        organizationId: tenantContext.organizationId,
      })
      .andWhere("m.deleted_at IS NULL")
      .getRawOne();

    if (!result) {
      throw new NotFoundException(
        `Uptime monitor with ID ${monitorId} not found`,
      );
    }

    return result;
  }
}

/**
 * Get Uptime Monitor Stats Handler
 * Returns uptime percentages and average response time for a specific monitor
 */
@QueryHandler(GetUptimeMonitorStatsQuery)
export class GetUptimeMonitorStatsHandler implements IQueryHandler<GetUptimeMonitorStatsQuery> {
  private readonly logger = new Logger(GetUptimeMonitorStatsHandler.name);
  private readonly database: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clickhouseService: ClickHouseService,
  ) {
    this.database = process.env.CLICKHOUSE_DB || "telemetryflow_db";
  }

  async execute(query: GetUptimeMonitorStatsQuery) {
    const { tenantContext, monitorId } = query;
    const organizationId = tenantContext.organizationId;

    // Verify monitor exists and belongs to tenant (PostgreSQL — config data)
    const monitor = await this.dataSource
      .createQueryBuilder()
      .select("m.id")
      .from("uptime_monitors", "m")
      .where("m.id = :monitorId", { monitorId })
      .andWhere("m.organization_id = :organizationId", {
        organizationId,
      })
      .andWhere("m.deleted_at IS NULL")
      .getRawOne();

    if (!monitor) {
      throw new NotFoundException(
        `Uptime monitor with ID ${monitorId} not found`,
      );
    }

    const client = this.clickhouseService.getClient();

    // All-time counts from daily materialized view
    const allTimeCountsResult = await client.query({
      query: `
        SELECT
          sum(total_checks) AS total_checks,
          sum(success_count) AS success_count,
          sum(failure_count) AS failure_count
        FROM ${this.database}.uptime_checks_1d
        WHERE monitor_id = {monitorId:String}
          AND organization_id = {organizationId:String}
      `,
      query_params: { monitorId, organizationId },
      format: "JSONEachRow",
    });
    const allTimeCounts =
      ((await allTimeCountsResult.json()) as any[])[0] || {};

    // All-time response time stats from hourly materialized view
    const allTimeResponseResult = await client.query({
      query: `
        SELECT
          avgMerge(avg_response_time) AS avg_response_time,
          maxMerge(max_response_time) AS max_response_time,
          minMerge(min_response_time) AS min_response_time
        FROM ${this.database}.uptime_checks_1h
        WHERE monitor_id = {monitorId:String}
          AND organization_id = {organizationId:String}
      `,
      query_params: { monitorId, organizationId },
      format: "JSONEachRow",
    });
    const allTimeResponse =
      ((await allTimeResponseResult.json()) as any[])[0] || {};

    // Windowed stats: uptime% + percentiles from hourly view (24h, 7d, 30d, 90d)
    const [window24h, window7d, window30d, window90d] = await Promise.all([
      this.queryWindowedStats(client, monitorId, organizationId, 24),
      this.queryWindowedStats(client, monitorId, organizationId, 168), // 7 * 24
      this.queryWindowedStats(client, monitorId, organizationId, 720), // 30 * 24
      this.queryWindowedStats(client, monitorId, organizationId, 2160), // 90 * 24
    ]);

    const totalChecks = Number(allTimeCounts.total_checks || 0);
    const upChecks = Number(allTimeCounts.success_count || 0);
    const downChecks = Number(allTimeCounts.failure_count || 0);
    const uptimePercentage =
      totalChecks > 0
        ? parseFloat(((upChecks / totalChecks) * 100).toFixed(4))
        : 0;

    return {
      monitorId,
      totalChecks,
      upChecks,
      downChecks,
      uptimePercentage,
      avgResponseTimeMs: parseFloat(
        Number(allTimeResponse.avg_response_time || 0).toFixed(2),
      ),
      minResponseTimeMs: parseFloat(
        Number(allTimeResponse.min_response_time || 0).toFixed(2),
      ),
      maxResponseTimeMs: parseFloat(
        Number(allTimeResponse.max_response_time || 0).toFixed(2),
      ),
      uptime24h: window24h.uptimePercentage,
      uptime7d: window7d.uptimePercentage,
      uptime30d: window30d.uptimePercentage,
      uptime90d: window90d.uptimePercentage,
      percentiles24h: window24h.percentiles,
      percentiles7d: window7d.percentiles,
      percentiles30d: window30d.percentiles,
      percentiles90d: window90d.percentiles,
    };
  }

  /**
   * Query uptime% + percentiles from the hourly materialized view for a time window.
   * Merges pre-aggregated AggregatingMergeTree states for efficient reads.
   */
  private async queryWindowedStats(
    client: ReturnType<ClickHouseService["getClient"]>,
    monitorId: string,
    organizationId: string,
    intervalHours: number,
  ): Promise<{
    uptimePercentage: number;
    percentiles: {
      p50: number;
      p75: number;
      p90: number;
      p95: number;
      p99: number;
    };
  }> {
    const result = await client.query({
      query: `
        SELECT
          countMerge(total_checks) AS total_checks,
          countIfMerge(success_count) AS success_count,
          quantileMerge(0.50)(p50_response_time) AS p50,
          quantileMerge(0.75)(p75_response_time) AS p75,
          quantileMerge(0.90)(p90_response_time) AS p90,
          quantileMerge(0.95)(p95_response_time) AS p95,
          quantileMerge(0.99)(p99_response_time) AS p99
        FROM ${this.database}.uptime_checks_1h
        WHERE monitor_id = {monitorId:String}
          AND organization_id = {organizationId:String}
          AND hour >= now() - INTERVAL {intervalHours:UInt32} HOUR
      `,
      query_params: { monitorId, organizationId, intervalHours },
      format: "JSONEachRow",
    });

    const row = ((await result.json()) as any[])[0] || {};
    const totalChecks = Number(row.total_checks || 0);
    const successCount = Number(row.success_count || 0);
    const uptimePercentage =
      totalChecks > 0
        ? parseFloat(((successCount / totalChecks) * 100).toFixed(4))
        : 0;

    return {
      uptimePercentage,
      percentiles: {
        p50: Math.round(Number(row.p50 || 0)),
        p75: Math.round(Number(row.p75 || 0)),
        p90: Math.round(Number(row.p90 || 0)),
        p95: Math.round(Number(row.p95 || 0)),
        p99: Math.round(Number(row.p99 || 0)),
      },
    };
  }
}

/**
 * Get Uptime Monitor Checks Handler
 * Returns check history for a specific monitor
 */
@QueryHandler(GetUptimeMonitorChecksQuery)
export class GetUptimeMonitorChecksHandler implements IQueryHandler<GetUptimeMonitorChecksQuery> {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(query: GetUptimeMonitorChecksQuery) {
    const { tenantContext, monitorId, from, to, limit } = query;

    // Verify monitor exists and belongs to tenant
    const monitor = await this.dataSource
      .createQueryBuilder()
      .select("m.id")
      .from("uptime_monitors", "m")
      .where("m.id = :monitorId", { monitorId })
      .andWhere("m.organization_id = :organizationId", {
        organizationId: tenantContext.organizationId,
      })
      .andWhere("m.deleted_at IS NULL")
      .getRawOne();

    if (!monitor) {
      throw new NotFoundException(
        `Uptime monitor with ID ${monitorId} not found`,
      );
    }

    const qb = this.dataSource
      .createQueryBuilder()
      .select(CHECK_COLUMNS)
      .from("uptime_checks", "c")
      .where("c.monitor_id = :monitorId", { monitorId });

    if (from) {
      qb.andWhere("c.checked_at >= :from", { from });
    }
    if (to) {
      qb.andWhere("c.checked_at <= :to", { to });
    }

    qb.orderBy("c.checked_at", "DESC");
    qb.limit(limit || 100);

    const data = await qb.getRawMany();

    return {
      monitorId,
      data,
      total: data.length,
    };
  }
}

/**
 * Get Uptime Monitor Daily Stats Handler
 * Returns per-day uptime data from ClickHouse uptime_checks_1d materialized view.
 * Used by status page vertical bars to show real per-day up/down status.
 */
@QueryHandler(GetUptimeMonitorDailyStatsQuery)
export class GetUptimeMonitorDailyStatsHandler implements IQueryHandler<GetUptimeMonitorDailyStatsQuery> {
  private readonly logger = new Logger(GetUptimeMonitorDailyStatsHandler.name);
  private readonly database: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clickhouseService: ClickHouseService,
  ) {
    this.database = process.env.CLICKHOUSE_DB || "telemetryflow_db";
  }

  async execute(query: GetUptimeMonitorDailyStatsQuery) {
    const { tenantContext, monitorId, days } = query;
    const organizationId = tenantContext.organizationId;

    // Verify monitor exists and belongs to tenant (PostgreSQL)
    const monitor = await this.dataSource
      .createQueryBuilder()
      .select("m.id")
      .from("uptime_monitors", "m")
      .where("m.id = :monitorId", { monitorId })
      .andWhere("m.organization_id = :organizationId", {
        organizationId,
      })
      .andWhere("m.deleted_at IS NULL")
      .getRawOne();

    if (!monitor) {
      throw new NotFoundException(
        `Uptime monitor with ID ${monitorId} not found`,
      );
    }

    const client = this.clickhouseService.getClient();

    // Query per-day stats from the daily materialized view (SummingMergeTree)
    const result = await client.query({
      query: `
        SELECT
          day,
          sum(total_checks) AS total_checks,
          sum(success_count) AS success_count,
          sum(failure_count) AS failure_count
        FROM ${this.database}.uptime_checks_1d
        WHERE monitor_id = {monitorId:String}
          AND organization_id = {organizationId:String}
          AND day >= today() - {days:UInt32}
        GROUP BY day
        ORDER BY day ASC
      `,
      query_params: { monitorId, organizationId, days },
      format: "JSONEachRow",
    });

    const rows = (await result.json()) as any[];

    return {
      monitorId,
      days: rows.map((row) => ({
        date: row.day,
        totalChecks: Number(row.total_checks || 0),
        successCount: Number(row.success_count || 0),
        failureCount: Number(row.failure_count || 0),
        uptimePercentage:
          Number(row.total_checks || 0) > 0
            ? parseFloat(
                (
                  (Number(row.success_count || 0) /
                    Number(row.total_checks || 0)) *
                  100
                ).toFixed(2),
              )
            : 100,
      })),
    };
  }
}

/**
 * Get Uptime Monitor Hourly Stats Handler
 * Returns per-hour uptime data from ClickHouse uptime_checks_1h materialized view.
 * Used by frontend bar charts to show granular hourly up/down status.
 */
@QueryHandler(GetUptimeMonitorHourlyStatsQuery)
export class GetUptimeMonitorHourlyStatsHandler implements IQueryHandler<GetUptimeMonitorHourlyStatsQuery> {
  private readonly logger = new Logger(GetUptimeMonitorHourlyStatsHandler.name);
  private readonly database: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clickhouseService: ClickHouseService,
  ) {
    this.database = process.env.CLICKHOUSE_DB || "telemetryflow_db";
  }

  async execute(query: GetUptimeMonitorHourlyStatsQuery) {
    const { tenantContext, monitorId, hours } = query;
    const organizationId = tenantContext.organizationId;

    // Verify monitor exists and belongs to tenant (PostgreSQL)
    const monitor = await this.dataSource
      .createQueryBuilder()
      .select("m.id")
      .from("uptime_monitors", "m")
      .where("m.id = :monitorId", { monitorId })
      .andWhere("m.organization_id = :organizationId", {
        organizationId,
      })
      .andWhere("m.deleted_at IS NULL")
      .getRawOne();

    if (!monitor) {
      throw new NotFoundException(
        `Uptime monitor with ID ${monitorId} not found`,
      );
    }

    const client = this.clickhouseService.getClient();

    // Query per-hour stats from the hourly materialized view (AggregatingMergeTree)
    const result = await client.query({
      query: `
        SELECT
          hour,
          countMerge(total_checks) AS total_checks,
          countIfMerge(success_count) AS success_count,
          countIfMerge(failure_count) AS failure_count,
          avgMerge(avg_response_time) AS avg_response_time
        FROM ${this.database}.uptime_checks_1h
        WHERE monitor_id = {monitorId:String}
          AND organization_id = {organizationId:String}
          AND hour >= now() - INTERVAL {hours:UInt32} HOUR
        GROUP BY hour
        ORDER BY hour ASC
      `,
      query_params: { monitorId, organizationId, hours },
      format: "JSONEachRow",
    });

    const rows = (await result.json()) as any[];

    return {
      monitorId,
      hours: rows.map((row) => ({
        hour: row.hour,
        totalChecks: Number(row.total_checks || 0),
        successCount: Number(row.success_count || 0),
        failureCount: Number(row.failure_count || 0),
        avgResponseTimeMs: parseFloat(
          Number(row.avg_response_time || 0).toFixed(2),
        ),
      })),
    };
  }
}

/**
 * Get Uptime Monitor SSL Trend Handler
 * Returns per-hour min_ssl_days_remaining from ClickHouse uptime_checks_1h view.
 * Excludes -1 (non-HTTPS monitors) by filtering minMerge result >= 0.
 */
@QueryHandler(GetUptimeMonitorSSLTrendQuery)
export class GetUptimeMonitorSSLTrendHandler implements IQueryHandler<GetUptimeMonitorSSLTrendQuery> {
  private readonly logger = new Logger(GetUptimeMonitorSSLTrendHandler.name);
  private readonly database: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clickhouseService: ClickHouseService,
  ) {
    this.database = process.env.CLICKHOUSE_DB || "telemetryflow_db";
  }

  async execute(query: GetUptimeMonitorSSLTrendQuery) {
    const { tenantContext, monitorId, hours } = query;
    const organizationId = tenantContext.organizationId;

    const monitor = await this.dataSource
      .createQueryBuilder()
      .select("m.id")
      .from("uptime_monitors", "m")
      .where("m.id = :monitorId", { monitorId })
      .andWhere("m.organization_id = :organizationId", { organizationId })
      .andWhere("m.deleted_at IS NULL")
      .getRawOne();

    if (!monitor) {
      throw new NotFoundException(`Uptime monitor with ID ${monitorId} not found`);
    }

    const client = this.clickhouseService.getClient();

    // Query raw uptime_checks table to avoid -1 min contamination.
    // Failed checks store ssl_days_remaining = -1 which corrupts minState aggregates
    // in the 1h materialized view. Filtering ssl_days_remaining >= 0 at source gives
    // correct per-hour minimum SSL days remaining.
    const result = await client.query({
      query: `
        SELECT
          toStartOfHour(checked_at) AS hour,
          min(ssl_days_remaining) AS min_ssl_days
        FROM ${this.database}.uptime_checks
        WHERE monitor_id = {monitorId:String}
          AND organization_id = {organizationId:String}
          AND checked_at >= now() - INTERVAL {hours:UInt32} HOUR
          AND ssl_days_remaining >= 0
        GROUP BY hour
        ORDER BY hour ASC
      `,
      query_params: { monitorId, organizationId, hours },
      format: "JSONEachRow",
    });

    const rows = (await result.json()) as any[];

    return {
      monitorId,
      points: rows.map((row) => ({
        hour: row.hour,
        minSslDays: Number(row.min_ssl_days ?? 0),
      })),
    };
  }
}

/**
 * Get Uptime SSL Summary Handler
 * Returns org-wide SSL stats from ClickHouse uptime_checks_1h:
 *   total monitors with SSL data, near-expiry count (<30d), min and max days remaining.
 */
@QueryHandler(GetUptimeSSLSummaryQuery)
export class GetUptimeSSLSummaryHandler
  implements IQueryHandler<GetUptimeSSLSummaryQuery>
{
  private readonly logger = new Logger(GetUptimeSSLSummaryHandler.name);
  private readonly database: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clickhouseService: ClickHouseService,
  ) {
    this.database = process.env.CLICKHOUSE_DB || "telemetryflow_db";
  }

  async execute(query: GetUptimeSSLSummaryQuery) {
    const organizationId = query.tenantContext.organizationId;
    const client = this.clickhouseService.getClient();

    // Query raw uptime_checks to get latest ssl_days per monitor.
    // Avoids minMerge contamination from -1 values (failed checks) in the MV.
    const result = await client.query({
      query: `
        SELECT
          monitor_id,
          min(ssl_days_remaining) AS ssl_days
        FROM ${this.database}.uptime_checks
        WHERE organization_id = {organizationId:String}
          AND checked_at >= now() - INTERVAL 24 HOUR
          AND ssl_days_remaining >= 0
        GROUP BY monitor_id
      `,
      query_params: { organizationId },
      format: "JSONEachRow",
    });

    const rows = (await result.json()) as Array<{
      monitor_id: string;
      ssl_days: string | number;
    }>;

    const daysList = rows.map((r) => Number(r.ssl_days));

    return {
      total: daysList.length,
      nearExpiry: daysList.filter((d) => d < 30).length,
      minDays: daysList.length > 0 ? Math.min(...daysList) : 0,
      maxDays: daysList.length > 0 ? Math.max(...daysList) : 0,
      // Per-monitor breakdown for the datatable SSL column
      perMonitor: rows.map((r) => ({
        monitorId: r.monitor_id,
        days: Math.round(Number(r.ssl_days)),
      })),
    };
  }
}
