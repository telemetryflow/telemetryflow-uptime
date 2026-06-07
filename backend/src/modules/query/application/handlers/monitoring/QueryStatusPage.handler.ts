import { QueryHandler, IQueryHandler } from "@nestjs/cqrs";
import { Logger, NotFoundException } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { DEFAULT_QUERY_LIMIT } from "@/shared/dto/pagination.dto";
import {
  QueryStatusPagesQuery,
  GetStatusPageByIdQuery,
  QueryIncidentsQuery,
  GetIncidentByIdQuery,
} from "../../queries/monitoring";

// Explicit column lists (avoids SELECT alias.*)
const STATUS_PAGE_COLUMNS = [
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
const INCIDENT_COLUMNS = [
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

/**
 * Query Status Pages Handler
 * Lists status pages with filtering, pagination, and tenant context
 */
@QueryHandler(QueryStatusPagesQuery)
export class QueryStatusPagesHandler implements IQueryHandler<QueryStatusPagesQuery> {
  private readonly logger = new Logger(QueryStatusPagesHandler.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(query: QueryStatusPagesQuery) {
    const { tenantContext, filter, pagination } = query;
    const page = pagination?.page || 1;
    const limit = pagination?.limit || DEFAULT_QUERY_LIMIT;
    const offset = pagination?.offset ?? (page - 1) * limit;

    const qb = this.dataSource
      .createQueryBuilder()
      .select(STATUS_PAGE_COLUMNS)
      .addSelect(
        `(SELECT COUNT(*)::int FROM status_page_incidents spi
          WHERE spi.status_page_id = sp.id
          AND spi.deleted_at IS NULL
          AND spi.status NOT IN ('resolved', 'completed', 'scheduled'))`,
        "active_incidents",
      )
      .from("status_pages", "sp")
      .where("sp.organization_id = :organizationId", {
        organizationId: tenantContext.organizationId,
      })
      .andWhere("sp.deleted_at IS NULL");

    if (tenantContext.workspaceId) {
      qb.andWhere("sp.workspace_id = :workspaceId", {
        workspaceId: tenantContext.workspaceId,
      });
    }

    // Apply filters
    if (filter?.title) {
      qb.andWhere("sp.title ILIKE :title", { title: `%${filter.title}%` });
    }
    if (filter?.slug) {
      qb.andWhere("sp.slug = :slug", { slug: filter.slug });
    }
    if (filter?.isPublic !== undefined) {
      qb.andWhere("sp.is_public = :isPublic", { isPublic: filter.isPublic });
    }
    if (filter?.overallStatus) {
      qb.andWhere("sp.overall_status = :overallStatus", {
        overallStatus: filter.overallStatus,
      });
    }

    // Get total count
    const countQb = qb.clone();
    const countResult = await countQb.select("COUNT(*)", "count").getRawOne();
    const total = parseInt(countResult?.count || "0", 10);

    // Apply pagination
    qb.orderBy("sp.created_at", "DESC");
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
 * Get Status Page By ID Handler
 */
@QueryHandler(GetStatusPageByIdQuery)
export class GetStatusPageByIdHandler implements IQueryHandler<GetStatusPageByIdQuery> {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(query: GetStatusPageByIdQuery) {
    const { tenantContext, statusPageId } = query;

    const result = await this.dataSource
      .createQueryBuilder()
      .select(STATUS_PAGE_COLUMNS)
      .from("status_pages", "sp")
      .where("sp.id = :statusPageId", { statusPageId })
      .andWhere("sp.organization_id = :organizationId", {
        organizationId: tenantContext.organizationId,
      })
      .andWhere("sp.deleted_at IS NULL")
      .getRawOne();

    if (!result) {
      throw new NotFoundException(
        `Status page with ID ${statusPageId} not found`,
      );
    }

    return result;
  }
}

/**
 * Query Incidents Handler
 * Lists incidents for a status page with filtering and pagination
 */
@QueryHandler(QueryIncidentsQuery)
export class QueryIncidentsHandler implements IQueryHandler<QueryIncidentsQuery> {
  private readonly logger = new Logger(QueryIncidentsHandler.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(query: QueryIncidentsQuery) {
    const { tenantContext, filter, pagination } = query;
    const page = pagination?.page || 1;
    const limit = pagination?.limit || DEFAULT_QUERY_LIMIT;
    const offset = pagination?.offset ?? (page - 1) * limit;

    const qb = this.dataSource
      .createQueryBuilder()
      .select(INCIDENT_COLUMNS)
      .from("status_page_incidents", "i")
      .where("i.organization_id = :organizationId", {
        organizationId: tenantContext.organizationId,
      })
      .andWhere("i.status_page_id = :statusPageId", {
        statusPageId: filter.statusPageId,
      })
      .andWhere("i.deleted_at IS NULL");

    if (tenantContext.workspaceId) {
      qb.andWhere("i.workspace_id = :workspaceId", {
        workspaceId: tenantContext.workspaceId,
      });
    }

    // Apply filters
    if (filter.status) {
      qb.andWhere("i.status = :status", { status: filter.status });
    }
    if (filter.impact) {
      qb.andWhere("i.impact = :impact", { impact: filter.impact });
    }

    // Get total count
    const countQb = qb.clone();
    const countResult = await countQb.select("COUNT(*)", "count").getRawOne();
    const total = parseInt(countResult?.count || "0", 10);

    // Apply pagination
    qb.orderBy("i.created_at", "DESC");
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
 * Get Incident By ID Handler
 */
@QueryHandler(GetIncidentByIdQuery)
export class GetIncidentByIdHandler implements IQueryHandler<GetIncidentByIdQuery> {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(query: GetIncidentByIdQuery) {
    const { tenantContext, incidentId } = query;

    const result = await this.dataSource
      .createQueryBuilder()
      .select(INCIDENT_COLUMNS)
      .from("status_page_incidents", "i")
      .where("i.id = :incidentId", { incidentId })
      .andWhere("i.organization_id = :organizationId", {
        organizationId: tenantContext.organizationId,
      })
      .andWhere("i.deleted_at IS NULL")
      .getRawOne();

    if (!result) {
      throw new NotFoundException(`Incident with ID ${incidentId} not found`);
    }

    return result;
  }
}
