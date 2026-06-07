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
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { UrlValidator } from "@/shared/security/UrlValidator";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsArray,
  IsDate,
  IsNumber,
  IsEmail,
} from "class-validator";
import { Type } from "class-transformer";
import { JwtAuthGuard } from "@/modules/auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "@/modules/auth/guards/permissions.guard";
import { RequirePermissions } from "@/modules/auth/decorators/permissions.decorator";
import { TenantContext } from "@/modules/query/domain/value-objects";
import {
  QueryStatusPagesQuery,
  GetStatusPageByIdQuery,
  QueryIncidentsQuery,
  GetIncidentByIdQuery,
} from "@/modules/query/application/queries";
import { StatusPage, OverallStatus } from "../../domain/aggregates/StatusPage";
import {
  Incident,
  IncidentImpact,
  IncidentStatus,
} from "../../domain/aggregates/Incident";
import {
  Subscriber,
  NotificationType,
  SubscriptionType,
} from "../../domain/aggregates/Subscriber";
import {
  CreateStatusPageCommand,
  UpdateStatusPageCommand,
  DeleteStatusPageCommand,
  AddMonitorToStatusPageCommand,
  RemoveMonitorFromStatusPageCommand,
  CreateIncidentCommand,
  UpdateIncidentCommand,
  AddIncidentUpdateCommand,
  ResolveIncidentCommand,
  SetCustomDomainCommand,
  VerifyCustomDomainCommand,
  RemoveCustomDomainCommand,
} from "../../application/commands";
import { SubscriberRepository } from "../../infrastructure/persistence/SubscriberRepository";
import { SubscriberMapper } from "../../infrastructure/persistence/SubscriberMapper";
import axios from "axios";
import { TELEMETRYFLOW_SOFT_LIMIT, TELEMETRYFLOW_HARD_LIMIT } from "@/shared/constants/telemetry-limits";

// Explicit column lists (avoids SELECT alias.*)
const SP_COLUMNS = [
  "sp.id",
  "sp.title",
  "sp.slug",
  "sp.description",
  "sp.is_public",
  "sp.overall_status",
  "sp.logo_url",
  "sp.favicon_url",
  "sp.brand_color",
  "sp.custom_css",
  "sp.header_text",
  "sp.footer_text",
  "sp.support_url",
  "sp.show_uptime_percentage",
  "sp.show_response_time",
  "sp.show_incident_history",
  "sp.show_maintenance_schedule",
  "sp.allow_subscriptions",
  "sp.show_legend",
  "sp.uptime_ranges",
  "sp.history_days",
  "sp.theme",
  "sp.google_analytics_id",
  "sp.custom_domain",
  "sp.custom_domain_verified",
  "sp.custom_domain_ssl",
  "sp.custom_domain_verification_token",
  "sp.monitors",
  "sp.last_status_check",
  "sp.organization_id",
  "sp.workspace_id",
  "sp.created_by",
  "sp.metadata",
  "sp.created_at",
  "sp.updated_at",
  "sp.deleted_at",
].join(", ");
const INC_COLUMNS = [
  "i.id",
  "i.status_page_id",
  "i.title",
  "i.impact",
  "i.status",
  "i.message",
  "i.affected_monitor_ids",
  "i.updates",
  "i.is_scheduled_maintenance",
  "i.scheduled_start_at",
  "i.scheduled_end_at",
  "i.started_at",
  "i.resolved_at",
  "i.organization_id",
  "i.workspace_id",
  "i.created_by",
  "i.metadata",
  "i.created_at",
  "i.updated_at",
  "i.deleted_at",
].join(", ");

// Status Page DTOs (snake_case to match frontend convention)
export class CreateStatusPageDto {
  @IsString()
  title: string;

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @IsOptional()
  @IsObject()
  branding?: Record<string, any>;

  @IsOptional()
  @IsObject()
  display?: Record<string, any>;
}

export class UpdateStatusPageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @IsOptional()
  @IsObject()
  branding?: Record<string, any>;

  @IsOptional()
  @IsObject()
  display?: Record<string, any>;

  @IsOptional()
  @IsArray()
  monitors?: Array<{
    monitorId: string;
    displayName?: string;
    description?: string;
    displayOrder: number;
    groupName?: string;
    isVisible: boolean;
  }>;
}

export class AddMonitorDto {
  @IsString()
  monitor_id: string;

  @IsOptional()
  @IsString()
  display_name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  display_order?: number;

  @IsOptional()
  @IsString()
  group_name?: string;

  @IsOptional()
  @IsBoolean()
  is_visible?: boolean;
}

export class CreateIncidentDto {
  @IsString()
  title: string;

  @IsString()
  impact: IncidentImpact;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsArray()
  affectedMonitorIds?: string[];

  @IsOptional()
  @IsBoolean()
  isScheduledMaintenance?: boolean;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledStartAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledEndAt?: Date;
}

export class UpdateIncidentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  impact?: IncidentImpact;

  @IsOptional()
  @IsString()
  message?: string;
}

export class IncidentUpdateDto {
  @IsString()
  status: IncidentStatus;

  @IsString()
  message: string;
}

export class SubscribeDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  webhook_url?: string;

  @IsOptional()
  @IsString()
  subscription_type?: "email" | "webhook";

  @IsOptional()
  @IsString()
  notificationType?: "all" | "incidents_only" | "maintenance_only";

  @IsOptional()
  @IsArray()
  monitorIds?: string[];

  @IsOptional()
  @IsString()
  recaptcha_token?: string;
}

/**
 * Wrap data in ApiResponse envelope: { status: "success", data: T }
 * Required by frontend CollectorClient which unwraps via response.data
 */
function success<T>(data: T): { status: "success"; data: T } {
  return { status: "success", data };
}

@ApiTags("Status Pages")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("status-pages")
export class StatusPageController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly subscriberRepository: SubscriberRepository,
  ) {}

  // ==================== Status Page CRUD ====================

  @Get()
  @RequirePermissions("monitoring:status-page:read")
  @ApiOperation({ summary: "List status pages" })
  @ApiResponse({ status: 200, description: "List of status pages" })
  async listStatusPages(@Request() req: any): Promise<any> {
    const tenantContext = TenantContext.create({
      organizationId: resolveOrganizationId(req),
    });
    const query = new QueryStatusPagesQuery(tenantContext);
    const result = await this.queryBus.execute(query);
    // Frontend expects ApiResponse<{ items, total, page, limit }>
    return success({
      items: result?.data || [],
      total: result?.total || 0,
      page: result?.page || 1,
      limit: result?.limit || TELEMETRYFLOW_SOFT_LIMIT,
    });
  }

  @Get(":id")
  @RequirePermissions("monitoring:status-page:read")
  @ApiOperation({ summary: "Get status page by ID or slug" })
  @ApiParam({ name: "id", description: "Status page ID or slug" })
  @ApiResponse({ status: 200, description: "Status page details" })
  async getStatusPage(
    @Request() req: any,
    @Param("id") id: string,
  ): Promise<any> {
    const tenantContext = TenantContext.create({
      organizationId: resolveOrganizationId(req),
    });
    const query = new GetStatusPageByIdQuery(tenantContext, id);
    const result = await this.queryBus.execute(query);
    return success(result);
  }

  @Post()
  @ApiOperation({ summary: "Create status page" })
  @ApiResponse({ status: 201, description: "Status page created" })
  async createStatusPage(
    @Request() req: any,
    @Body() dto: CreateStatusPageDto,
  ): Promise<any> {
    const command = new CreateStatusPageCommand(
      resolveOrganizationId(req),
      req.user?.id || "system",
      dto.title,
      dto.slug,
      dto.description,
      dto.is_public,
      dto.branding,
      dto.display,
    );
    const statusPage: StatusPage = await this.commandBus.execute(command);
    return success(toStatusPageResponse(statusPage));
  }

  @Put(":id")
  @ApiOperation({ summary: "Update status page" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 200, description: "Status page updated" })
  async updateStatusPage(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateStatusPageDto,
  ): Promise<any> {
    const command = new UpdateStatusPageCommand(
      resolveOrganizationId(req),
      id,
      dto.title,
      dto.slug,
      dto.description,
      dto.is_public,
      dto.branding,
      dto.display,
      dto.monitors,
    );
    const statusPage: StatusPage = await this.commandBus.execute(command);
    return success(toStatusPageResponse(statusPage));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete status page" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 204, description: "Status page deleted" })
  async deleteStatusPage(
    @Request() req: any,
    @Param("id") id: string,
  ): Promise<void> {
    const command = new DeleteStatusPageCommand(
      resolveOrganizationId(req),
      id,
    );
    await this.commandBus.execute(command);
  }

  // ==================== Monitor Management ====================

  @Post(":id/monitors")
  @ApiOperation({ summary: "Add monitor to status page" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 200, description: "Monitor added" })
  async addMonitor(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: AddMonitorDto,
  ): Promise<any> {
    const command = new AddMonitorToStatusPageCommand(
      resolveOrganizationId(req),
      id,
      dto.monitor_id,
      dto.display_name,
      dto.description,
      dto.display_order,
      dto.group_name,
      dto.is_visible,
    );
    const statusPage: StatusPage = await this.commandBus.execute(command);
    return success(toStatusPageResponse(statusPage));
  }

  @Put(":id/monitors/:monitorId")
  @ApiOperation({ summary: "Update monitor on status page" })
  @ApiParam({ name: "id", type: "string" })
  @ApiParam({ name: "monitorId", type: "string" })
  @ApiResponse({ status: 200, description: "Monitor updated" })
  async updateMonitor(
    @Request() req: any,
    @Param("id") id: string,
    @Param("monitorId") monitorId: string,
    @Body() dto: Partial<AddMonitorDto>,
  ): Promise<any> {
    // Remove + re-add with updated config (domain handles dedup)
    await this.commandBus.execute(
      new RemoveMonitorFromStatusPageCommand(
        resolveOrganizationId(req),
        id,
        monitorId,
      ),
    );
    const command = new AddMonitorToStatusPageCommand(
      resolveOrganizationId(req),
      id,
      monitorId,
      dto.display_name,
      dto.description,
      dto.display_order,
      dto.group_name,
      dto.is_visible,
    );
    const updated: StatusPage = await this.commandBus.execute(command);
    return success(toStatusPageResponse(updated));
  }

  @Delete(":id/monitors/:monitorId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove monitor from status page" })
  @ApiParam({ name: "id", type: "string" })
  @ApiParam({ name: "monitorId", type: "string" })
  @ApiResponse({ status: 204, description: "Monitor removed" })
  async removeMonitor(
    @Request() req: any,
    @Param("id") id: string,
    @Param("monitorId") monitorId: string,
  ): Promise<void> {
    const command = new RemoveMonitorFromStatusPageCommand(
      resolveOrganizationId(req),
      id,
      monitorId,
    );
    await this.commandBus.execute(command);
  }

  // ==================== Incident Management ====================

  @Get(":id/incidents")
  @RequirePermissions("monitoring:status-page:read")
  @ApiOperation({ summary: "List incidents" })
  @ApiParam({ name: "id", type: "string" })
  @ApiQuery({ name: "status", required: false, enum: IncidentStatus })
  @ApiQuery({ name: "limit", required: false })
  @ApiResponse({ status: 200, description: "List of incidents" })
  async listIncidents(
    @Request() req: any,
    @Param("id") id: string,
    @Query("status") status?: IncidentStatus,
    @Query("limit") limit?: number,
  ): Promise<any> {
    const tenantContext = TenantContext.create({
      organizationId: resolveOrganizationId(req),
    });
    const filter = {
      statusPageId: id,
      ...(status ? { status } : {}),
    };
    const query = new QueryIncidentsQuery(
      tenantContext,
      filter,
      limit ? { limit } : undefined,
    );
    const result = await this.queryBus.execute(query);
    // Frontend expects ApiResponse<IncidentResponse[]>
    return success(result?.data || []);
  }

  @Post(":id/incidents")
  @ApiOperation({ summary: "Create incident" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 201, description: "Incident created" })
  async createIncident(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: CreateIncidentDto,
  ): Promise<any> {
    const command = new CreateIncidentCommand(
      resolveOrganizationId(req),
      id,
      dto.title,
      dto.impact,
      dto.message,
      dto.affectedMonitorIds,
      dto.isScheduledMaintenance,
      dto.scheduledStartAt,
      dto.scheduledEndAt,
    );
    const incident: Incident = await this.commandBus.execute(command);
    return success(toIncidentResponse(incident));
  }

  @Put(":id/incidents/:incidentId")
  @ApiOperation({ summary: "Update incident" })
  @ApiParam({ name: "id", type: "string" })
  @ApiParam({ name: "incidentId", type: "string" })
  @ApiResponse({ status: 200, description: "Incident updated" })
  async updateIncident(
    @Request() req: any,
    @Param("id") id: string,
    @Param("incidentId") incidentId: string,
    @Body() dto: UpdateIncidentDto,
  ): Promise<any> {
    const command = new UpdateIncidentCommand(
      resolveOrganizationId(req),
      id,
      incidentId,
      dto.title,
      dto.impact,
      dto.message,
    );
    const incident: Incident = await this.commandBus.execute(command);
    return success(toIncidentResponse(incident));
  }

  @Post(":id/incidents/:incidentId/updates")
  @ApiOperation({ summary: "Add incident update" })
  @ApiParam({ name: "id", type: "string" })
  @ApiParam({ name: "incidentId", type: "string" })
  @ApiResponse({ status: 200, description: "Update added" })
  async addIncidentUpdate(
    @Request() req: any,
    @Param("id") id: string,
    @Param("incidentId") incidentId: string,
    @Body() dto: IncidentUpdateDto,
  ): Promise<any> {
    const command = new AddIncidentUpdateCommand(
      resolveOrganizationId(req),
      id,
      incidentId,
      dto.status,
      dto.message,
    );
    const incident: Incident = await this.commandBus.execute(command);
    return success(toIncidentResponse(incident));
  }

  @Post(":id/incidents/:incidentId/resolve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resolve incident" })
  @ApiParam({ name: "id", type: "string" })
  @ApiParam({ name: "incidentId", type: "string" })
  @ApiResponse({ status: 200, description: "Incident resolved" })
  async resolveIncident(
    @Request() req: any,
    @Param("id") id: string,
    @Param("incidentId") incidentId: string,
    @Body() dto: { message?: string },
  ): Promise<any> {
    const command = new ResolveIncidentCommand(
      resolveOrganizationId(req),
      id,
      incidentId,
      dto.message,
    );
    const incident: Incident = await this.commandBus.execute(command);
    return success(toIncidentResponse(incident));
  }

  // ==================== Subscribers ====================

  @Get(":id/subscribers")
  @RequirePermissions("monitoring:status-page:read")
  @ApiOperation({ summary: "List subscribers" })
  @ApiParam({ name: "id", type: "string" })
  @ApiQuery({ name: "confirmedOnly", required: false })
  @ApiResponse({ status: 200, description: "List of subscribers" })
  async listSubscribers(
    @Request() req: any,
    @Param("id") id: string,
    @Query("confirmedOnly") confirmedOnly?: string,
  ): Promise<any> {
    const confirmed = confirmedOnly === "true" ? true : undefined;
    const subscribers = await this.subscriberRepository.findByStatusPage(
      id,
      confirmed,
    );
    const count = await this.subscriberRepository.count(id, confirmed);
    return success({
      data: subscribers.map((s) => SubscriberMapper.toResponse(s)),
      total: count,
    });
  }

  @Post(":id/subscribers")
  @RequirePermissions("monitoring:status-page:write")
  @ApiOperation({ summary: "Add subscriber (admin)" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 201, description: "Subscriber created" })
  async addSubscriber(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: SubscribeDto,
  ): Promise<any> {
    const organizationId = resolveOrganizationId(req);
    const subscriptionType = dto.subscription_type || "email";

    if (subscriptionType === "webhook") {
      if (!dto.webhook_url) {
        throw new NotFoundException(
          "webhook_url is required for webhook subscriptions",
        );
      }
      await UrlValidator.validateWebhookUrl(dto.webhook_url);
      const subscriber = Subscriber.createWebhook({
        id: require("crypto").randomUUID(),
        statusPageId: id,
        webhookUrl: dto.webhook_url,
        notificationType: (dto.notificationType as any) || NotificationType.ALL,
        monitorIds: dto.monitorIds,
        organizationId,
      });
      await this.subscriberRepository.save(subscriber);
      return success(SubscriberMapper.toResponse(subscriber));
    } else {
      if (!dto.email) {
        throw new NotFoundException(
          "email is required for email subscriptions",
        );
      }
      // Check for existing subscriber
      const existing = await this.subscriberRepository.findByEmail(
        dto.email,
        id,
      );
      if (existing) {
        return success(SubscriberMapper.toResponse(existing));
      }
      const subscriber = Subscriber.createEmail({
        id: require("crypto").randomUUID(),
        statusPageId: id,
        email: dto.email,
        notificationType: (dto.notificationType as any) || NotificationType.ALL,
        monitorIds: dto.monitorIds,
        organizationId,
      });
      // Admin-created subscribers are auto-confirmed
      subscriber.confirm();
      await this.subscriberRepository.save(subscriber);
      return success(SubscriberMapper.toResponse(subscriber));
    }
  }

  @Delete(":id/subscribers/:subscriberId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions("monitoring:status-page:write")
  @ApiOperation({ summary: "Remove subscriber" })
  @ApiParam({ name: "id", type: "string" })
  @ApiParam({ name: "subscriberId", type: "string" })
  @ApiResponse({ status: 204, description: "Subscriber removed" })
  async removeSubscriber(
    @Request() req: any,
    @Param("id") id: string,
    @Param("subscriberId") subscriberId: string,
  ): Promise<void> {
    const subscriber = await this.subscriberRepository.findById(subscriberId);
    if (!subscriber || subscriber.statusPageId !== id) {
      throw new NotFoundException("Subscriber not found");
    }
    await this.subscriberRepository.delete(subscriberId);
  }

  // ==================== Custom Domain ====================

  @Post(":id/custom-domain")
  @ApiOperation({ summary: "Set custom domain" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 200, description: "Custom domain configured" })
  async setCustomDomain(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: { domain: string },
  ): Promise<any> {
    const command = new SetCustomDomainCommand(
      resolveOrganizationId(req),
      id,
      dto.domain,
    );
    const statusPage: StatusPage = await this.commandBus.execute(command);
    return success(toStatusPageResponse(statusPage));
  }

  @Post(":id/custom-domain/verify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify custom domain" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 200, description: "Domain verified" })
  async verifyCustomDomain(
    @Request() req: any,
    @Param("id") id: string,
  ): Promise<any> {
    const command = new VerifyCustomDomainCommand(
      resolveOrganizationId(req),
      id,
    );
    const statusPage: StatusPage = await this.commandBus.execute(command);
    return success(toStatusPageResponse(statusPage));
  }

  @Delete(":id/custom-domain")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove custom domain" })
  @ApiParam({ name: "id", type: "string" })
  @ApiResponse({ status: 204, description: "Custom domain removed" })
  async removeCustomDomain(
    @Request() req: any,
    @Param("id") id: string,
  ): Promise<void> {
    const command = new RemoveCustomDomainCommand(
      resolveOrganizationId(req),
      id,
    );
    await this.commandBus.execute(command);
  }
}

/**
 * Map StatusPage domain aggregate to flat snake_case API response
 * Matches the raw DB row format that query handlers return
 */
function toStatusPageResponse(statusPage: StatusPage): Record<string, any> {
  const branding = statusPage.branding;
  const display = statusPage.display;
  return {
    id: statusPage.id,
    title: statusPage.title,
    slug: statusPage.slug,
    description: statusPage.description,
    is_public: statusPage.isPublic,
    overall_status: statusPage.overallStatus,
    // Branding (flat)
    logo_url: branding.logoUrl,
    favicon_url: branding.faviconUrl,
    brand_color: branding.brandColor || "#10B981",
    custom_css: branding.customCss,
    header_text: branding.headerText,
    footer_text: branding.footerText,
    support_url: branding.supportUrl,
    // Display (flat)
    show_uptime_percentage: display.showUptimePercentage,
    show_response_time: display.showResponseTime,
    show_incident_history: display.showIncidentHistory,
    show_maintenance_schedule: display.showMaintenanceSchedule,
    allow_subscriptions: display.allowSubscriptions,
    show_legend: display.showLegend,
    uptime_ranges: display.uptimeRanges,
    history_days: display.historyDays,
    theme: display.theme || "light",
    google_analytics_id: display.googleAnalyticsId,
    // Custom domain
    custom_domain: statusPage.customDomain?.domain,
    custom_domain_verified: statusPage.customDomain?.verified ?? false,
    custom_domain_ssl: statusPage.customDomain?.sslEnabled ?? false,
    // Monitors
    monitors: statusPage.monitors,
    // Multi-tenancy
    organization_id: statusPage.organizationId,
    workspace_id: statusPage.workspaceId,
    created_by: statusPage.createdBy,
    created_at: statusPage.createdAt.toISOString(),
    updated_at: statusPage.updatedAt.toISOString(),
  };
}

/**
 * Map Incident domain aggregate to snake_case API response
 */
function toIncidentResponse(incident: Incident): Record<string, any> {
  return {
    id: incident.id,
    status_page_id: incident.statusPageId,
    title: incident.title,
    impact: incident.impact,
    status: incident.status,
    message: incident.message,
    affected_monitor_ids: incident.affectedMonitorIds,
    updates: incident.updates.map((u) => ({
      id: u.id,
      status: u.status,
      message: u.message,
      created_by: u.createdBy,
      created_at: u.createdAt.toISOString(),
    })),
    is_scheduled_maintenance: incident.isScheduledMaintenance,
    scheduled_start_at: incident.scheduledStartAt?.toISOString(),
    scheduled_end_at: incident.scheduledEndAt?.toISOString(),
    started_at: incident.startedAt.toISOString(),
    resolved_at: incident.resolvedAt?.toISOString(),
    organization_id: incident.organizationId,
    created_by: incident.createdBy,
    created_at: incident.createdAt.toISOString(),
    updated_at: incident.updatedAt.toISOString(),
  };
}

// Public Status Page Controller (no auth required)
@ApiTags("Public Status Pages")
@Controller("public/status")
export class PublicStatusPageController {
  private readonly logger = new Logger(PublicStatusPageController.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly subscriberRepository: SubscriberRepository,
  ) {}

  /**
   * Verify reCAPTCHA v3 token with Google API.
   * - No secret key configured → skip (development mode)
   * - Secret key + no token → reject 400
   * - Token valid + score >= threshold → allow
   * - Google API unreachable → allow (fail open)
   */
  private async verifyRecaptcha(token?: string): Promise<void> {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const minScore = parseFloat(process.env.RECAPTCHA_MIN_SCORE || "0.5");

    if (!secretKey) {
      this.logger.debug(
        "reCAPTCHA verification skipped: RECAPTCHA_SECRET_KEY not configured",
      );
      return;
    }

    if (!token) {
      throw new BadRequestException("reCAPTCHA verification required");
    }

    try {
      const response = await axios.post(
        "https://www.google.com/recaptcha/api/siteverify",
        null,
        {
          params: { secret: secretKey, response: token },
          timeout: 5000,
        },
      );

      const { success, score, action } = response.data;

      if (!success) {
        this.logger.warn(
          `reCAPTCHA verification failed: ${JSON.stringify(response.data["error-codes"])}`,
        );
        throw new BadRequestException("reCAPTCHA verification failed");
      }

      if (score < minScore) {
        this.logger.warn(
          `reCAPTCHA score too low: ${score} (minimum: ${minScore}), action: ${action}`,
        );
        throw new BadRequestException("reCAPTCHA verification failed");
      }

      this.logger.debug(`reCAPTCHA verified: score=${score}, action=${action}`);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      // Fail open: Google API unreachable should not block users
      this.logger.error(
        `reCAPTCHA API call failed: ${(error as Error).message}`,
      );
    }
  }

  @Get(":slug")
  @ApiOperation({ summary: "Get public status page by slug" })
  @ApiParam({ name: "slug", type: "string" })
  @ApiResponse({ status: 200, description: "Public status page" })
  async getPublicStatusPage(@Param("slug") slug: string): Promise<any> {
    // Query status page by slug (public pages only, no tenant restriction)
    const statusPage = await this.dataSource
      .createQueryBuilder()
      .select(SP_COLUMNS)
      .addSelect(
        `(SELECT COUNT(*)::int FROM status_page_incidents spi
          WHERE spi.status_page_id = sp.id
          AND spi.deleted_at IS NULL
          AND spi.status NOT IN ('resolved', 'completed', 'scheduled'))`,
        "active_incidents",
      )
      .from("status_pages", "sp")
      .where("sp.slug = :slug", { slug })
      .andWhere("sp.is_public = true")
      .andWhere("sp.deleted_at IS NULL")
      .getRawOne();

    if (!statusPage) {
      throw new NotFoundException("Status page not found");
    }

    // Fetch active incidents for this status page
    const incidents = await this.dataSource
      .createQueryBuilder()
      .select(INC_COLUMNS)
      .from("status_page_incidents", "i")
      .where("i.status_page_id = :statusPageId", {
        statusPageId: statusPage.id,
      })
      .andWhere("i.deleted_at IS NULL")
      .orderBy("i.created_at", "DESC")
      .limit(50)
      .getRawMany();

    return success({
      ...statusPage,
      incidents: incidents || [],
    });
  }

  @Post(":slug/subscribe")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Subscribe to status page updates" })
  @ApiParam({ name: "slug", type: "string" })
  @ApiResponse({ status: 200, description: "Subscription created" })
  async subscribe(
    @Param("slug") slug: string,
    @Body() dto: SubscribeDto,
  ): Promise<any> {
    // Verify reCAPTCHA token (skipped if RECAPTCHA_SECRET_KEY not configured)
    await this.verifyRecaptcha(dto.recaptcha_token);

    // Look up status page by slug
    const statusPage = await this.dataSource
      .createQueryBuilder()
      .select("sp.id, sp.organization_id")
      .from("status_pages", "sp")
      .where("sp.slug = :slug", { slug })
      .andWhere("sp.is_public = true")
      .andWhere("sp.deleted_at IS NULL")
      .getRawOne();

    if (!statusPage) {
      throw new NotFoundException("Status page not found");
    }

    const subscriptionType = dto.subscription_type || "email";

    if (subscriptionType === "webhook") {
      if (!dto.webhook_url) {
        throw new NotFoundException(
          "webhook_url is required for webhook subscriptions",
        );
      }
      await UrlValidator.validateWebhookUrl(dto.webhook_url);
      const subscriber = Subscriber.createWebhook({
        id: require("crypto").randomUUID(),
        statusPageId: statusPage.id,
        webhookUrl: dto.webhook_url,
        notificationType: (dto.notificationType as any) || NotificationType.ALL,
        monitorIds: dto.monitorIds,
        organizationId: statusPage.organization_id,
      });
      await this.subscriberRepository.save(subscriber);
      return success({
        message: "Webhook subscription created successfully",
        subscription_type: "webhook",
      });
    } else {
      if (!dto.email) {
        throw new NotFoundException(
          "email is required for email subscriptions",
        );
      }
      // Check for existing subscriber
      const existing = await this.subscriberRepository.findByEmail(
        dto.email,
        statusPage.id,
      );
      if (existing) {
        if (existing.isConfirmed) {
          return success({
            message: "Already subscribed",
            subscription_type: "email",
          });
        }
        // Resend confirmation
        existing.regenerateConfirmationToken();
        await this.subscriberRepository.save(existing);
        return success({
          message: "Confirmation email resent",
          subscription_type: "email",
        });
      }

      const subscriber = Subscriber.createEmail({
        id: require("crypto").randomUUID(),
        statusPageId: statusPage.id,
        email: dto.email,
        notificationType: (dto.notificationType as any) || NotificationType.ALL,
        monitorIds: dto.monitorIds,
        organizationId: statusPage.organization_id,
      });
      await this.subscriberRepository.save(subscriber);
      return success({
        message: "Subscription created. Please check your email to confirm.",
        subscription_type: "email",
      });
    }
  }

  @Get("confirm-subscription")
  @ApiOperation({ summary: "Confirm subscription" })
  @ApiQuery({ name: "token", required: true })
  @ApiResponse({ status: 200, description: "Subscription confirmed" })
  async confirmSubscription(@Query("token") token: string): Promise<any> {
    const subscriber =
      await this.subscriberRepository.findByConfirmationToken(token);
    if (!subscriber) {
      throw new NotFoundException("Invalid or expired confirmation token");
    }
    subscriber.confirm();
    await this.subscriberRepository.save(subscriber);
    return success({ message: "Subscription confirmed successfully" });
  }

  @Get("unsubscribe")
  @ApiOperation({ summary: "Unsubscribe from status page" })
  @ApiQuery({ name: "token", required: true })
  @ApiResponse({ status: 200, description: "Unsubscribed successfully" })
  async unsubscribe(@Query("token") token: string): Promise<any> {
    const subscriber =
      await this.subscriberRepository.findByUnsubscribeToken(token);
    if (!subscriber) {
      throw new NotFoundException("Invalid unsubscribe token");
    }
    await this.subscriberRepository.delete(subscriber.id);
    return success({ message: "Unsubscribed successfully" });
  }
}
