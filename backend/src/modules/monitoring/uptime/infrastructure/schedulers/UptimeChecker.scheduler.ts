import { resolveOrganizationId } from "@/shared/utils/org-resolver";
import { Injectable, Logger, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import {
  IMonitorRepository,
  MONITOR_REPOSITORY,
  IUptimeCheckRepository,
  UPTIME_CHECK_REPOSITORY,
} from "../../domain/repositories/IUptimeRepository";
import {
  IUptimeCheckClickHouseRepository,
  UPTIME_CHECK_CLICKHOUSE_REPOSITORY,
} from "../../domain/repositories/IUptimeCheckClickHouseRepository";
import { Monitor, MonitorStatus } from "../../domain/aggregates/Monitor";
import { UptimeCheck, CheckStatus } from "../../domain/aggregates/UptimeCheck";
import { HttpChecker } from "../checkers/HttpChecker";
import { ClickHouseService } from "@/shared/clickhouse/clickhouse.service";
import { NotificationChannelService } from "@/modules/alerting/application/services/NotificationChannel.service";
import { NotificationChannelRepository } from "@/modules/notification/infrastructure/repositories/NotificationChannelRepository";
import type { AlertNotification } from "@/modules/alerting/infrastructure/services/INotificationSender";

@Injectable()
export class UptimeCheckerScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UptimeCheckerScheduler.name);
  private readonly isEnabled: boolean;
  private readonly concurrency: number;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    @Inject(MONITOR_REPOSITORY)
    private readonly monitorRepository: IMonitorRepository,
    @Inject(UPTIME_CHECK_REPOSITORY)
    private readonly checkRepository: IUptimeCheckRepository,
    @Inject(UPTIME_CHECK_CLICKHOUSE_REPOSITORY)
    private readonly clickhouseCheckRepository: IUptimeCheckClickHouseRepository,
    private readonly configService: ConfigService,
    private readonly clickhouseService: ClickHouseService,
    private readonly notificationChannelService: NotificationChannelService,
    private readonly notificationChannelRepository: NotificationChannelRepository,
  ) {
    this.isEnabled = this.configService.get<boolean>(
      "UPTIME_CHECKER_ENABLED",
      true,
    );
    this.concurrency = this.configService.get<number>(
      "UPTIME_CHECKER_CONCURRENCY",
      5,
    );
    this.intervalMs = this.configService.get<number>(
      "UPTIME_CHECKER_INTERVAL_MS",
      10_000,
    );
  }

  onModuleInit() {
    if (!this.isEnabled) return;
    this.logger.log(
      `Uptime checker initialized (interval: ${this.intervalMs}ms, concurrency: ${this.concurrency})`,
    );
    this.timer = setInterval(() => void this.handleCheck(), this.intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async handleCheck() {
    if (!this.isEnabled || this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const monitors = await this.monitorRepository.findDueForCheck();

      if (monitors.length === 0) {
        // No monitors due yet — try active monitors that haven't been checked
        const activeMonitors = await this.monitorRepository.findActive();
        const dueMonitors = activeMonitors.filter((m) => {
          if (!m.lastCheckAt) return true; // Never checked
          const elapsed = Date.now() - m.lastCheckAt.getTime();
          return elapsed >= m.interval * 1000;
        });

        if (dueMonitors.length > 0) {
          await this.checkBatch(dueMonitors);
        }
        return;
      }

      await this.checkBatch(monitors);
    } catch (error) {
      this.logger.error(`Uptime checker error: ${error.message}`, error.stack);
    } finally {
      this.isRunning = false;
    }
  }

  private async checkBatch(monitors: Monitor[]): Promise<void> {
    // Process in batches of `concurrency`
    for (let i = 0; i < monitors.length; i += this.concurrency) {
      const batch = monitors.slice(i, i + this.concurrency);
      const promises = batch.map((monitor) =>
        this.checkMonitor(monitor).catch((err) => {
          this.logger.error(
            `Failed to check monitor ${monitor.id} (${monitor.name}): ${err.message}`,
          );
        }),
      );
      await Promise.all(promises);
    }
  }

  private async checkMonitor(monitor: Monitor): Promise<void> {
    const result = await HttpChecker.check(monitor);
    const isUp = result.status === CheckStatus.SUCCESS;

    // Capture status before change to detect transitions
    const previousStatus = monitor.status;

    // Update monitor status + cache latest SSL info
    monitor.recordCheckResult(isUp, result.responseTime, result.message);
    if (result.sslInfo !== undefined) {
      monitor.updateLastSslInfo(result.sslInfo);
    }
    await this.monitorRepository.save(monitor);

    // Store check record
    const check = UptimeCheck.create({
      id: uuidv4(),
      monitorId: monitor.id,
      status: result.status,
      statusCode: result.statusCode,
      responseTime: result.responseTime,
      timing: result.timing,
      message: result.message,
      error: result.error,
      sslInfo: result.sslInfo,
      responseHeaders: result.responseHeaders,
      ipAddress: result.ipAddress,
      checkedAt: new Date(),
    });

    await this.checkRepository.save(check);

    // Write to ClickHouse for time-series analytics
    try {
      await this.clickhouseCheckRepository.insertCheck(check, {
        monitorName: monitor.name,
        organizationId: monitor.organizationId,
        workspaceId: monitor.workspaceId,
      });
    } catch (chError) {
      this.logger.warn(
        `Failed to write check to ClickHouse for ${monitor.name}: ${chError.message}`,
      );
    }

    // Dual-write: forward uptime check result to unified logs table (non-fatal)
    try {
      const chTs = new Date().toISOString().replace("T", " ").replace("Z", "");
      await this.clickhouseService.insertUptimeLogsToMainLogs([{
        timestamp: chTs,
        monitor_id: monitor.id,
        monitor_name: monitor.name,
        status: result.status,
        status_code: result.statusCode,
        response_time: result.responseTime,
        message: result.message,
        error: result.error,
        target_url: monitor.url || "",
        organization_id: monitor.organizationId || "",
        workspace_id: monitor.workspaceId || "",
        tenant_id: "",
      }]);
    } catch {
      // Non-fatal — primary uptime check write already succeeded
    }

    this.logger.debug(
      `[${monitor.name}] ${result.status.toUpperCase()} - ${result.responseTime}ms` +
        (result.statusCode ? ` (HTTP ${result.statusCode})` : ""),
    );

    // ── Notification dispatch ───────────────────────────────────────────────
    await this.dispatchUptimeNotification(monitor, previousStatus, result.responseTime);
  }

  /**
   * Dispatch notification when a monitor transitions to DOWN/DEGRADED (firing)
   * or recovers back to UP (resolved).
   */
  private async dispatchUptimeNotification(
    monitor: Monitor,
    previousStatus: MonitorStatus,
    responseTime: number,
  ): Promise<void> {
    const notificationConfig = monitor.notificationConfig;
    if (!notificationConfig?.channels?.length) return;

    const currentStatus = monitor.status;
    const configuredChannelIds: string[] = notificationConfig.channels;
    const notifyOnRecovery: boolean = notificationConfig.notifyOnRecovery !== false;

    // Validate that configured channel IDs still exist and are enabled.
    // Channels may have been deleted or disabled after the monitor was created.
    const enabledChannels = await this.notificationChannelRepository.findByOrganizationId(
      monitor.organizationId,
      { enabled: true },
    );
    const enabledChannelIdSet = new Set(enabledChannels.map((c) => c.id));
    const channelIds = configuredChannelIds.filter((id) => enabledChannelIdSet.has(id));

    const skipped = configuredChannelIds.length - channelIds.length;
    if (skipped > 0) {
      this.logger.warn(
        `[${monitor.name}] ${skipped} configured channel(s) are missing or disabled — skipping them`,
      );
    }

    if (channelIds.length === 0) {
      this.logger.warn(
        `[${monitor.name}] No valid enabled notification channels found; skipping uptime notification`,
      );
      return;
    }

    // Determine if this is a firing or resolved transition
    const isNowDown = currentStatus === MonitorStatus.DOWN || currentStatus === MonitorStatus.DEGRADED;
    const wasDown = previousStatus === MonitorStatus.DOWN || previousStatus === MonitorStatus.DEGRADED;
    const isRecovery = wasDown && currentStatus === MonitorStatus.UP;
    const isFiring = isNowDown && !wasDown;

    // Re-notify on persistent down only if resendInterval has elapsed since last status change
    const resendIntervalMs = (notificationConfig.resendInterval ?? 0) * 60_000;
    const elapsedSinceStatusChange = monitor.lastStatusChange
      ? Date.now() - monitor.lastStatusChange.getTime()
      : Infinity;
    const isStillDown = isNowDown && wasDown && monitor.shouldNotify() &&
      resendIntervalMs > 0 && elapsedSinceStatusChange >= resendIntervalMs;

    if (!isFiring && !isRecovery && !isStillDown) return;

    const notifStatus: "firing" | "resolved" = isRecovery ? "resolved" : "firing";
    const severity = currentStatus === MonitorStatus.DOWN ? "critical" : "warning";
    const title = isRecovery
      ? `[RESOLVED] ${monitor.name} is back UP`
      : currentStatus === MonitorStatus.DOWN
        ? `[DOWN] ${monitor.name} is unreachable`
        : `[DEGRADED] ${monitor.name} has high response time`;
    const description = isRecovery
      ? `Monitor "${monitor.name}" (${monitor.url}) has recovered. Response time: ${responseTime}ms.`
      : currentStatus === MonitorStatus.DOWN
        ? `Monitor "${monitor.name}" (${monitor.url}) is DOWN. Check failed${monitor.consecutiveDownCount > 1 ? ` ${monitor.consecutiveDownCount} times in a row` : ""}.`
        : `Monitor "${monitor.name}" (${monitor.url}) is DEGRADED. Response time: ${responseTime}ms exceeds threshold.`;

    const notification: AlertNotification = {
      alertInstanceId: `uptime-${monitor.id}-${Date.now()}`,
      alertRuleId: `uptime-monitor-${monitor.id}`,
      alertRuleName: `Uptime: ${monitor.name}`,
      severity,
      status: notifStatus,
      title,
      description,
      currentValue: responseTime,
      threshold: monitor.timeout * 1000,
      labels: {
        monitor_id: monitor.id,
        monitor_name: monitor.name,
        url: monitor.url,
        status: currentStatus,
        type: monitor.type,
      },
      annotations: {
        monitor_url: monitor.url,
        consecutive_down: String(monitor.consecutiveDownCount),
      },
      startsAt: monitor.lastStatusChange ?? new Date(),
      endsAt: isRecovery ? new Date() : undefined,
      organizationId: monitor.organizationId,
      fingerprint: `uptime-${monitor.id}`,
    };

    if (isRecovery && !notifyOnRecovery) return;

    try {
      const results = await this.notificationChannelService.sendAlertNotification(
        notification,
        channelIds,
      );
      const ok = results.filter(r => r.success).length;
      const fail = results.filter(r => !r.success).length;
      this.logger.log(
        `[${monitor.name}] Uptime ${notifStatus} notification: ${ok} sent, ${fail} failed`,
      );
    } catch (err) {
      this.logger.error(
        `[${monitor.name}] Failed to dispatch uptime notification: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
