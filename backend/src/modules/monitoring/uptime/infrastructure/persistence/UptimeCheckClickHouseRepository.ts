import { Injectable, Logger } from "@nestjs/common";
import { ClickHouseService } from "@/shared/clickhouse/clickhouse.service";
import { UptimeCheck } from "../../domain/aggregates/UptimeCheck";
import {
  IUptimeCheckClickHouseRepository,
  UPTIME_CHECK_CLICKHOUSE_REPOSITORY,
  UptimeCheckRecord,
  UptimeCheckHourlyStat,
  UptimeCheckDailyStat,
} from "../../domain/repositories/IUptimeCheckClickHouseRepository";

@Injectable()
export class UptimeCheckClickHouseRepository implements IUptimeCheckClickHouseRepository {
  private readonly logger = new Logger(UptimeCheckClickHouseRepository.name);

  constructor(private readonly clickhouse: ClickHouseService) {}

  /** Qualify a table name with the configured database prefix */
  private q(table: string): string {
    return this.clickhouse.qualifyTable(table);
  }

  async insertCheck(
    check: UptimeCheck,
    context: {
      monitorName: string;
      organizationId: string;
      workspaceId?: string;
      tenantId?: string;
    },
  ): Promise<void> {
    const record = this.toRecord(check, context);
    try {
      await this.clickhouse.getClient().insert({
        table: "uptime_checks",
        values: [record],
        format: "JSONEachRow",
      });
    } catch (error) {
      this.logger.error(
        `Failed to insert uptime check to ClickHouse: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async insertChecks(
    checks: UptimeCheck[],
    context: {
      monitorName: string;
      organizationId: string;
      workspaceId?: string;
      tenantId?: string;
    },
  ): Promise<void> {
    if (checks.length === 0) return;

    const records = checks.map((c) => this.toRecord(c, context));
    try {
      await this.clickhouse.getClient().insert({
        table: "uptime_checks",
        values: records,
        format: "JSONEachRow",
      });
      this.logger.debug(
        `Inserted ${records.length} uptime checks to ClickHouse`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to insert ${records.length} uptime checks to ClickHouse: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async queryChecks(params: {
    monitorId: string;
    organizationId: string;
    from?: Date;
    to?: Date;
    status?: string;
    limit?: number;
  }): Promise<UptimeCheckRecord[]> {
    const { monitorId, organizationId, from, to, status, limit = 100 } = params;

    const conditions: string[] = [
      "monitor_id = {monitorId:String}",
      "organization_id = {organizationId:String}",
    ];
    const queryParams: Record<string, string | number> = {
      monitorId,
      organizationId,
      qLimit: limit,
    };

    if (from) {
      conditions.push("checked_at >= {fromTime:DateTime64(9)}");
      queryParams.fromTime = from.toISOString();
    }
    if (to) {
      conditions.push("checked_at <= {toTime:DateTime64(9)}");
      queryParams.toTime = to.toISOString();
    }
    if (status) {
      conditions.push("status = {status:String}");
      queryParams.status = status;
    }

    const query = `
      SELECT
        checked_at, monitor_id, monitor_name, status, status_code,
        response_time, ip_address, region, error_message,
        ssl_days_remaining, organization_id, workspace_id, tenant_id
      FROM ${this.q("uptime_checks")}
      WHERE ${conditions.join(" AND ")}
      ORDER BY checked_at DESC
      LIMIT {qLimit:UInt32}
    `;

    const result = await this.clickhouse
      .getClient()
      .query({ query, query_params: queryParams, format: "JSONEachRow" });
    return result.json() as Promise<UptimeCheckRecord[]>;
  }

  async queryHourlyStats(params: {
    monitorId: string;
    organizationId: string;
    from: Date;
    to: Date;
  }): Promise<UptimeCheckHourlyStat[]> {
    const { monitorId, organizationId, from, to } = params;

    const query = `
      SELECT
        hour,
        monitor_id,
        monitor_name,
        region,
        organization_id,
        countMerge(total_checks) AS total_checks,
        countIfMerge(success_count) AS success_count,
        countIfMerge(failure_count) AS failure_count,
        avgMerge(avg_response_time) AS avg_response_time,
        maxMerge(max_response_time) AS max_response_time,
        minMerge(min_response_time) AS min_response_time,
        quantileMerge(0.50)(p50_response_time) AS p50_response_time,
        quantileMerge(0.75)(p75_response_time) AS p75_response_time,
        quantileMerge(0.90)(p90_response_time) AS p90_response_time,
        quantileMerge(0.95)(p95_response_time) AS p95_response_time,
        quantileMerge(0.99)(p99_response_time) AS p99_response_time
      FROM ${this.q("uptime_checks_1h")}
      WHERE monitor_id = {monitorId:String}
        AND organization_id = {organizationId:String}
        AND hour >= {fromTime:DateTime64(9)}
        AND hour <= {toTime:DateTime64(9)}
      GROUP BY hour, monitor_id, monitor_name, region, organization_id
      ORDER BY hour DESC
    `;

    const result = await this.clickhouse
      .getClient()
      .query({
        query,
        query_params: {
          monitorId,
          organizationId,
          fromTime: from.toISOString(),
          toTime: to.toISOString(),
        },
        format: "JSONEachRow",
      });
    return result.json() as Promise<UptimeCheckHourlyStat[]>;
  }

  async queryDailyStats(params: {
    monitorId: string;
    organizationId: string;
    from: Date;
    to: Date;
  }): Promise<UptimeCheckDailyStat[]> {
    const { monitorId, organizationId, from, to } = params;

    const query = `
      SELECT
        day,
        monitor_id,
        monitor_name,
        organization_id,
        total_checks,
        success_count,
        failure_count,
        avg_response_time
      FROM ${this.q("uptime_checks_1d")}
      WHERE monitor_id = {monitorId:String}
        AND organization_id = {organizationId:String}
        AND day >= {fromDate:String}
        AND day <= {toDate:String}
      ORDER BY day DESC
    `;

    const result = await this.clickhouse
      .getClient()
      .query({
        query,
        query_params: {
          monitorId,
          organizationId,
          fromDate: from.toISOString().slice(0, 10),
          toDate: to.toISOString().slice(0, 10),
        },
        format: "JSONEachRow",
      });
    return result.json() as Promise<UptimeCheckDailyStat[]>;
  }

  private toRecord(
    check: UptimeCheck,
    context: {
      monitorName: string;
      organizationId: string;
      workspaceId?: string;
      tenantId?: string;
    },
  ): UptimeCheckRecord {
    return {
      checked_at: check.checkedAt
        .toISOString()
        .replace("T", " ")
        .replace("Z", ""),
      monitor_id: check.monitorId,
      monitor_name: context.monitorName,
      status: check.status,
      status_code: check.statusCode ?? 0,
      response_time: check.responseTime,
      ip_address: check.ipAddress ?? "",
      region: check.region ?? "",
      error_message: check.error ?? "",
      ssl_days_remaining: check.sslInfo?.daysUntilExpiry ?? -1,
      organization_id: context.organizationId,
      workspace_id: context.workspaceId ?? "",
      tenant_id: context.tenantId ?? "",
    };
  }
}

export { UPTIME_CHECK_CLICKHOUSE_REPOSITORY };
