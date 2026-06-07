import { resolveOrganizationId } from "@/shared/utils/org-resolver";
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsArray,
  IsObject,
  Min,
} from "class-validator";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { JwtAuthGuard } from "@/modules/auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "@/modules/auth/guards/permissions.guard";
import { RequirePermissions } from "@/modules/auth/decorators/permissions.decorator";
import { TenantContext } from "@/modules/query/domain/value-objects";
import {
  QueryUptimeMonitorsQuery,
  GetUptimeMonitorByIdQuery,
  GetUptimeMonitorStatsQuery,
  GetUptimeMonitorChecksQuery,
  GetUptimeMonitorDailyStatsQuery,
  GetUptimeMonitorHourlyStatsQuery,
  GetUptimeMonitorSSLTrendQuery,
  GetUptimeSSLSummaryQuery,
} from "@/modules/query/application/queries";
import {
  CreateMonitorCommand,
  UpdateMonitorCommand,
  DeleteMonitorCommand,
  PauseMonitorCommand,
  ResumeMonitorCommand,
} from "../../application/commands";
import {
  Monitor,
  MonitorType,
  MonitorStatus,
  HttpMethod,
} from "../../domain/aggregates/Monitor";
import { UrlValidator } from "@/shared/security";

// DTOs — field names match frontend snake_case payload
export class CreateMonitorDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsOptional()
  @IsEnum(MonitorType)
  type?: MonitorType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  interval?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  timeout?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  retries?: number;

  @IsOptional()
  @IsObject()
  http_config?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    accepted_status_codes?: number[];
    max_redirects?: number;
    ignore_tls_errors?: boolean;
  };

  @IsOptional()
  @IsObject()
  ssl_config?: {
    expiry_days_warning?: number;
  };

  @IsOptional()
  @IsArray()
  notification_channels?: string[];

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  group_id?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateMonitorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsEnum(MonitorType)
  type?: MonitorType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  interval?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  timeout?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  retries?: number;

  @IsOptional()
  @IsObject()
  http_config?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    accepted_status_codes?: number[];
    max_redirects?: number;
    ignore_tls_errors?: boolean;
  };

  @IsOptional()
  @IsObject()
  ssl_config?: {
    expiry_days_warning?: number;
  };

  @IsOptional()
  @IsArray()
  notification_channels?: string[];

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  group_id?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class TestMonitorDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsOptional()
  @IsEnum(MonitorType)
  type?: MonitorType;

  @IsOptional()
  @IsNumber()
  @Min(1)
  timeout?: number;

  @IsOptional()
  @IsObject()
  http_config?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    ignore_tls_errors?: boolean;
  };
}

export class MonitorResponseDto {
  id: string;
  name: string;
  url: string;
  type: MonitorType;
  status: MonitorStatus;
  description?: string;
  interval: number;
  timeout: number;
  retries: number;
  is_active: boolean;
  is_paused: boolean;
  http_method?: string;
  http_headers?: Record<string, string>;
  http_body?: string;
  accepted_status_codes?: number[];
  max_redirects?: number;
  ignore_tls_errors?: boolean;
  ssl_expiry_warning_days?: number;
  uptime_stats?: {
    uptime_24h: number;
    uptime_7d: number;
    uptime_30d: number;
    uptime_90d: number;
    avg_response_time_24h: number;
  };
  last_check_at?: string;
  last_response_time?: number;
  consecutive_down_count: number;
  consecutive_up_count: number;
  ssl_cert?: {
    valid: boolean;
    issuer?: string;
    subject?: string;
    valid_from?: string;
    valid_to?: string;
    days_until_expiry?: number;
    protocol?: string;
    cipher?: string;
  };
  notification_channels?: string[];
  tags: string[];
  group_id?: string;
  organization_id: string;
  workspace_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Map a domain Monitor aggregate to the snake_case response DTO
 */
function toResponseDto(monitor: Monitor): MonitorResponseDto {
  return {
    id: monitor.id,
    name: monitor.name,
    url: monitor.url,
    type: monitor.type,
    status: monitor.status,
    description: monitor.description,
    interval: monitor.interval,
    timeout: monitor.timeout,
    retries: monitor.retries,
    is_active: monitor.isActive,
    is_paused: monitor.isPaused,
    http_method: monitor.httpConfig?.method,
    http_headers: monitor.httpConfig?.headers,
    http_body: monitor.httpConfig?.body,
    accepted_status_codes: monitor.httpConfig?.acceptedStatusCodes,
    max_redirects: monitor.httpConfig?.maxRedirects,
    ignore_tls_errors: monitor.httpConfig?.ignoreTlsErrors,
    ssl_expiry_warning_days: monitor.sslConfig?.expiryDaysWarning,
    uptime_stats: monitor.uptimeStats
      ? {
          uptime_24h: monitor.uptimeStats.uptime24h,
          uptime_7d: monitor.uptimeStats.uptime7d,
          uptime_30d: monitor.uptimeStats.uptime30d,
          uptime_90d: monitor.uptimeStats.uptime90d,
          avg_response_time_24h: monitor.uptimeStats.avgResponseTime24h,
        }
      : undefined,
    last_check_at: monitor.lastCheckAt?.toISOString(),
    last_response_time: monitor.lastResponseTime,
    consecutive_down_count: monitor.consecutiveDownCount,
    consecutive_up_count: monitor.consecutiveUpCount,
    ssl_cert: monitor.lastSslInfo
      ? {
          valid: monitor.lastSslInfo.valid,
          issuer: monitor.lastSslInfo.issuer,
          subject: monitor.lastSslInfo.subject,
          valid_from: monitor.lastSslInfo.validFrom?.toISOString(),
          valid_to: monitor.lastSslInfo.validTo?.toISOString(),
          days_until_expiry: monitor.lastSslInfo.daysUntilExpiry,
          protocol: monitor.lastSslInfo.protocol,
          cipher: monitor.lastSslInfo.cipher,
        }
      : undefined,
    notification_channels: monitor.notificationConfig?.channels,
    tags: monitor.tags,
    group_id: monitor.groupId,
    organization_id: monitor.organizationId,
    workspace_id: monitor.workspaceId,
    metadata: monitor.metadata,
    created_at: monitor.createdAt.toISOString(),
    updated_at: monitor.updatedAt.toISOString(),
  };
}

/**
 * Wrap data in ApiResponse envelope: { status: "success", data: T }
 * Required by frontend CollectorClient which unwraps via response.data
 */
function success<T>(data: T): { status: "success"; data: T } {
  return { status: "success", data };
}

/**
 * Transform a raw DB row (flat columns) into the MonitorResponse shape
 * that the frontend expects (nested uptime_stats object).
 * Raw rows from "SELECT m.*" have flat columns like uptime_24h, uptime_7d, etc.
 */
function transformRawRow(row: any): any {
  if (!row) return row;
  const {
    uptime_24h,
    uptime_7d,
    uptime_30d,
    uptime_90d,
    avg_response_time_24h,
    avg_response_time_7d,
    last_ssl_info,
    ...rest
  } = row;

  // Always include uptime_stats when the flat columns exist in the row
  const hasColumns = uptime_24h !== undefined || uptime_7d !== undefined;

  // Reshape last_ssl_info (JSONB from DB) → ssl_cert (frontend contract)
  const sslCert = last_ssl_info
    ? {
        valid: last_ssl_info.valid,
        issuer: last_ssl_info.issuer,
        subject: last_ssl_info.subject,
        valid_from: last_ssl_info.validFrom ?? last_ssl_info.valid_from,
        valid_to: last_ssl_info.validTo ?? last_ssl_info.valid_to,
        days_until_expiry:
          last_ssl_info.daysUntilExpiry ?? last_ssl_info.days_until_expiry,
        protocol: last_ssl_info.protocol,
        cipher: last_ssl_info.cipher,
      }
    : undefined;

  return {
    ...rest,
    uptime_stats: hasColumns
      ? {
          uptime_24h: parseFloat(uptime_24h || "0"),
          uptime_7d: parseFloat(uptime_7d || "0"),
          uptime_30d: parseFloat(uptime_30d || "0"),
          uptime_90d: parseFloat(uptime_90d || "0"),
          avg_response_time_24h: parseFloat(avg_response_time_24h || "0"),
        }
      : undefined,
    ssl_cert: sslCert,
  };
}

@ApiTags("Uptime Monitors")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("uptime/monitors")
export class MonitorController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  private getOrganizationId(req: any): string {
    return resolveOrganizationId(req);
  }

  /**
   * Test a monitor URL without saving it.
   * Performs an immediate one-off check and returns the result.
   */
  @Post("test")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("monitoring:uptime:read")
  @ApiOperation({ summary: "Test a monitor URL without saving" })
  @ApiResponse({ status: 200, description: "Test check result" })
  async testMonitor(@Body() dto: TestMonitorDto) {
    await UrlValidator.validateMonitorUrl(dto.url);
    const { HttpChecker } = await import("../../infrastructure/checkers/HttpChecker");
    const monitorType = dto.type ?? MonitorType.HTTPS;
    const tempMonitor = Monitor.reconstitute({
      id: "test",
      name: "Test Check",
      url: dto.url,
      type: monitorType,
      status: MonitorStatus.PENDING,
      interval: 60,
      timeout: dto.timeout ?? 30,
      retries: 0,
      retryInterval: 60,
      isActive: true,
      isPaused: false,
      consecutiveDownCount: 0,
      consecutiveUpCount: 0,
      httpConfig: dto.http_config
        ? {
            method: (dto.http_config.method as HttpMethod) ?? HttpMethod.GET,
            headers: dto.http_config.headers,
            body: dto.http_config.body,
            ignoreTlsErrors: dto.http_config.ignore_tls_errors,
          }
        : undefined,
      organizationId: "",
      tags: [],
      nextCheckAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await HttpChecker.check(tempMonitor);
    return success({
      status: result.status,
      statusCode: result.statusCode,
      responseTime: result.responseTime,
      message: result.message,
      error: result.error,
      timing: result.timing,
      sslInfo: result.sslInfo,
      ipAddress: result.ipAddress,
    });
  }

  @Get()
  @RequirePermissions("monitoring:uptime:read")
  @ApiOperation({ summary: "List all monitors" })
  @ApiQuery({ name: "status", required: false, enum: MonitorStatus })
  @ApiQuery({ name: "type", required: false, enum: MonitorType })
  @ApiQuery({ name: "group_id", required: false })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Paginated list of monitors" })
  async listMonitors(
    @Request() req: any,
    @Query("status") status?: MonitorStatus,
    @Query("type") type?: MonitorType,
    @Query("group_id") groupId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const tenantContext = TenantContext.create({
      organizationId: this.getOrganizationId(req),
    });
    const filter = {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(groupId ? { groupId } : {}),
    };

    const pageNum = parseInt(page || "1", 10) || 1;
    const limitNum = parseInt(limit || "20", 10) || 20;

    const query = new QueryUptimeMonitorsQuery(tenantContext, filter, {
      page: pageNum,
      limit: limitNum,
    });
    const result = await this.queryBus.execute(query);

    // Query handler returns { data, total, page, limit, ... }
    // Frontend expects ApiResponse<{ items, total, page, limit }>
    // Transform flat DB rows to nested uptime_stats shape
    const items = (result?.data || []).map(transformRawRow);
    return success({
      items,
      total: result?.total || 0,
      page: result?.page || pageNum,
      limit: result?.limit || limitNum,
    });
  }

  @Get("ssl-summary")
  @RequirePermissions("monitoring:uptime:read")
  @ApiOperation({
    summary: "Get org-wide SSL certificate summary stats from ClickHouse",
  })
  @ApiResponse({
    status: 200,
    description: "SSL summary: total, nearExpiry, minDays, maxDays",
  })
  async getSSLSummary(@Request() req: any) {
    const tenantContext = TenantContext.create({
      organizationId: this.getOrganizationId(req),
    });
    const query = new GetUptimeSSLSummaryQuery(tenantContext);
    const result = await this.queryBus.execute(query);
    return success(result);
  }

  @Get(":id")
  @RequirePermissions("monitoring:uptime:read")
  @ApiOperation({ summary: "Get monitor by ID" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 200, description: "Monitor details" })
  @ApiResponse({ status: 404, description: "Monitor not found" })
  async getMonitor(
    @Request() req: any,
    @Param("id", new ParseUUIDPipe({ version: "4", errorHttpStatusCode: 400 }))
    id: string,
  ) {
    const tenantContext = TenantContext.create({
      organizationId: this.getOrganizationId(req),
    });
    const query = new GetUptimeMonitorByIdQuery(tenantContext, id);
    const result = await this.queryBus.execute(query);
    return success(transformRawRow(result));
  }

  @Post()
  @ApiOperation({ summary: "Create monitor" })
  @ApiResponse({ status: 201, description: "Monitor created" })
  async createMonitor(@Request() req: any, @Body() dto: CreateMonitorDto) {
    if (!dto?.name?.trim()) {
      throw new BadRequestException("Monitor name is required");
    }
    if (!dto?.url?.trim()) {
      throw new BadRequestException("Monitor URL is required");
    }

    await UrlValidator.validateMonitorUrl(dto.url.trim());

    const command = new CreateMonitorCommand(
      this.getOrganizationId(req),
      dto.name.trim(),
      dto.url.trim(),
      dto.type,
      dto.description,
      dto.interval,
      dto.timeout,
      dto.retries,
      dto.http_config
        ? {
            method: dto.http_config.method as any,
            headers: dto.http_config.headers,
            body: dto.http_config.body,
            acceptedStatusCodes: dto.http_config.accepted_status_codes,
            maxRedirects: dto.http_config.max_redirects,
            ignoreTlsErrors: dto.http_config.ignore_tls_errors,
          }
        : undefined,
      dto.notification_channels,
      dto.tags,
      dto.group_id,
      dto.ssl_config
        ? { expiryDaysWarning: dto.ssl_config.expiry_days_warning }
        : undefined,
      dto.metadata,
    );

    const monitor: Monitor = await this.commandBus.execute(command);
    return success(toResponseDto(monitor));
  }

  @Put(":id")
  @RequirePermissions("monitoring:uptime:write")
  @ApiOperation({ summary: "Update monitor" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 200, description: "Monitor updated" })
  async updateMonitor(
    @Request() req: any,
    @Param("id", new ParseUUIDPipe({ version: "4", errorHttpStatusCode: 400 }))
    id: string,
    @Body() dto: UpdateMonitorDto,
  ) {
    if (dto.url) {
      await UrlValidator.validateMonitorUrl(dto.url);
    }
    const command = new UpdateMonitorCommand(
      this.getOrganizationId(req),
      id,
      dto.name,
      dto.url,
      dto.type,
      dto.description,
      dto.interval,
      dto.timeout,
      dto.retries,
      dto.http_config
        ? {
            method: dto.http_config.method as any,
            headers: dto.http_config.headers,
            body: dto.http_config.body,
            acceptedStatusCodes: dto.http_config.accepted_status_codes,
            maxRedirects: dto.http_config.max_redirects,
            ignoreTlsErrors: dto.http_config.ignore_tls_errors,
          }
        : undefined,
      dto.notification_channels,
      dto.tags,
      dto.group_id,
      dto.ssl_config
        ? { expiryDaysWarning: dto.ssl_config.expiry_days_warning }
        : undefined,
      dto.metadata,
    );

    const monitor: Monitor = await this.commandBus.execute(command);
    return success(toResponseDto(monitor));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions("monitoring:uptime:write")
  @ApiOperation({ summary: "Delete monitor" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 204, description: "Monitor deleted" })
  async deleteMonitor(
    @Request() req: any,
    @Param("id", new ParseUUIDPipe({ version: "4", errorHttpStatusCode: 400 }))
    id: string,
  ): Promise<void> {
    const command = new DeleteMonitorCommand(this.getOrganizationId(req), id);
    await this.commandBus.execute(command);
  }

  @Post(":id/pause")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("monitoring:uptime:write")
  @ApiOperation({ summary: "Pause monitor" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 200, description: "Monitor paused" })
  async pauseMonitor(
    @Request() req: any,
    @Param("id", new ParseUUIDPipe({ version: "4", errorHttpStatusCode: 400 }))
    id: string,
  ) {
    const command = new PauseMonitorCommand(this.getOrganizationId(req), id);
    const monitor: Monitor = await this.commandBus.execute(command);
    return success(toResponseDto(monitor));
  }

  @Post(":id/resume")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("monitoring:uptime:write")
  @ApiOperation({ summary: "Resume monitor" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 200, description: "Monitor resumed" })
  async resumeMonitor(
    @Request() req: any,
    @Param("id", new ParseUUIDPipe({ version: "4", errorHttpStatusCode: 400 }))
    id: string,
  ) {
    const command = new ResumeMonitorCommand(this.getOrganizationId(req), id);
    const monitor: Monitor = await this.commandBus.execute(command);
    return success(toResponseDto(monitor));
  }

  @Get(":id/checks")
  @RequirePermissions("monitoring:uptime:read")
  @ApiOperation({ summary: "Get monitor check history" })
  @ApiParam({ name: "id", type: "string" })
  @ApiQuery({ name: "from", required: false })
  @ApiQuery({ name: "to", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiResponse({ status: 200, description: "Check history" })
  async getMonitorChecks(
    @Request() req: any,
    @Param("id", new ParseUUIDPipe({ version: "4", errorHttpStatusCode: 400 }))
    id: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: number,
  ) {
    const tenantContext = TenantContext.create({
      organizationId: this.getOrganizationId(req),
    });
    const query = new GetUptimeMonitorChecksQuery(
      tenantContext,
      id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      limit,
    );
    const result = await this.queryBus.execute(query);
    return success(result);
  }

  @Get(":id/daily-stats")
  @RequirePermissions("monitoring:uptime:read")
  @ApiOperation({
    summary: "Get per-day uptime stats from ClickHouse materialized view",
  })
  @ApiParam({ name: "id", type: "string" })
  @ApiQuery({ name: "days", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Daily uptime stats" })
  async getMonitorDailyStats(
    @Request() req: any,
    @Param("id", new ParseUUIDPipe({ version: "4", errorHttpStatusCode: 400 }))
    id: string,
    @Query("days") days?: string,
  ) {
    const tenantContext = TenantContext.create({
      organizationId: this.getOrganizationId(req),
    });
    const daysNum = Math.min(parseInt(days || "90", 10) || 90, 365);
    const query = new GetUptimeMonitorDailyStatsQuery(
      tenantContext,
      id,
      daysNum,
    );
    const result = await this.queryBus.execute(query);
    return success(result);
  }

  @Get(":id/hourly-stats")
  @RequirePermissions("monitoring:uptime:read")
  @ApiOperation({
    summary: "Get per-hour uptime stats from ClickHouse materialized view",
  })
  @ApiParam({ name: "id", type: "string" })
  @ApiQuery({ name: "hours", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Hourly uptime stats" })
  async getMonitorHourlyStats(
    @Request() req: any,
    @Param("id", new ParseUUIDPipe({ version: "4", errorHttpStatusCode: 400 }))
    id: string,
    @Query("hours") hours?: string,
  ) {
    const tenantContext = TenantContext.create({
      organizationId: this.getOrganizationId(req),
    });
    const hoursNum = Math.min(parseInt(hours || "24", 10) || 24, 2160);
    const query = new GetUptimeMonitorHourlyStatsQuery(
      tenantContext,
      id,
      hoursNum,
    );
    const result = await this.queryBus.execute(query);
    return success(result);
  }

  @Get(":id/ssl-trend")
  @RequirePermissions("monitoring:uptime:read")
  @ApiOperation({
    summary: "Get per-hour SSL days remaining trend from ClickHouse",
  })
  @ApiParam({ name: "id", type: "string" })
  @ApiQuery({ name: "hours", required: false, type: Number })
  @ApiResponse({ status: 200, description: "SSL days remaining trend data" })
  async getMonitorSSLTrend(
    @Request() req: any,
    @Param("id", new ParseUUIDPipe({ version: "4", errorHttpStatusCode: 400 }))
    id: string,
    @Query("hours") hours?: string,
  ) {
    const tenantContext = TenantContext.create({
      organizationId: this.getOrganizationId(req),
    });
    const hoursNum = Math.min(parseInt(hours || "168", 10) || 168, 8760);
    const query = new GetUptimeMonitorSSLTrendQuery(
      tenantContext,
      id,
      hoursNum,
    );
    const result = await this.queryBus.execute(query);
    return success(result);
  }

  @Get(":id/stats")
  @RequirePermissions("monitoring:uptime:read")
  @ApiOperation({ summary: "Get monitor statistics" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 200, description: "Monitor statistics" })
  async getMonitorStats(
    @Request() req: any,
    @Param("id", new ParseUUIDPipe({ version: "4", errorHttpStatusCode: 400 }))
    id: string,
  ) {
    const tenantContext = TenantContext.create({
      organizationId: this.getOrganizationId(req),
    });
    const query = new GetUptimeMonitorStatsQuery(tenantContext, id);
    const result = await this.queryBus.execute(query);
    // Transform camelCase handler output to snake_case for frontend
    return success({
      uptime_24h: result?.uptime24h ?? 0,
      uptime_7d: result?.uptime7d ?? 0,
      uptime_30d: result?.uptime30d ?? 0,
      uptime_90d: result?.uptime90d ?? 0,
      avg_response_time_24h: result?.avgResponseTimeMs ?? 0,
      avg_response_time_7d: 0,
      total_checks: result?.totalChecks ?? 0,
      up_checks: result?.upChecks ?? 0,
      down_checks: result?.downChecks ?? 0,
      min_response_time_ms: result?.minResponseTimeMs ?? 0,
      max_response_time_ms: result?.maxResponseTimeMs ?? 0,
      percentiles_24h: result?.percentiles24h ?? {
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
      },
      percentiles_7d: result?.percentiles7d ?? {
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
      },
      percentiles_30d: result?.percentiles30d ?? {
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
      },
      percentiles_90d: result?.percentiles90d ?? {
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
      },
    });
  }
}
