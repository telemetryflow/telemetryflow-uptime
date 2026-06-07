import {
  StatusPage,
  BrandingConfig,
  DisplayConfig,
  CustomDomainConfig,
  StatusPageMonitorConfig,
} from '../../domain/aggregates/StatusPage';
import { StatusPageEntity } from './entities/StatusPage.entity';

export class StatusPageMapper {
  static toDomain(entity: StatusPageEntity): StatusPage {
    const branding: BrandingConfig = {
      logoUrl: entity.logoUrl,
      faviconUrl: entity.faviconUrl,
      brandColor: entity.brandColor,
      customCss: entity.customCss,
      headerText: entity.headerText,
      footerText: entity.footerText,
      supportUrl: entity.supportUrl,
    };

    const display: DisplayConfig = {
      showUptimePercentage: entity.showUptimePercentage,
      showResponseTime: entity.showResponseTime,
      showIncidentHistory: entity.showIncidentHistory,
      showMaintenanceSchedule: entity.showMaintenanceSchedule,
      allowSubscriptions: entity.allowSubscriptions,
      showLegend: entity.showLegend,
      uptimeRanges: entity.uptimeRanges as ('24h' | '7d' | '30d' | '90d')[],
      historyDays: entity.historyDays,
      theme: entity.theme,
      googleAnalyticsId: entity.googleAnalyticsId,
    };

    const customDomain: CustomDomainConfig | undefined = entity.customDomain
      ? {
          domain: entity.customDomain,
          verified: entity.customDomainVerified,
          sslEnabled: entity.customDomainSsl,
          verificationToken: entity.customDomainVerificationToken,
        }
      : undefined;

    const monitors: StatusPageMonitorConfig[] = entity.monitors || [];

    return StatusPage.reconstitute({
      id: entity.id,
      title: entity.title,
      slug: entity.slug,
      description: entity.description,
      isPublic: entity.isPublic,
      overallStatus: entity.overallStatus,
      branding,
      display,
      customDomain,
      monitors,
      lastStatusCheck: entity.lastStatusCheck,
      organizationId: entity.organizationId,
      workspaceId: entity.workspaceId,
      createdBy: entity.createdBy,
      metadata: entity.metadata,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toEntity(statusPage: StatusPage): Partial<StatusPageEntity> {
    const props = statusPage.toJSON();

    return {
      id: props.id,
      title: props.title,
      slug: props.slug,
      description: props.description,
      isPublic: props.isPublic,
      overallStatus: props.overallStatus,

      // Branding
      logoUrl: props.branding.logoUrl,
      faviconUrl: props.branding.faviconUrl,
      brandColor: props.branding.brandColor,
      customCss: props.branding.customCss,
      headerText: props.branding.headerText,
      footerText: props.branding.footerText,
      supportUrl: props.branding.supportUrl,

      // Display
      showUptimePercentage: props.display.showUptimePercentage,
      showResponseTime: props.display.showResponseTime,
      showIncidentHistory: props.display.showIncidentHistory,
      showMaintenanceSchedule: props.display.showMaintenanceSchedule,
      allowSubscriptions: props.display.allowSubscriptions,
      showLegend: props.display.showLegend,
      uptimeRanges: props.display.uptimeRanges,
      historyDays: props.display.historyDays,
      theme: props.display.theme || 'light',
      googleAnalyticsId: props.display.googleAnalyticsId,

      // Custom domain
      customDomain: props.customDomain?.domain,
      customDomainVerified: props.customDomain?.verified ?? false,
      customDomainSsl: props.customDomain?.sslEnabled ?? false,
      customDomainVerificationToken: props.customDomain?.verificationToken,

      // Monitors
      monitors: props.monitors,
      lastStatusCheck: props.lastStatusCheck,

      // Multi-tenancy
      organizationId: props.organizationId,
      workspaceId: props.workspaceId,
      createdBy: props.createdBy,
      metadata: props.metadata,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
  }
}
