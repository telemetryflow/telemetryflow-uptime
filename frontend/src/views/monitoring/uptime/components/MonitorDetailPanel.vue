<script setup lang="ts">
/**
 * Monitor Detail Panel - Drawer View
 * TASK-09: Detailed monitor information panel
 * Design based on AgentDetailsPanel pattern
 */

import { ref, computed, watch } from "vue";
import { Icon } from "@iconify/vue";
import {
  NDrawer,
  NDrawerContent,
  NButton,
  NTag,
  NTooltip,
  NPopconfirm,
  NTimeline,
  NTimelineItem,
} from "naive-ui";
import { StatPanel } from "@/components/charts";
import MiniChartCard from "@/components/charts/MiniChartCard.vue";
import TagBadge from "@/components/common/TagBadge.vue";
import type { Monitor, UptimeCheck, UptimeStats, DailyUptimeStat, HourlyUptimeStat } from "@/types/uptime";
import { MONITOR_TYPES, UPTIME_COLORS } from "@/types/uptime";
import {
  buildBarsFromHourlyStats,
  buildBarsFromChecks,
  buildBarsFromPercentage,
  fillEmptyBars,
  type BarEntry,
} from "@/composables/useUptimeBars";
import { uptimeApi } from "@/api/uptime";
import { generateChartSeries } from "@/utils/telemetry";
import config from "@/config";
import { useAlertsStore, useAppStore } from "@/store";
import { getChannelIcon } from "@/utils";

const props = defineProps<{
  show: boolean;
  monitor: Monitor | null;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
  edit: [monitor: Monitor];
  pause: [monitor: Monitor];
  resume: [monitor: Monitor];
  delete: [monitor: Monitor];
  "view-logs": [];
}>();

const appStore = useAppStore();
const mockTimeOpts = computed(() => ({ start: appStore.globalTimeRange.start, end: appStore.globalTimeRange.end }));

// ==================== DATA ====================

const loading = ref(false);
const checks = ref<UptimeCheck[]>([]);
const stats = ref<UptimeStats | null>(null);
const dailyStats = ref<DailyUptimeStat[]>([]);
const hourlyStats = ref<HourlyUptimeStat[]>([]);
// Latest SSL days from ClickHouse trend — fallback when PG checks have no ssl_info
const sslTrendDays = ref<number | null>(null);

// Event types for uptime monitoring
interface MonitorEvent {
  type: string;
  message: string;
  source: string;
  count: number;
  lastSeen: string;
  severity: "error" | "warning" | "info" | "success";
}

// Alert History types
interface AlertHistoryItem {
  id: string;
  type: "firing" | "resolved" | "acknowledged";
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  triggeredAt: string;
  resolvedAt?: string;
  acknowledgedBy?: string;
  duration?: string;
}

// ==================== EVENTS - Derived from real check data ====================

const monitorEvents = computed<MonitorEvent[]>(() => {
  if (!props.monitor) return [];

  // PENDING monitors — creation event only
  if (props.monitor.status === "pending") {
    const createdAt = props.monitor.createdAt
      ? new Date(props.monitor.createdAt).toISOString()
      : new Date().toISOString();
    return [
      {
        type: "MonitorCreated",
        message: `Monitor "${props.monitor.name}" created. Awaiting first health check.`,
        source: "api-gateway",
        count: 1,
        lastSeen: createdAt,
        severity: "info" as const,
      },
    ];
  }

  const events: MonitorEvent[] = [];
  const checkData = checks.value;

  if (checkData.length === 0) {
    events.push({
      type: "MonitorActive",
      message: `Monitor "${props.monitor.name}" is active. Waiting for check data to load.`,
      source: "uptime-service",
      count: 1,
      lastSeen: new Date().toISOString(),
      severity: "info",
    });
    return events;
  }

  // Sort checks newest first
  const sorted = [...checkData].sort((a, b) => b.checkedAt - a.checkedAt);

  // Aggregate counts from real check data
  const failedChecks = sorted.filter(c => c.status === "failure");
  const timeoutChecks = sorted.filter(c => c.status === "timeout");
  const errorChecks = sorted.filter(c => c.status === "error");
  const successChecks = sorted.filter(c => c.status === "success");

  // Failure events from actual data
  if (failedChecks.length > 0) {
    const last = failedChecks[0];
    const statusCode = last.statusCode ? ` (HTTP ${last.statusCode})` : "";
    events.push({
      type: "CheckFailed",
      message: `${last.error || last.message || "Server error"}${statusCode} — Response: ${last.responseTime}ms from ${last.region || "unknown region"}`,
      source: last.region ? `uptime-checker-${last.region}` : "uptime-checker",
      count: failedChecks.length,
      lastSeen: new Date(last.checkedAt).toISOString(),
      severity: "error",
    });
  }

  if (timeoutChecks.length > 0) {
    const last = timeoutChecks[0];
    events.push({
      type: "CheckTimeout",
      message: `Connection timed out after ${props.monitor.timeout}s — ${timeoutChecks.length} timeout(s) in recent checks`,
      source: last.region ? `uptime-checker-${last.region}` : "uptime-checker",
      count: timeoutChecks.length,
      lastSeen: new Date(last.checkedAt).toISOString(),
      severity: "warning",
    });
  }

  if (errorChecks.length > 0) {
    const last = errorChecks[0];
    events.push({
      type: "CheckError",
      message: `${last.error || last.message || "Check error"} — ${errorChecks.length} error(s) detected`,
      source: last.region ? `uptime-checker-${last.region}` : "uptime-checker",
      count: errorChecks.length,
      lastSeen: new Date(last.checkedAt).toISOString(),
      severity: "error",
    });
  }

  // Detect recovery (transition from failure → success)
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const older = sorted[i + 1];
    if (current.status === "success" && ["failure", "timeout", "error"].includes(older.status)) {
      events.push({
        type: "RecoveredFromFailure",
        message: `Monitor recovered — Response: ${current.responseTime}ms, Status: ${current.statusCode || "OK"}. Previous check was ${older.status}`,
        source: current.region ? `uptime-checker-${current.region}` : "uptime-checker",
        count: 1,
        lastSeen: new Date(current.checkedAt).toISOString(),
        severity: "success",
      });
      break; // Only show most recent recovery
    }
  }

  // Latest successful check summary
  if (successChecks.length > 0) {
    const latest = successChecks[0];
    const avgResponse = Math.round(successChecks.reduce((sum, c) => sum + c.responseTime, 0) / successChecks.length);
    events.push({
      type: "HealthCheckPassed",
      message: `Health check passed — Response: ${latest.responseTime}ms, Status: ${latest.statusCode || 200} OK, Avg: ${avgResponse}ms over ${successChecks.length} checks`,
      source: latest.region ? `uptime-checker-${latest.region}` : "uptime-checker",
      count: successChecks.length,
      lastSeen: new Date(latest.checkedAt).toISOString(),
      severity: "success",
    });
  }

  // Monitor config info
  events.push({
    type: "MonitorConfig",
    message: `Interval: ${props.monitor.interval}s, Timeout: ${props.monitor.timeout}s, Retries: ${props.monitor.retries}, Type: ${props.monitor.type.toUpperCase()}`,
    source: "api-gateway",
    count: 1,
    lastSeen: new Date(props.monitor.updatedAt).toISOString(),
    severity: "info",
  });

  return events;
});

// ==================== ALERT HISTORY - Derived from real check data ====================

function formatIncidentDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

const alertHistory = computed<AlertHistoryItem[]>(() => {
  if (!props.monitor) return [];
  if (props.monitor.status === "pending") return [];

  const checkData = checks.value;
  if (checkData.length === 0) return [];

  // Sort oldest first for incident detection
  const sorted = [...checkData].sort((a, b) => a.checkedAt - b.checkedAt);
  const incidents: AlertHistoryItem[] = [];
  let incidentStart: UptimeCheck | null = null;
  let incidentChecks: UptimeCheck[] = [];

  for (const check of sorted) {
    const isFailure = ["failure", "timeout", "error"].includes(check.status);

    if (isFailure) {
      if (!incidentStart) {
        incidentStart = check;
        incidentChecks = [check];
      } else {
        incidentChecks.push(check);
      }
    } else if (incidentStart) {
      // Incident resolved
      const durationMs = check.checkedAt - incidentStart.checkedAt;
      const firstError = incidentStart.error || incidentStart.message || "Check failed";
      const failureTypes = [...new Set(incidentChecks.map(c => c.status))];
      const regions = [...new Set(incidentChecks.map(c => c.region).filter(Boolean))];

      incidents.push({
        id: `incident-${incidentStart.checkedAt}`,
        type: "resolved",
        severity: failureTypes.includes("failure") ? "critical" : "warning",
        title: failureTypes.includes("failure")
          ? `Monitor Down — ${incidentChecks.length} failed check(s)`
          : `Degraded — ${incidentChecks.length} ${failureTypes.join("/")} check(s)`,
        message: `${firstError}. Affected ${incidentChecks.length} consecutive checks across ${regions.join(", ") || "unknown"} region(s). Recovered with ${check.responseTime}ms response.`,
        triggeredAt: new Date(incidentStart.checkedAt).toISOString(),
        resolvedAt: new Date(check.checkedAt).toISOString(),
        duration: formatIncidentDuration(durationMs),
      });

      incidentStart = null;
      incidentChecks = [];
    }
  }

  // Handle ongoing incident
  if (incidentStart) {
    const durationMs = Date.now() - incidentStart.checkedAt;
    const firstError = incidentStart.error || incidentStart.message || "Check failed";
    const failureTypes = [...new Set(incidentChecks.map(c => c.status))];

    incidents.push({
      id: `incident-${incidentStart.checkedAt}`,
      type: "firing",
      severity: failureTypes.includes("failure") ? "critical" : "warning",
      title: failureTypes.includes("failure")
        ? `Monitor Down — ${incidentChecks.length} failed check(s)`
        : `Degraded — ${incidentChecks.length} ${failureTypes.join("/")} check(s)`,
      message: `${firstError}. Ongoing for ${formatIncidentDuration(durationMs)} — ${incidentChecks.length} consecutive failing checks.`,
      triggeredAt: new Date(incidentStart.checkedAt).toISOString(),
    });
  }

  // Newest first
  return incidents.reverse();
});

function getAlertTypeColor(type: string): "error" | "success" | "warning" | "info" {
  switch (type) {
    case "firing": return "error";
    case "resolved": return "success";
    case "acknowledged": return "warning";
    default: return "info";
  }
}

function getAlertSeverityColor(severity: string): string {
  switch (severity) {
    case "critical": return "#ef4444";
    case "warning": return "#f59e0b";
    default: return "#06b6d4";
  }
}

const alertsStore = useAlertsStore();

// ==================== CHANNEL ICON & COLOR ====================

type ChannelType = "email" | "slack" | "discord" | "msteams" | "zoom" | "telegram" | "webhook" | "pagerduty" | "opsgenie";

function getChannelColor(type: string): { color: string; bg: string } {
  const colors: Record<ChannelType, { color: string; bg: string }> = {
    email: { color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" },
    slack: { color: "#e01e5a", bg: "rgba(224, 30, 90, 0.1)" },
    discord: { color: "#5865f2", bg: "rgba(88, 101, 242, 0.1)" },
    msteams: { color: "#6264a7", bg: "rgba(98, 100, 167, 0.1)" },
    zoom: { color: "#2d8cff", bg: "rgba(45, 140, 255, 0.1)" },
    telegram: { color: "#26a5e4", bg: "rgba(38, 165, 228, 0.1)" },
    webhook: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)" },
    pagerduty: { color: "#06ac38", bg: "rgba(6, 172, 56, 0.1)" },
    opsgenie: { color: "#2684ff", bg: "rgba(38, 132, 255, 0.1)" },
  };
  return colors[type as ChannelType] || { color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)" };
}

const monitorChannels = computed(() => {
  if (!props.monitor?.notificationChannels?.length) return [];
  return props.monitor.notificationChannels
    .map(id => alertsStore.notificationChannels.find(c => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
});

// ==================== STATUS CONFIG ====================

// Green=Up, Red=Down, Orange=Degraded/Pending, Gray=Paused/Unknown
const statusConfig: Record<string, { color: string; bg: string; borderColor: string }> = {
  up: {
    color: UPTIME_COLORS.up,
    bg: "rgba(34, 197, 94, 0.1)",
    borderColor: "rgba(34, 197, 94, 0.2)",
  },
  degraded: {
    color: UPTIME_COLORS.issues,
    bg: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  down: {
    color: UPTIME_COLORS.down,
    bg: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  pending: {
    color: UPTIME_COLORS.issues,
    bg: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  paused: {
    color: UPTIME_COLORS.noData,
    bg: "rgba(156, 163, 175, 0.1)",
    borderColor: "rgba(156, 163, 175, 0.2)",
  },
  unknown: {
    color: UPTIME_COLORS.noData,
    bg: "rgba(156, 163, 175, 0.1)",
    borderColor: "rgba(156, 163, 175, 0.2)",
  },
};

// ==================== COMPUTED ====================

const monitorStatus = computed(() => {
  if (!props.monitor) return statusConfig.unknown;
  return statusConfig[props.monitor.status] || statusConfig.unknown;
});

const typeInfo = computed(() => {
  if (!props.monitor) return { label: "Unknown", icon: "carbon:help", color: "default" };
  return MONITOR_TYPES[props.monitor.type];
});

// Parse URL info
const urlInfo = computed(() => {
  if (!props.monitor) return null;
  try {
    const url = new URL(props.monitor.url);
    return {
      protocol: url.protocol.replace(":", ""),
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? "443" : url.protocol === "http:" ? "80" : ""),
      pathname: url.pathname || "/",
      fullUrl: props.monitor.url,
    };
  } catch {
    return {
      protocol: props.monitor.type,
      hostname: props.monitor.url,
      port: "",
      pathname: "/",
      fullUrl: props.monitor.url,
    };
  }
});

// Uptime percentages for progress bars — uses ClickHouse hourly stats
const uptimeData = computed(() => {
  const s = stats.value || props.monitor?.uptimeStats;
  // No data for PENDING monitors that have never been checked
  if (props.monitor?.status === "pending") return [];

  // If no stats from API but monitor has active status, derive from status
  if (!s && props.monitor) {
    const isActive = ["up", "down", "degraded"].includes(props.monitor.status);
    if (!isActive) return [];
    const uptime = props.monitor.status === "up" ? 100 : props.monitor.status === "degraded" ? 95 : 0;
    const createdAtFallback = props.monitor.createdAt;
    const MS_HOUR_F = 3600000;
    const MS_DAY_F = 86400000;
    return [
      { label: "24 Hours", value: uptime, color: getUptimeColor(uptime), bars: fillEmptyBars(buildBarsFromPercentage(uptime, 50, 24 * MS_HOUR_F), 0, createdAtFallback) },
      { label: "7 Days", value: uptime, color: getUptimeColor(uptime), bars: fillEmptyBars(buildBarsFromPercentage(uptime, 50, 7 * MS_DAY_F), 0, createdAtFallback) },
      { label: "30 Days", value: uptime, color: getUptimeColor(uptime), bars: fillEmptyBars(buildBarsFromPercentage(uptime, 50, 30 * MS_DAY_F), 0, createdAtFallback) },
      { label: "90 Days", value: uptime, color: getUptimeColor(uptime), bars: fillEmptyBars(buildBarsFromPercentage(uptime, 50, 90 * MS_DAY_F), 0, createdAtFallback) },
    ];
  }

  if (!s) return [];

  const MS_HOUR = 3600000;
  const MS_DAY = 86400000;
  const TOTAL_BARS = 50;

  // Build bars — cascade: hourly CH stats → raw PG checks → gray fallback
  // Before createdAt → gray, after → forward-fill last known status
  const createdAt = props.monitor?.createdAt;
  const buildWindowBars = (rangeMs: number, _uptimePct: number): BarEntry[] => {
    let bars: BarEntry[] | undefined;

    // 1. Hourly ClickHouse stats (best — full-hour coverage via spread)
    const hourly = hourlyStats.value;
    if (hourly.length > 0) {
      const hourlyBars = buildBarsFromHourlyStats(hourly, rangeMs, TOTAL_BARS);
      if (hourlyBars.some(b => b.checkCount > 0)) bars = hourlyBars;
    }
    // 2. Raw PG checks (good for very recent monitors without hourly data yet)
    if (!bars && checks.value.length > 0) {
      const checkBars = buildBarsFromChecks(checks.value, rangeMs, TOTAL_BARS);
      if (checkBars.some(b => b.checkCount > 0)) bars = checkBars;
    }
    // 3. No data — all gray bars
    if (!bars) bars = buildBarsFromPercentage(0, TOTAL_BARS, rangeMs);

    // ALWAYS fill — never return unfilled bars
    return fillEmptyBars(bars, 0, createdAt);
  };

  return [
    { label: "24 Hours", value: s.uptime24h, color: getUptimeColor(s.uptime24h), bars: buildWindowBars(24 * MS_HOUR, s.uptime24h) },
    { label: "7 Days", value: s.uptime7d, color: getUptimeColor(s.uptime7d), bars: buildWindowBars(7 * MS_DAY, s.uptime7d) },
    { label: "30 Days", value: s.uptime30d, color: getUptimeColor(s.uptime30d), bars: buildWindowBars(30 * MS_DAY, s.uptime30d) },
    { label: "90 Days", value: s.uptime90d, color: getUptimeColor(s.uptime90d), bars: buildWindowBars(90 * MS_DAY, s.uptime90d) },
  ];
});

// Check history bars (last 40 checks)
const checkHistoryBars = computed(() => {
  if (!checks.value.length) {
    // No check data — gray bars
    return Array.from({ length: 40 }, () => ({
      success: false,
      color: UPTIME_COLORS.noData,
      timestamp: undefined,
      responseTime: undefined,
      empty: true,
    }));
  }
  return checks.value.slice(0, 40).map((c) => ({
    success: c.status === "success",
    color: c.status === "success" ? UPTIME_COLORS.up
         : c.status === "failure" ? UPTIME_COLORS.down
         : UPTIME_COLORS.issues,
    timestamp: c.checkedAt,
    responseTime: c.responseTime,
    empty: false,
  }));
});

// Check history badges — duration + count
const checkHistoryBadges = computed(() => {
  const c = checks.value;
  if (!c.length) return { count: 0, duration: "No data", oldest: "", newest: "" };
  const sorted = [...c].sort((a, b) => a.checkedAt - b.checkedAt);
  const oldest = sorted[0].checkedAt;
  const newest = sorted[sorted.length - 1].checkedAt;
  const spanMs = newest - oldest;
  const mins = Math.floor(spanMs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  let duration: string;
  if (days > 0) duration = `${days}d ${hours % 24}h`;
  else if (hours > 0) duration = `${hours}h ${mins % 60}m`;
  else duration = `${mins}m`;
  return {
    count: c.length,
    duration,
    oldest: formatTimestamp(oldest),
    newest: formatTimestamp(newest),
  };
});

// Response time chart series — derived from real check data
const responseTimeSeries = computed(() => {
  if (!props.monitor) return [];
  if (props.monitor.status === "pending") return [];

  const checkData = checks.value;
  if (checkData.length > 0) {
    // Build series from real check response times
    const sorted = [...checkData].sort((a, b) => a.checkedAt - b.checkedAt);
    const data: Array<[number, number]> = sorted.map(c => [c.checkedAt, c.responseTime]);
    return [{ name: props.monitor.name, data }];
  }

  if (config.useMock) {
    const baseValue = stats.value?.avgResponseTime24h || props.monitor.uptimeStats?.avgResponseTime24h || props.monitor.lastResponseTime || 0;
    if (baseValue <= 0) return [];
    return [generateChartSeries(props.monitor.name, baseValue, baseValue * 0.2, mockTimeOpts.value)];
  }
  // Real: no check data available yet
  return [];
});

// ==================== SSL CERTIFICATE ====================

/**
 * SSL cert info — sourced from:
 * 1. Latest check.sslInfo  (real API, from uptime_checks table)
 * 2. monitor.sslCert        (real API, cached ssl_cert field from backend)
 * No mock fallback — undefined when not available.
 */
const sslCertInfo = computed(() => {
  if (!props.monitor) return null;
  if (!["https", "ssl_certificate"].includes(props.monitor.type)) return null;

  // Priority: latest check sslInfo (most up-to-date)
  const latestCheckWithSsl = [...checks.value]
    .sort((a, b) => b.checkedAt - a.checkedAt)
    .find(c => c.sslInfo);

  // Priority: 1) checks.sslInfo (from PG), 2) monitor.sslCert, 3) sslTrendDays (ClickHouse)
  const raw = latestCheckWithSsl?.sslInfo ?? props.monitor.sslCert;
  // If no raw ssl data from checks/monitor, synthesize from ClickHouse SSL trend
  if (!raw) {
    if (sslTrendDays.value === null) return null;
    const synthDays = sslTrendDays.value;
    const warningDays = props.monitor.sslExpiryWarningDays ?? 14;
    const expiryColor = synthDays > 30 ? "#22c55e" : synthDays > warningDays ? "#f59e0b" : "#ef4444";
    const tagType: "success" | "warning" | "error" = synthDays > 30 ? "success" : synthDays > warningDays ? "warning" : "error";
    const label = synthDays > 30 ? "Valid" : synthDays > warningDays ? "Expiring Soon" : "Critical";
    return {
      label,
      tagType,
      icon: synthDays > 30 ? "carbon:security" : synthDays > warningDays ? "carbon:warning" : "carbon:warning-filled",
      expiryColor,
      daysUntilExpiry: synthDays,
      warningDays,
      validFrom: undefined,
      validTo: undefined,
      issuer: undefined,
      subject: undefined,
      protocol: undefined,
      cipher: undefined,
    };
  }

  const days = raw.daysUntilExpiry;
  const warningDays = props.monitor.sslExpiryWarningDays ?? 14;

  const expiryColor = !raw.valid ? "#ef4444"
    : days === undefined ? "#9ca3af"
    : days > 30 ? "#22c55e"
    : days > warningDays ? "#f59e0b"
    : "#ef4444";

  const tagType: "success" | "warning" | "error" | "default" = !raw.valid ? "error"
    : days === undefined ? "default"
    : days > 30 ? "success"
    : days > warningDays ? "warning"
    : "error";

  const label = !raw.valid ? "Invalid"
    : days === undefined ? "Valid"
    : days > 30 ? "Valid"
    : days > warningDays ? "Expiring Soon"
    : "Critical";

  const icon = !raw.valid ? "carbon:certificate"
    : days === undefined || days > 30 ? "carbon:security"
    : days > warningDays ? "carbon:warning"
    : "carbon:warning-filled";

  return {
    label,
    tagType,
    icon,
    expiryColor,
    daysUntilExpiry: days,
    warningDays,
    validFrom: raw.validFrom ? raw.validFrom : undefined,
    validTo: raw.validTo ? raw.validTo : undefined,
    issuer: raw.issuer,
    subject: raw.subject,
    protocol: (raw as any).protocol as string | undefined,
    cipher: (raw as any).cipher as string | undefined,
  };
});

// ==================== METHODS ====================

function getUptimeColor(pct: number): string {
  if (pct >= 99) return UPTIME_COLORS.up;       // Green
  if (pct >= 90) return UPTIME_COLORS.issues;    // Orange
  return UPTIME_COLORS.down;                     // Red
}

import { formatDateTime } from '@/utils/format';

function formatTimestamp(ts: number): string {
  return formatDateTime(ts);
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d${diffHour % 24}h ago`;
  if (diffHour > 0) return `${diffHour}h${diffMin % 60}m ago`;
  if (diffMin > 0) return `${diffMin}m${diffSec % 60}s ago`;
  return `${diffSec}s ago`;
}

async function fetchMonitorDetails() {
  if (!props.monitor) return;
  loading.value = true;
  try {
    const isSslMonitor = props.monitor.type === "https" || props.monitor.type === "ssl_certificate";
    const [checksResult, statsResult, dailyResult, hourlyResult, sslTrendResult] = await Promise.all([
      uptimeApi.getMonitorChecks(props.monitor.id, { limit: config.limitDataMax }),
      uptimeApi.getMonitorStats(props.monitor.id),
      uptimeApi.getDailyStats(props.monitor.id, 100).catch(() => [] as DailyUptimeStat[]),
      uptimeApi.getHourlyStats(props.monitor.id, 2160).catch(() => [] as HourlyUptimeStat[]), // 90 days
      isSslMonitor ? uptimeApi.getSSLTrend(props.monitor.id, 168).catch(() => []) : Promise.resolve([]),
    ]);
    checks.value = checksResult;
    stats.value = statsResult;
    dailyStats.value = dailyResult;
    hourlyStats.value = hourlyResult;
    // Use the latest (most recent) SSL days point as fallback
    if (sslTrendResult.length > 0) {
      const latest = sslTrendResult[sslTrendResult.length - 1];
      sslTrendDays.value = latest.minSslDays >= 0 ? latest.minSslDays : null;
    } else {
      sslTrendDays.value = null;
    }
  } catch (error) {
    console.error("Failed to fetch monitor details:", error);
  } finally {
    loading.value = false;
  }
}

function handleViewLogs() {
  emit("view-logs");
}

// ==================== WATCH ====================

watch(() => props.monitor, (newMonitor) => {
  if (newMonitor) {
    fetchMonitorDetails();
  } else {
    checks.value = [];
    stats.value = null;
    dailyStats.value = [];
    hourlyStats.value = [];
    sslTrendDays.value = null;
  }
}, { immediate: true });
</script>

<template>
  <NDrawer
    :show="show"
    :width="550"
    placement="right"
    @update:show="(val) => emit('update:show', val)"
  >
    <NDrawerContent v-if="monitor">
      <template #header>
        <div class="drawer-header">
          <Icon
            icon="carbon:activity"
            class="drawer-header-icon"
          />
          <span>Monitor Details</span>
        </div>
      </template>

      <template #footer>
        <div class="drawer-footer">
          <NButton
            type="primary"
            ghost
            @click="emit('update:show', false)"
          >
            <template #icon>
              <Icon icon="carbon:close" />
            </template>
            Close
          </NButton>
        </div>
      </template>

      <!-- Stats Row -->
      <div class="drawer-stats-row">
        <StatPanel
          size="small"
          icon="carbon:status-change"
          :color="monitor.status === 'up' ? 'success' : monitor.status === 'degraded' ? 'warning' : 'error'"
          :value-color="monitorStatus.color"
          title="Status"
          :value="monitor.status.toUpperCase()"
        />
        <StatPanel
          size="small"
          icon="carbon:chart-line"
          color="success"
          value-color="#22c55e"
          title="Uptime (24h)"
          :value="`${(stats?.uptime24h ?? monitor.uptimeStats?.uptime24h ?? (monitor.status === 'up' ? 100 : 0)).toFixed(1)}%`"
        />
        <StatPanel
          size="small"
          icon="carbon:time"
          color="primary"
          value-color="#3b82f6"
          title="Response"
          :value="`${(stats?.avgResponseTime24h ?? monitor.uptimeStats?.avgResponseTime24h ?? monitor.lastResponseTime ?? 0).toFixed(0)}ms`"
        />
        <StatPanel
          size="small"
          icon="carbon:timer"
          color="info"
          value-color="#06b6d4"
          title="Interval"
          :value="formatInterval(monitor.interval)"
        />
      </div>

      <div class="detail-content">
        <!-- Status Banner -->
        <div
          class="status-banner"
          :style="{
            backgroundColor: monitorStatus.bg,
            color: monitorStatus.color,
            borderColor: monitorStatus.borderColor,
          }"
        >
          <Icon
            :icon="monitor.status === 'up' ? 'carbon:checkmark-filled' :
              monitor.status === 'degraded' ? 'carbon:warning-filled' :
              monitor.status === 'paused' ? 'carbon:pause-filled' :
              monitor.status === 'pending' ? 'carbon:time' :
              'carbon:error-filled'
            "
          />
          <span><strong>{{ monitor.status.toUpperCase() }}</strong> - {{ monitor.name }}</span>
        </div>

        <!-- Basic Information -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:information" />
            <span>Basic Information</span>
          </div>
          <table class="info-table">
            <tbody>
              <tr>
                <td class="info-label">
                  Monitor ID
                </td>
                <td class="info-value">
                  <TagBadge
                    :label="monitor.id"
                    :bold="true"
                  />
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Name
                </td>
                <td class="info-value">
                  <code>{{ monitor.name }}</code>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  URL
                </td>
                <td class="info-value">
                  <code>{{ urlInfo?.fullUrl }}</code>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Hostname
                </td>
                <td class="info-value">
                  <code>{{ urlInfo?.hostname }}</code>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Status
                </td>
                <td class="info-value">
                  <NTag
                    :bordered="false"
                    size="small"
                    :style="{
                      backgroundColor: monitorStatus.bg,
                      color: monitorStatus.color,
                    }"
                  >
                    {{ monitor.status }}
                  </NTag>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Monitor Type
                </td>
                <td class="info-value">
                  <div style="display: flex; align-items: center; gap: 8px">
                    <Icon
                      :icon="typeInfo.icon"
                      :style="{ fontSize: '18px' }"
                    />
                    <code>{{ typeInfo.label }}</code>
                  </div>
                </td>
              </tr>
              <tr v-if="monitor.httpMethod">
                <td class="info-label">
                  HTTP Method
                </td>
                <td class="info-value">
                  <NTag size="small">
                    {{ monitor.httpMethod }}
                  </NTag>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Last Check
                </td>
                <td class="info-value">
                  <code>{{ monitor.lastCheckAt ? formatTimestamp(monitor.lastCheckAt) : 'Never' }}</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Check Configuration -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:settings" />
            <span>Check Configuration</span>
          </div>
          <table class="info-table">
            <tbody>
              <tr>
                <td class="info-label">
                  Interval
                </td>
                <td class="info-value">
                  <code>{{ monitor.interval }} seconds</code>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Timeout
                </td>
                <td class="info-value">
                  <code>{{ monitor.timeout }} seconds</code>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Retries
                </td>
                <td class="info-value">
                  <code>{{ monitor.retries }}</code>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Active
                </td>
                <td class="info-value">
                  <NTag
                    :type="monitor.isActive ? 'success' : 'default'"
                    size="small"
                  >
                    {{ monitor.isActive ? 'Yes' : 'No' }}
                  </NTag>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- SSL Certificate -->
        <div
          v-if="monitor.type === 'https' || monitor.type === 'ssl_certificate'"
          class="detail-section"
        >
          <div class="section-label">
            <Icon icon="carbon:security" />
            <span>SSL Certificate</span>
            <NTag
              v-if="sslCertInfo"
              :type="sslCertInfo.tagType"
              size="tiny"
              round
              :bordered="false"
              style="margin-left: auto"
            >
              <template #icon>
                <Icon :icon="sslCertInfo.icon" />
              </template>
              {{ sslCertInfo.label }}
            </NTag>
          </div>
          <div
            v-if="!sslCertInfo"
            class="events-empty"
          >
            <Icon
              icon="carbon:security"
              class="events-empty-icon"
              style="color: #9ca3af"
            />
            <span>Awaiting SSL check data</span>
          </div>
          <table
            v-else
            class="info-table"
          >
            <tbody>
              <tr v-if="sslCertInfo.daysUntilExpiry !== undefined">
                <td class="info-label">
                  Expires In
                </td>
                <td class="info-value">
                  <span :style="{ fontWeight: '600', color: sslCertInfo.expiryColor }">
                    {{ sslCertInfo.daysUntilExpiry }} days
                  </span>
                  <span style="color: #9ca3af; font-size: 11px; margin-left: 6px">
                    (warn at {{ sslCertInfo.warningDays }}d)
                  </span>
                </td>
              </tr>
              <tr v-if="sslCertInfo.validTo">
                <td class="info-label">
                  Valid Until
                </td>
                <td class="info-value">
                  <code>{{ formatTimestamp(sslCertInfo.validTo) }}</code>
                </td>
              </tr>
              <tr v-if="sslCertInfo.validFrom">
                <td class="info-label">
                  Valid From
                </td>
                <td class="info-value">
                  <code>{{ formatTimestamp(sslCertInfo.validFrom) }}</code>
                </td>
              </tr>
              <tr v-if="sslCertInfo.issuer">
                <td class="info-label">
                  Issuer
                </td>
                <td class="info-value">
                  <code style="font-size: 11px; word-break: break-all">{{ sslCertInfo.issuer }}</code>
                </td>
              </tr>
              <tr v-if="sslCertInfo.subject">
                <td class="info-label">
                  Subject
                </td>
                <td class="info-value">
                  <code style="font-size: 11px">{{ sslCertInfo.subject }}</code>
                </td>
              </tr>
              <tr v-if="sslCertInfo.protocol">
                <td class="info-label">
                  Protocol
                </td>
                <td class="info-value">
                  <NTag
                    size="small"
                    :bordered="false"
                    type="info"
                  >
                    {{ sslCertInfo.protocol }}
                  </NTag>
                </td>
              </tr>
              <tr v-if="sslCertInfo.cipher">
                <td class="info-label">
                  Cipher
                </td>
                <td class="info-value">
                  <code style="font-size: 11px">{{ sslCertInfo.cipher }}</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Uptime Statistics -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:meter" />
            <span>Uptime Statistics</span>
          </div>
          <div
            v-if="uptimeData.length === 0"
            class="events-empty"
          >
            <Icon
              icon="carbon:time"
              class="events-empty-icon"
              style="color: #3b82f6"
            />
            <span>Awaiting first check data</span>
          </div>
          <div
            v-else
            class="uptime-stats-container"
          >
            <div
              v-for="item in uptimeData"
              :key="item.label"
              class="uptime-stat-row"
            >
              <div class="uptime-stat-label">
                <span>{{ item.label }}</span>
                <span
                  class="uptime-stat-value"
                  :style="{ color: item.color }"
                >
                  {{ item.value.toFixed(2) }}%
                </span>
              </div>
              <div class="uptime-stat-bars">
                <NTooltip
                  v-for="(bar, idx) in item.bars"
                  :key="idx"
                  trigger="hover"
                  placement="top"
                >
                  <template #trigger>
                    <div
                      class="uptime-stat-bar"
                      :style="{
                        backgroundColor: bar.color,
                      }"
                    />
                  </template>
                  <div class="bar-tooltip">
                    <div
                      class="bar-tooltip-status"
                      :style="{ color: bar.color }"
                    >
                      {{ bar.statusLabel }}
                    </div>
                    <div v-if="bar.avgResponseTime">
                      {{ bar.avgResponseTime }}ms
                    </div>
                    <div class="bar-tooltip-time">
                      {{ bar.timestamp }}
                    </div>
                  </div>
                </NTooltip>
              </div>
              <div class="uptime-stat-range-label">
                <span>Older</span>
                <span>Recent</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Response Time Trends -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:chart-line" />
            <span>Response Time Trends</span>
          </div>
          <div
            v-if="responseTimeSeries.length === 0"
            class="events-empty"
          >
            <Icon
              icon="carbon:chart-line"
              class="events-empty-icon"
              style="color: #3b82f6"
            />
            <span>No response data yet</span>
          </div>
          <div
            v-else
            class="mini-charts"
          >
            <MiniChartCard
              title="Response Time"
              icon="carbon:time"
              icon-class="text-blue-500"
              :value="`${(stats?.avgResponseTime24h ?? monitor.uptimeStats?.avgResponseTime24h ?? monitor.lastResponseTime ?? 0).toFixed(0)}ms`"
              :series="responseTimeSeries"
              unit="ms"
            />
          </div>
        </div>

        <!-- Check History Bars -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:chart-histogram" />
            <span>Check History</span>
          </div>
          <div
            v-if="checkHistoryBadges.count > 0"
            class="check-history-badges"
          >
            <NTag
              size="small"
              :bordered="false"
              type="info"
              round
            >
              <template #icon>
                <Icon icon="carbon:time" />
              </template>
              {{ checkHistoryBadges.duration }}
            </NTag>
            <NTag
              size="small"
              :bordered="false"
              type="success"
              round
            >
              <template #icon>
                <Icon icon="carbon:checkmark" />
              </template>
              {{ checkHistoryBadges.count }} checks
            </NTag>
            <NTooltip
              trigger="hover"
              placement="top"
            >
              <template #trigger>
                <NTag
                  size="small"
                  :bordered="false"
                  round
                >
                  <template #icon>
                    <Icon icon="carbon:calendar" />
                  </template>
                  {{ checkHistoryBadges.oldest }} — {{ checkHistoryBadges.newest }}
                </NTag>
              </template>
              <span>From oldest to newest check</span>
            </NTooltip>
          </div>
          <div class="check-history-container">
            <div class="history-bars">
              <NTooltip
                v-for="(bar, idx) in checkHistoryBars"
                :key="idx"
                trigger="hover"
                placement="top"
              >
                <template #trigger>
                  <div
                    class="history-bar"
                    :style="{ backgroundColor: bar.color }"
                  />
                </template>
                <div class="bar-tooltip">
                  <div v-if="bar.empty">
                    No data yet
                  </div>
                  <template v-else>
                    <div>{{ bar.success ? 'Success' : 'Failed' }}</div>
                    <div v-if="bar.responseTime">
                      {{ bar.responseTime }}ms
                    </div>
                    <div v-if="bar.timestamp">
                      {{ formatTimestamp(bar.timestamp) }}
                    </div>
                  </template>
                </div>
              </NTooltip>
            </div>
            <div class="history-legend">
              <span>Older</span>
              <span>Recent</span>
            </div>
          </div>
        </div>

        <!-- Tags -->
        <div
          v-if="monitor.tags.length > 0"
          class="detail-section"
        >
          <div class="section-label">
            <Icon icon="carbon:tag-group" />
            <span>Tags</span>
          </div>
          <div class="tags-container">
            <TagBadge
              v-for="tag in monitor.tags"
              :key="tag"
              :label="tag"
              :bold="true"
            />
          </div>
        </div>

        <!-- Notification Channels -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:notification" />
            <span>Notification</span>
          </div>
          <div
            v-if="monitorChannels.length === 0"
            class="empty-channels-hint"
          >
            <NTag
              :bordered="false"
              size="small"
              type="default"
            >
              No channels configured
            </NTag>
          </div>
          <div
            v-else
            class="used-by-groups"
          >
            <div class="usage-group">
              <div class="usage-group-label">
                <Icon
                  icon="carbon:notification"
                  :style="{ fontSize: '14px' }"
                />
                <span>Notification Channels</span>
                <NTag
                  size="tiny"
                  :bordered="false"
                  round
                  :style="{ backgroundColor: '#e0f2fe', color: '#0ea5e9' }"
                >
                  {{
                    monitorChannels.length }}
                </NTag>
              </div>
              <div class="used-by-tags">
                <span
                  v-for="channel in monitorChannels"
                  :key="channel.id"
                  class="channel-usage-badge"
                  :style="{
                    backgroundColor: getChannelColor(channel.type).bg,
                    color: getChannelColor(channel.type).color,
                  }"
                >
                  <Icon
                    :icon="getChannelIcon(channel.type)"
                    :style="{ fontSize: '12px' }"
                  />
                  {{ channel.name }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Actions Card -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:settings-adjust" />
            <span>Actions</span>
          </div>
          <div class="actions-card">
            <NButton
              type="primary"
              size="small"
              @click="emit('edit', monitor)"
            >
              <template #icon>
                <Icon icon="carbon:edit" />
              </template>
              Edit
            </NButton>
            <NButton
              v-if="monitor.isPaused"
              type="success"
              size="small"
              @click="emit('resume', monitor)"
            >
              <template #icon>
                <Icon icon="carbon:play" />
              </template>
              Resume
            </NButton>
            <NButton
              v-else
              type="warning"
              size="small"
              @click="emit('pause', monitor)"
            >
              <template #icon>
                <Icon icon="carbon:pause" />
              </template>
              Pause
            </NButton>
            <NPopconfirm @positive-click="emit('delete', monitor)">
              <template #trigger>
                <NButton
                  type="error"
                  size="small"
                >
                  <template #icon>
                    <Icon icon="carbon:trash-can" />
                  </template>
                  Delete
                </NButton>
              </template>
              Are you sure you want to delete this monitor?
            </NPopconfirm>
          </div>
        </div>

        <!-- Events Section (Timeline style like K8s Pods) -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:event-schedule" />
            <span>Events</span>
          </div>
          <div class="events-container">
            <NTimeline v-if="monitorEvents.length > 0">
              <NTimelineItem
                v-for="(event, idx) in monitorEvents"
                :key="idx"
                :type="event.severity === 'error' ? 'error' : event.severity === 'warning' ? 'warning' : event.severity === 'success' ? 'success' : 'info'"
                :title="event.type"
              >
                <div class="event-content">
                  <div
                    class="event-message-box"
                    :class="{ 'text-warning': event.severity === 'error' }"
                  >
                    <code>{{ event.message }}</code>
                  </div>
                  <table class="event-details-table">
                    <tbody>
                      <tr>
                        <td class="event-detail-label">
                          Source
                        </td>
                        <td class="event-detail-value">
                          {{ event.source }}
                        </td>
                      </tr>
                      <tr>
                        <td class="event-detail-label">
                          Count
                        </td>
                        <td class="event-detail-value">
                          {{ event.count }}
                        </td>
                      </tr>
                      <tr>
                        <td class="event-detail-label">
                          Last seen
                        </td>
                        <td class="event-detail-value">
                          {{ formatRelativeTime(event.lastSeen) }} ({{ formatTimestamp(new
                            Date(event.lastSeen).getTime()) }})
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </NTimelineItem>
            </NTimeline>
            <div
              v-else
              class="events-empty"
            >
              <Icon
                icon="carbon:checkmark-outline"
                class="events-empty-icon"
              />
              <span>No events recorded</span>
            </div>
          </div>
        </div>

        <!-- Alert History Section -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:warning-alt" />
            <span>Alert History</span>
          </div>
          <div class="alert-history-container">
            <NTimeline v-if="alertHistory.length > 0">
              <NTimelineItem
                v-for="alert in alertHistory"
                :key="alert.id"
                :type="getAlertTypeColor(alert.type)"
                :title="alert.title"
              >
                <template #icon>
                  <div
                    class="alert-timeline-icon"
                    :class="[`alert-icon-${alert.type}`]"
                  >
                    <Icon
                      :icon="alert.type === 'firing' ? 'carbon:warning-filled' : alert.type === 'resolved' ? 'carbon:checkmark-filled' : 'carbon:user-filled'"
                    />
                  </div>
                </template>
                <div class="alert-content">
                  <div class="alert-badges">
                    <NTag
                      :type="getAlertTypeColor(alert.type)"
                      size="small"
                      :bordered="false"
                    >
                      {{ alert.type.toUpperCase() }}
                    </NTag>
                    <NTag
                      size="small"
                      :bordered="false"
                      :style="{ backgroundColor: getAlertSeverityColor(alert.severity) + '20', color: getAlertSeverityColor(alert.severity) }"
                    >
                      {{ alert.severity.toUpperCase() }}
                    </NTag>
                  </div>
                  <div class="alert-message-box">
                    <code>{{ alert.message }}</code>
                  </div>
                  <table class="alert-details-table">
                    <tbody>
                      <tr>
                        <td class="alert-detail-label">
                          Triggered
                        </td>
                        <td class="alert-detail-value">
                          {{ formatRelativeTime(alert.triggeredAt) }}
                        </td>
                      </tr>
                      <tr v-if="alert.resolvedAt">
                        <td class="alert-detail-label">
                          Resolved
                        </td>
                        <td class="alert-detail-value">
                          {{ formatRelativeTime(alert.resolvedAt) }}
                        </td>
                      </tr>
                      <tr v-if="alert.duration">
                        <td class="alert-detail-label">
                          Duration
                        </td>
                        <td class="alert-detail-value">
                          {{ alert.duration }}
                        </td>
                      </tr>
                      <tr v-if="alert.acknowledgedBy">
                        <td class="alert-detail-label">
                          Ack by
                        </td>
                        <td class="alert-detail-value">
                          {{ alert.acknowledgedBy }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </NTimelineItem>
            </NTimeline>
            <div
              v-else
              class="alerts-empty"
            >
              <Icon
                icon="carbon:checkmark-outline"
                class="alerts-empty-icon"
              />
              <span>No alert history</span>
            </div>
          </div>
        </div>

        <!-- View Logs Card -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:document" />
            <span>Monitor Logs</span>
          </div>
          <div class="logs-action-card">
            <div class="logs-action-info">
              <Icon
                icon="carbon:activity"
                class="logs-action-icon"
              />
              <div class="logs-action-text">
                <span class="logs-action-title">View Monitor Logs</span>
                <span class="logs-action-desc">Open logs filtered by this monitor</span>
              </div>
            </div>
            <NButton
              type="primary"
              size="small"
              @click="handleViewLogs"
            >
              <template #icon>
                <Icon icon="carbon:arrow-right" />
              </template>
              View Logs
            </NButton>
          </div>
        </div>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped lang="scss">
@import "@/styles/tfo-table-styles.scss";

.drawer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.drawer-header-icon {
  font-size: 20px;
  color: var(--n-primary-color);
}

.drawer-stats-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.detail-content {
  margin-top: 4px;
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 0.875rem;
  margin-bottom: 20px;
  border: 1px solid;

  :deep(svg) {
    font-size: 18px;
  }
}

.detail-section {
  margin-top: 24px;

  &:first-child {
    margin-top: 0;
  }
}

.section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--n-text-color-3);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;

  :deep(svg) {
    font-size: 16px;
  }
}

// Info Table (matching AgentDetailsPanel design)
.info-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  overflow: hidden;

  :root.dark & {
    border-color: var(--k8s-border-color);
  }

  tr:not(:last-child) td {
    border-bottom: 1px solid var(--k8s-border-color);

    :root.dark & {
      border-color: var(--k8s-border-color);
    }
  }

  td {
    padding: 10px 12px;
  }

  .info-label {
    font-weight: 500;
    color: var(--n-text-color-3);
    font-size: 0.8125rem;
    width: 140px;
    min-width: 120px;
    background: rgba(100, 116, 139, 0.1);

    :root.dark & {
      background: rgba(51, 65, 85, 0.4);
    }
  }

  .info-value {
    color: var(--n-text-color);
    font-size: 0.8125rem;

    code {
      font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
      font-size: 0.8125rem;
      background: transparent;
      padding: 0;
      border: none;
    }
  }
}

.uptime-cell {
  display: flex;
  align-items: center;
  gap: 12px;

  .uptime-percent {
    font-weight: 600;
    font-size: 0.8125rem;
    min-width: 60px;
    text-align: right;
  }
}

// Mini Charts
.mini-charts {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// Uptime Statistics (horizontal bars like Check History)
.uptime-stats-container {
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  padding: 16px;
  background: var(--n-card-color);
  display: flex;
  flex-direction: column;
  gap: 16px;

  :root.dark & {
    background: rgba(30, 41, 59, 0.5);
  }
}

.uptime-stat-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.uptime-stat-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;

  span:first-child {
    color: var(--n-text-color-3);
    font-weight: 500;
  }
}

.uptime-stat-value {
  font-weight: 600;
  font-size: 0.8125rem;
}

.uptime-stat-bars {
  display: flex;
  gap: 2px;
  height: 24px;
  align-items: stretch;
}

.uptime-stat-bar {
  flex: 1;
  min-width: 4px;
  border-radius: 2px;
  cursor: pointer;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.8;
  }
}

.bar-tooltip {
  text-align: center;
  font-size: 12px;
  line-height: 1.5;

  .bar-tooltip-status {
    font-weight: 700;
  }

  .bar-tooltip-time {
    font-size: 11px;
    color: var(--n-text-color-3);
  }
}

.uptime-stat-range-label {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 0.625rem;
  color: var(--n-text-color-3);
  letter-spacing: 0.03em;
}

// Check History
.check-history-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.check-history-container {
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  padding: 12px;
  background: var(--n-card-color);

  :root.dark & {
    background: rgba(30, 41, 59, 0.5);
  }

  .history-bars {
    display: flex;
    gap: 2px;
    height: 28px;
    align-items: stretch;
  }

  .history-bar {
    flex: 1;
    min-width: 4px;
    border-radius: 2px;
    cursor: pointer;
    transition: opacity 0.15s;

    &:hover {
      opacity: 0.8;
    }
  }

  .history-legend {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 11px;
    color: var(--n-text-color-3);
  }
}

.bar-tooltip {
  text-align: center;
  font-size: 12px;
  line-height: 1.4;
}

// Tags
.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  background: var(--n-card-color);

  :root.dark & {
    background: rgba(30, 41, 59, 0.5);
  }
}

// Notification Channels - Grouped pattern (matching notification-channels detail drawer)
.empty-channels-hint {
  padding: 16px;
  text-align: center;
  border: 1px dashed var(--k8s-border-color);
  border-radius: 6px;
}

.used-by-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.usage-group {
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  padding: 12px;
  background: var(--n-card-color);

  :root.dark & {
    background: rgba(30, 41, 59, 0.5);
  }
}

.usage-group-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--n-text-color-2);
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--k8s-border-color);
}

.used-by-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.channel-usage-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

// Actions Card
.actions-card {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  background: var(--n-card-color);

  :root.dark & {
    background: rgba(30, 41, 59, 0.5);
  }
}

// Logs Action Card
.logs-action-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;

  :root.dark & {
    background: rgba(14, 165, 233, 0.1);
    border-color: rgba(14, 165, 233, 0.3);
  }
}

.logs-action-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logs-action-icon {
  font-size: 24px;
  color: #0ea5e9;
}

.logs-action-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.logs-action-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #0c4a6e;

  :root.dark & {
    color: #7dd3fc;
  }
}

.logs-action-desc {
  font-size: 0.75rem;
  color: #0369a1;

  :root.dark & {
    color: #38bdf8;
  }
}

// Events Section (Timeline style like K8s Pods)
.events-container {
  padding: 16px 20px;
  background: #f8fafc;
  border: 1px solid var(--k8s-border-color);
  border-radius: 8px;
  max-height: 350px;
  overflow-y: auto;

  :root.dark & {
    background: #0f172a;
    border-color: var(--k8s-border-color);
  }

  // NTimeline styling
  :deep(.n-timeline) {
    .n-timeline-item {
      padding-bottom: 20px;

      &:last-child {
        padding-bottom: 0;
      }
    }

    .n-timeline-item-timeline__line {
      background-color: var(--k8s-border-color) !important;
    }

    .n-timeline-item-content__title {
      font-weight: 600;
      font-size: 0.9375rem;
      color: var(--n-text-color);
      margin-bottom: 4px;
    }
  }
}

.event-content {
  margin-top: 2px;
  padding-top: 2px;
}

.event-message-box {
  background: #f1f5f9;
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;

  :root.dark & {
    background: #1e293b;
    border-color: var(--k8s-border-color);
  }

  code {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 0.75rem;
    line-height: 1.5;
    color: #334155;
    word-break: break-word;
    white-space: pre-wrap;
    display: block;

    :root.dark & {
      color: #e2e8f0;
    }
  }

  &.text-warning {
    background: #fef2f2;
    border-color: #fecaca;

    :root.dark & {
      background: rgba(220, 38, 38, 0.15);
      border-color: rgba(220, 38, 38, 0.3);
    }

    code {
      color: #dc2626;

      :root.dark & {
        color: #fca5a5;
      }
    }
  }
}

.event-details-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: #ffffff;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--k8s-border-color);

  :root.dark & {
    background: #0f172a;
    border-color: var(--k8s-border-color);
  }

  tr {
    &:not(:last-child) td {
      border-bottom: 1px solid var(--k8s-border-color);

      :root.dark & {
        border-color: var(--k8s-border-color);
      }
    }
  }

  td {
    padding: 8px 12px;
    font-size: 0.8125rem;
    vertical-align: middle;
  }

  .event-detail-label {
    width: 140px;
    min-width: 120px;
    color: #6b7280;
    font-weight: 600;
    font-size: 0.75rem;
    background: #f3f4f6;
    border-right: 1px solid var(--k8s-border-color);

    :root.dark & {
      color: #94a3b8;
      background: #1e293b;
      border-right-color: var(--k8s-border-color);
    }
  }

  .event-detail-value {
    color: #1f2937;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 0.75rem;
    background: #ffffff;

    :root.dark & {
      color: #e2e8f0;
      background: #0f172a;
    }
  }
}

.events-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--n-text-color-3);
  font-size: 0.875rem;
}

.events-empty-icon {
  font-size: 20px;
  color: #22c55e;
}

// Alert History Section
.alert-history-container {
  padding: 16px 20px;
  background: #f8fafc;
  border: 1px solid var(--k8s-border-color);
  border-radius: 8px;
  max-height: 400px;
  overflow-y: auto;

  :root.dark & {
    background: #0f172a;
    border-color: var(--k8s-border-color);
  }

  // NTimeline custom icon alignment
  :deep(.n-timeline) {
    .n-timeline-item {
      padding-bottom: 24px;

      &:last-child {
        padding-bottom: 0;
      }
    }

    // Line styling - start right below icon
    .n-timeline-item-timeline__line {
      background-color: var(--k8s-border-color) !important;
      top: 24px !important; // Start right below 24px icon
    }

    // Content spacing from icon
    .n-timeline-item-content {
      padding-left: 12px !important;
    }

    .n-timeline-item-content__title {
      font-weight: 600;
      font-size: 0.9375rem;
      color: var(--n-text-color);
      margin-bottom: 8px;
    }
  }
}

.alert-timeline-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
  position: relative;
  z-index: 1; // Icon in front of line

  // Firing - red background
  &.alert-icon-firing {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
  }

  // Resolved - green background
  &.alert-icon-resolved {
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    box-shadow: 0 2px 8px rgba(34, 197, 94, 0.4);
  }

  // Acknowledged - amber/orange background
  &.alert-icon-acknowledged {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
  }
}

.alert-content {
  margin-top: 0;
  padding-top: 0;
}

.alert-badges {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;

  :deep(.n-tag) {
    font-weight: 600;
  }
}

.alert-message-box {
  background: #f1f5f9;
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;

  :root.dark & {
    background: #1e293b;
    border-color: var(--k8s-border-color);
  }

  code {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 0.75rem;
    line-height: 1.5;
    color: #334155;
    word-break: break-word;
    white-space: pre-wrap;
    display: block;

    :root.dark & {
      color: #e2e8f0;
    }
  }
}

.alert-details-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: #ffffff;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--k8s-border-color);

  :root.dark & {
    background: #0f172a;
    border-color: var(--k8s-border-color);
  }

  tr {
    &:not(:last-child) td {
      border-bottom: 1px solid var(--k8s-border-color);

      :root.dark & {
        border-color: var(--k8s-border-color);
      }
    }
  }

  td {
    padding: 8px 12px;
    font-size: 0.8125rem;
    vertical-align: middle;
  }

  .alert-detail-label {
    width: 140px;
    min-width: 120px;
    color: #6b7280;
    font-weight: 600;
    font-size: 0.75rem;
    background: #f3f4f6;
    border-right: 1px solid var(--k8s-border-color);

    :root.dark & {
      color: #94a3b8;
      background: #1e293b;
      border-right-color: var(--k8s-border-color);
    }
  }

  .alert-detail-value {
    color: #1f2937;
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 0.75rem;
    background: #ffffff;

    :root.dark & {
      color: #e2e8f0;
      background: #0f172a;
    }
  }
}

.alerts-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--n-text-color-3);
  font-size: 0.875rem;
}

.alerts-empty-icon {
  font-size: 20px;
  color: #22c55e;
}

// Drawer Footer
.drawer-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding-top: 5px;
  border-top: 1px solid var(--n-border-color);

  :deep(.n-button) {
    width: 120px;
    min-width: 100px;
    height: 36px !important;
    line-height: 34px;
    padding: 0 !important;
    box-sizing: border-box;
  }
}

// Responsive
@media (max-width: 768px) {
  .drawer-stats-row {
    grid-template-columns: 1fr 1fr;
  }

  .actions-card {
    flex-direction: column;

    :deep(.n-button) {
      width: 100%;
    }
  }

  .logs-action-card {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;

    :deep(.n-button) {
      width: 100%;
    }
  }
}
</style>