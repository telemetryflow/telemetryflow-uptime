import {
  Monitor,
  HttpConfig,
  AuthConfig,
  NotificationConfig,
  UptimeStats,
} from "../../domain/aggregates/Monitor";
import { SslInfo } from "../../domain/aggregates/UptimeCheck";
import { MonitorEntity } from "./entities/Monitor.entity";

export class MonitorMapper {
  static toDomain(entity: MonitorEntity): Monitor {
    // Build HTTP Config
    const httpConfig: HttpConfig | undefined = entity.httpMethod
      ? {
          method: entity.httpMethod,
          headers: entity.httpHeaders,
          body: entity.httpBody,
          bodyEncoding: entity.httpBodyEncoding,
          followRedirects: entity.followRedirects,
          maxRedirects: entity.maxRedirects,
          acceptedStatusCodes: entity.acceptedStatusCodes,
          ignoreTlsErrors: entity.ignoreTlsErrors,
        }
      : undefined;

    // Build Auth Config
    const authConfig: AuthConfig | undefined = entity.authMethod
      ? {
          method: entity.authMethod,
          username: entity.authUsername,
          password: entity.authPassword,
          token: entity.authToken,
          apiKeyHeader: entity.apiKeyHeader,
          apiKeyValue: entity.apiKeyValue,
        }
      : undefined;

    // Build Notification Config
    const notificationConfig: NotificationConfig | undefined =
      entity.notificationChannels
        ? {
            channels: entity.notificationChannels,
            alertAfterDownCount: entity.alertAfterDownCount,
            resendInterval: entity.notificationResendInterval,
            notifyOnRecovery: entity.notifyOnRecovery,
          }
        : undefined;

    // Build Uptime Stats
    const uptimeStats: UptimeStats = {
      uptime24h: Number(entity.uptime24h) || 0,
      uptime7d: Number(entity.uptime7d) || 0,
      uptime30d: Number(entity.uptime30d) || 0,
      uptime90d: Number(entity.uptime90d) || 0,
      avgResponseTime24h: Number(entity.avgResponseTime24h) || 0,
      avgResponseTime7d: Number(entity.avgResponseTime7d) || 0,
      totalChecks: Number(entity.totalChecks) || 0,
      successfulChecks: Number(entity.successfulChecks) || 0,
      failedChecks: Number(entity.failedChecks) || 0,
    };

    return Monitor.reconstitute({
      id: entity.id,
      name: entity.name,
      description: entity.description,
      url: entity.url,
      type: entity.type,
      status: entity.status,
      interval: entity.interval,
      timeout: entity.timeout,
      retries: entity.retries,
      retryInterval: entity.retryInterval,
      isActive: entity.isActive,
      isPaused: entity.isPaused,
      httpConfig,
      keywordConfig: entity.keyword
        ? { keyword: entity.keyword, invert: entity.keywordInvert }
        : undefined,
      jsonQueryConfig: entity.jsonPath
        ? {
            jsonPath: entity.jsonPath,
            expectedValue: entity.jsonExpectedValue,
            operator: entity.jsonOperator as
              | "equals"
              | "contains"
              | "greater"
              | "less"
              | "regex",
          }
        : undefined,
      authConfig,
      databaseConfig: entity.dbConnectionString
        ? {
            connectionString: entity.dbConnectionString,
            query: entity.dbQuery,
            expectedResult: entity.dbExpectedResult,
          }
        : undefined,
      dnsConfig: entity.dnsResolveServer
        ? {
            resolveServer: entity.dnsResolveServer,
            resolveType: entity.dnsResolveType as
              | "A"
              | "AAAA"
              | "MX"
              | "TXT"
              | "CNAME"
              | "NS",
            expectedResult: entity.dnsExpectedResult,
          }
        : undefined,
      sslConfig: {
        expiryDaysWarning: entity.sslExpiryWarningDays,
        checkChain: entity.sslCheckChain,
      },
      lastSslInfo: entity.lastSslInfo
        ? ({
            valid: entity.lastSslInfo.valid,
            issuer: entity.lastSslInfo.issuer,
            subject: entity.lastSslInfo.subject,
            validFrom: entity.lastSslInfo.validFrom
              ? new Date(entity.lastSslInfo.validFrom)
              : undefined,
            validTo: entity.lastSslInfo.validTo
              ? new Date(entity.lastSslInfo.validTo)
              : undefined,
            daysUntilExpiry: entity.lastSslInfo.daysUntilExpiry,
            protocol: entity.lastSslInfo.protocol,
            cipher: entity.lastSslInfo.cipher,
          } as SslInfo)
        : undefined,
      notificationConfig,
      groupId: entity.groupId,
      tags: entity.tags || [],
      uptimeStats,
      lastCheckAt: entity.lastCheckAt,
      nextCheckAt: entity.nextCheckAt,
      lastResponseTime: entity.lastResponseTime,
      lastStatusChange: entity.lastStatusChange,
      consecutiveDownCount: entity.consecutiveDownCount,
      consecutiveUpCount: entity.consecutiveUpCount,
      organizationId: entity.organizationId,
      workspaceId: entity.workspaceId,
      metadata: entity.metadata,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toEntity(monitor: Monitor): Partial<MonitorEntity> {
    const props = monitor.toJSON();

    return {
      id: props.id,
      name: props.name,
      description: props.description,
      url: props.url,
      type: props.type,
      status: props.status,
      interval: props.interval,
      timeout: props.timeout,
      retries: props.retries,
      retryInterval: props.retryInterval,
      isActive: props.isActive,
      isPaused: props.isPaused,

      // HTTP Config
      httpMethod: props.httpConfig?.method,
      httpHeaders: props.httpConfig?.headers,
      httpBody: props.httpConfig?.body,
      httpBodyEncoding: props.httpConfig?.bodyEncoding,
      followRedirects: props.httpConfig?.followRedirects ?? true,
      maxRedirects: props.httpConfig?.maxRedirects ?? 5,
      acceptedStatusCodes: props.httpConfig?.acceptedStatusCodes,
      ignoreTlsErrors: props.httpConfig?.ignoreTlsErrors ?? false,

      // Keyword Config
      keyword: props.keywordConfig?.keyword,
      keywordInvert: props.keywordConfig?.invert ?? false,

      // JSON Query Config
      jsonPath: props.jsonQueryConfig?.jsonPath,
      jsonExpectedValue: props.jsonQueryConfig?.expectedValue,
      jsonOperator: props.jsonQueryConfig?.operator,

      // Auth Config
      authMethod: props.authConfig?.method,
      authUsername: props.authConfig?.username,
      authPassword: props.authConfig?.password,
      authToken: props.authConfig?.token,
      apiKeyHeader: props.authConfig?.apiKeyHeader,
      apiKeyValue: props.authConfig?.apiKeyValue,

      // Database Config
      dbConnectionString: props.databaseConfig?.connectionString,
      dbQuery: props.databaseConfig?.query,
      dbExpectedResult: props.databaseConfig?.expectedResult,

      // DNS Config
      dnsResolveServer: props.dnsConfig?.resolveServer,
      dnsResolveType: props.dnsConfig?.resolveType,
      dnsExpectedResult: props.dnsConfig?.expectedResult,

      // SSL Config
      sslExpiryWarningDays: props.sslConfig?.expiryDaysWarning ?? 14,
      sslCheckChain: props.sslConfig?.checkChain ?? true,
      lastSslInfo: props.lastSslInfo ?? null,

      // Notification Config
      notificationChannels: props.notificationConfig?.channels,
      alertAfterDownCount: props.notificationConfig?.alertAfterDownCount ?? 1,
      notificationResendInterval: props.notificationConfig?.resendInterval,
      notifyOnRecovery: props.notificationConfig?.notifyOnRecovery ?? true,

      // Grouping
      groupId: props.groupId,
      tags: props.tags,

      // Stats
      uptime24h: props.uptimeStats?.uptime24h ?? 0,
      uptime7d: props.uptimeStats?.uptime7d ?? 0,
      uptime30d: props.uptimeStats?.uptime30d ?? 0,
      uptime90d: props.uptimeStats?.uptime90d ?? 0,
      avgResponseTime24h: props.uptimeStats?.avgResponseTime24h ?? 0,
      avgResponseTime7d: props.uptimeStats?.avgResponseTime7d ?? 0,
      totalChecks: props.uptimeStats?.totalChecks ?? 0,
      successfulChecks: props.uptimeStats?.successfulChecks ?? 0,
      failedChecks: props.uptimeStats?.failedChecks ?? 0,

      // Check tracking
      lastCheckAt: props.lastCheckAt,
      nextCheckAt: props.nextCheckAt,
      lastResponseTime: props.lastResponseTime,
      lastStatusChange: props.lastStatusChange,
      consecutiveDownCount: props.consecutiveDownCount,
      consecutiveUpCount: props.consecutiveUpCount,

      // Multi-tenancy
      organizationId: props.organizationId,
      workspaceId: props.workspaceId,
      metadata: props.metadata,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
  }
}
