<script setup lang="ts">
/**
 * Status Page Detail Panel - Drawer View
 * TASK-10: Detailed status page information panel
 * Design based on MonitorDetailPanel pattern
 */

import { ref, computed, watch } from "vue";
import { Icon } from "@iconify/vue";
import {
  NDrawer,
  NDrawerContent,
  NButton,
  NTag,
  NPopconfirm,
  NTimeline,
  NTimelineItem,
  NInput,
  NSelect,
  NTooltip,
} from "naive-ui";
import { StatPanel } from "@/components/charts";
import TagBadge from "@/components/common/TagBadge.vue";
import type { StatusPage, Subscriber, SubscriptionType, NotificationType } from "@/types/statuspage";
import type { IncidentImpact } from "@/types/statuspage";
import {
  OVERALL_STATUS,
  INCIDENT_IMPACT,
  getStatusPageUrl,
} from "@/types/statuspage";
import config from "@/config";
import { statusPageApi } from "@/api/statuspage";
import { uptimeApi } from "@/api/uptime";
import type { Monitor, UptimeStats, DailyUptimeStat, UptimeCheck, HourlyUptimeStat } from "@/types/uptime";
import { UPTIME_COLORS } from "@/types/uptime";
import {
  buildBarsFromHourlyStats,
  buildBarsFromChecks,
  buildBarsFromPercentage,
  fillEmptyBars,
  TIME_RANGE_OPTIONS,
  rangeToHours,
  type BarEntry,
} from "@/composables/useUptimeBars";

const props = defineProps<{
  show: boolean;
  statusPage: StatusPage | null;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
  edit: [statusPage: StatusPage];
  delete: [statusPage: StatusPage];
  "manage-incidents": [statusPage: StatusPage];
  "manage-monitors": [statusPage: StatusPage];
}>();

// ==================== DATA ====================

const loading = ref(false);
const linkedMonitors = ref<Monitor[]>([]);
const monitorStatsMap = ref<Map<string, UptimeStats>>(new Map());
const dailyStatsMap = ref<Map<string, DailyUptimeStat[]>>(new Map());
const checksMap = ref<Map<string, UptimeCheck[]>>(new Map());

// Subscribers
const subscribers = ref<Subscriber[]>([]);
const subscriberCount = ref(0);
const subscriberLoading = ref(false);

// Pagination for incident timeline
const incidentPage = ref(1);
const incidentPageSize = 10;

// ==================== BAR GENERATION (shared composable) ====================

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;
const TOTAL_BARS = 50;

// Time range dropdown for linked monitors bars
const selectedBarRange = ref(24 * MS_HOUR); // default 24 hours
const timeRangeOptions = TIME_RANGE_OPTIONS;

// Hourly stats for bar charts (from ClickHouse)
const hourlyStatsMap = ref<Map<string, HourlyUptimeStat[]>>(new Map());

/**
 * Build bars for a monitor — cascade through data sources.
 * Before createdAt → gray. After → forward-fill last known status.
 *
 * Priority: Hourly CH stats → Raw PG checks → All gray fallback
 */
function buildMonitorBars(monitorId: string, rangeMs: number, _uptimePct: number): BarEntry[] {
  const mon = linkedMonitors.value.find(m => m.id === monitorId);
  const createdAt = mon?.createdAt;
  let bars: BarEntry[] | undefined;

  // 1. Hourly ClickHouse stats (best — full-hour coverage via spread)
  const hourlyStats = hourlyStatsMap.value.get(monitorId);
  if (hourlyStats && hourlyStats.length > 0) {
    const hourlyBars = buildBarsFromHourlyStats(hourlyStats, rangeMs, TOTAL_BARS);
    if (hourlyBars.some(b => b.checkCount > 0)) bars = hourlyBars;
  }
  // 2. Raw PG checks (good for very recent monitors without hourly data yet)
  if (!bars) {
    const checks = checksMap.value.get(monitorId) || [];
    if (checks.length > 0) {
      const checkBars = buildBarsFromChecks(checks, rangeMs, TOTAL_BARS);
      if (checkBars.some(b => b.checkCount > 0)) bars = checkBars;
    }
  }
  // 3. No data — all gray bars
  if (!bars) bars = buildBarsFromPercentage(0, TOTAL_BARS, rangeMs);

  // ALWAYS fill — never return unfilled bars
  return fillEmptyBars(bars, 0, createdAt);
}

/**
 * Build aggregated bars across all monitors for Uptime Statistics.
 * Before earliest createdAt → gray. After → forward-fill last known status.
 */
function buildAggregatedBars(rangeMs: number, _uptimePct: number): BarEntry[] {
  // Earliest monitor creation → bars before this stay gray
  const earliestCreatedAt = linkedMonitors.value.length > 0
    ? Math.min(...linkedMonitors.value.map(m => m.createdAt))
    : undefined;
  let bars: BarEntry[] | undefined;

  // 1. Hourly ClickHouse stats (aggregated from all monitors)
  const allHourly: HourlyUptimeStat[] = [];
  for (const [, stats] of hourlyStatsMap.value) {
    allHourly.push(...stats);
  }
  if (allHourly.length > 0) {
    const hourlyBars = buildBarsFromHourlyStats(allHourly, rangeMs, TOTAL_BARS);
    if (hourlyBars.some(b => b.checkCount > 0)) bars = hourlyBars;
  }
  // 2. Raw PG checks (aggregated from all monitors)
  if (!bars) {
    const allChecks: UptimeCheck[] = [];
    for (const [, chks] of checksMap.value) {
      allChecks.push(...chks);
    }
    if (allChecks.length > 0) {
      const checkBars = buildBarsFromChecks(allChecks, rangeMs, TOTAL_BARS);
      if (checkBars.some(b => b.checkCount > 0)) bars = checkBars;
    }
  }
  // 3. No data — all gray bars
  if (!bars) bars = buildBarsFromPercentage(0, TOTAL_BARS, rangeMs);

  // ALWAYS fill — never return unfilled bars
  return fillEmptyBars(bars, 0, earliestCreatedAt);
}

// ==================== COMPUTED ====================

// Real uptime data for linked monitors (fetched from uptime API)
const monitorUptimeData = computed(() => {
  if (!props.statusPage) return [];

  return props.statusPage.monitors.map((m, idx) => {
    const real = linkedMonitors.value.find(rm => rm.id === m.monitorId);
    const stats = monitorStatsMap.value.get(m.monitorId);
    const uptime = stats?.uptime24h ?? real?.uptimeStats?.uptime24h ?? (real?.status === "up" ? 100 : real?.status === "degraded" ? 95 : 0);
    const responseTime = stats?.avgResponseTime24h ?? real?.uptimeStats?.avgResponseTime24h ?? real?.lastResponseTime ?? 0;
    const bars = buildMonitorBars(m.monitorId, selectedBarRange.value, uptime);

    // SSL cert — from monitor.sslCert (real API) or undefined
    const sslDays = real?.sslCert?.daysUntilExpiry;
    const sslValid = real?.sslCert?.valid;
    const hasSsl = real && ["https", "ssl_certificate"].includes(real.type);

    return {
      id: m.monitorId,
      name: m.displayName || real?.name || `Monitor ${idx + 1}`,
      uptime,
      status: real?.status || (uptime >= 99 ? "up" : uptime >= 95 ? "degraded" : "down"),
      responseTime: Math.round(responseTime),
      bars,
      hasSsl,
      sslDays,
      sslValid,
    };
  });
});

// Incident timeline — derived from real uptime check failures (CH daily stats only)
// Manual/seed incidents from PG are shown on the public page; this panel shows uptime-derived data
const incidentTimeline = computed(() => {
  const items: Array<{
    id: string;
    title: string;
    status: string;
    impact: IncidentImpact;
    type: string;
    message: string;
    triggeredAt: string;
    resolvedAt?: string;
    sortTime: number;
  }> = [];

  if (props.statusPage) {
    for (const m of props.statusPage.monitors) {
      const daily = dailyStatsMap.value.get(m.monitorId);
      if (!daily) continue;
      for (const day of daily) {
        if (day.failureCount > 0) {
          const monitorName = m.displayName || monitorUptimeData.value.find(md => md.id === m.monitorId)?.name || "Monitor";
          const dateTs = new Date(day.date).getTime();
          items.push({
            id: `auto-${m.monitorId}-${day.date}`,
            title: `${monitorName} — ${day.failureCount} failed check${day.failureCount > 1 ? "s" : ""}`,
            status: "resolved",
            impact: (day.uptimePercentage < 90 ? "major" : day.uptimePercentage < 99 ? "minor" : "none") as IncidentImpact,
            type: "resolved",
            message: `${day.failureCount}/${day.totalChecks} checks failed (${day.uptimePercentage}% uptime)`,
            triggeredAt: new Date(dateTs).toISOString(),
            resolvedAt: new Date(dateTs + 86400000).toISOString(),
            sortTime: dateTs,
          });
        }
      }
    }
  }

  return items.sort((a, b) => b.sortTime - a.sortTime);
});

// Paginated incident timeline
const paginatedIncidentTimeline = computed(() => {
  const start = (incidentPage.value - 1) * incidentPageSize;
  return incidentTimeline.value.slice(start, start + incidentPageSize);
});

const incidentTotalPages = computed(() =>
  Math.ceil(incidentTimeline.value.length / incidentPageSize)
);

// ==================== STATUS CONFIG ====================

const statusConfig: Record<string, { color: string; bg: string; borderColor: string }> = {
  operational: {
    color: "#22c55e",
    bg: "rgba(34, 197, 94, 0.1)",
    borderColor: "rgba(34, 197, 94, 0.2)",
  },
  degraded_performance: {
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  partial_outage: {
    color: "#f97316",
    bg: "rgba(249, 115, 22, 0.1)",
    borderColor: "rgba(249, 115, 22, 0.2)",
  },
  major_outage: {
    color: "#ef4444",
    bg: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  maintenance: {
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.1)",
    borderColor: "rgba(59, 130, 246, 0.2)",
  },
  unknown: {
    color: "#9ca3af",
    bg: "rgba(156, 163, 175, 0.1)",
    borderColor: "rgba(156, 163, 175, 0.2)",
  },
};

// ==================== COMPUTED ====================

const pageStatus = computed(() => {
  if (!props.statusPage) return statusConfig.unknown;
  return statusConfig[props.statusPage.overallStatus] || statusConfig.unknown;
});

const statusInfo = computed(() => {
  if (!props.statusPage) return { label: "Unknown", icon: "carbon:help", color: "default" };
  return OVERALL_STATUS[props.statusPage.overallStatus];
});

const activeIncidentCount = computed(() => {
  return props.statusPage?.activeIncidents || 0;
});

const avgMonitorUptime = computed(() => {
  if (monitorUptimeData.value.length === 0) return 100;
  const sum = monitorUptimeData.value.reduce((acc, m) => acc + m.uptime, 0);
  return sum / monitorUptimeData.value.length;
});

// Aggregate Uptime Statistics per time window — same barsFromChecks as status page
const uptimeStatistics = computed(() => {
  if (monitorStatsMap.value.size === 0 && linkedMonitors.value.length === 0) return [];

  const windows = [
    { label: "24 Hours", key24: "uptime24h" as const, rangeMs: 24 * MS_HOUR },
    { label: "7 Days", key24: "uptime7d" as const, rangeMs: 7 * MS_DAY },
    { label: "30 Days", key24: "uptime30d" as const, rangeMs: 30 * MS_DAY },
    { label: "90 Days", key24: "uptime90d" as const, rangeMs: 90 * MS_DAY },
  ];

  return windows.map((w) => {
    const uptimes: number[] = [];
    for (const [, s] of monitorStatsMap.value) {
      const val = s[w.key24];
      if (val !== undefined) uptimes.push(val);
    }
    const avg = uptimes.length > 0
      ? uptimes.reduce((a, b) => a + b, 0) / uptimes.length
      : 100;
    // Use hourly aggregated stats from ClickHouse — covers full time range
    const bars = buildAggregatedBars(w.rangeMs, avg);
    return {
      label: w.label,
      value: avg,
      color: getUptimeColor(avg),
      bars,
    };
  });
});

// ==================== METHODS ====================

function getUptimeColor(pct: number): string {
  if (pct >= 99.9) return "#22c55e";
  if (pct >= 99) return "#84cc16";
  if (pct >= 95) return "#eab308";
  if (pct >= 90) return "#f97316";
  return "#ef4444";
}

import { formatDateTime } from '@/utils/format';

function formatTimestamp(ts: number): string {
  return formatDateTime(ts);
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return `${diffSec}s ago`;
}

function getIncidentTypeColor(type: string): "error" | "success" | "warning" | "info" {
  switch (type) {
    case "firing": return "error";
    case "resolved": return "success";
    default: return "info";
  }
}

async function fetchIncidents() {
  if (!props.statusPage) return;
  loading.value = true;
  try {
    // Fetch linked monitor data (incidents are derived from uptime daily stats, not PG)
    const monitorIds = props.statusPage.monitors.map(m => m.monitorId);
    const monitorResults = await Promise.all(
      monitorIds.map(id => uptimeApi.getMonitor(id).catch(() => null)),
    );
    linkedMonitors.value = monitorResults.filter((m): m is Monitor => m !== null);

    // Fetch real uptime stats + daily stats + check history + hourly stats for each linked monitor
    if (monitorIds.length > 0) {
      const hours = rangeToHours(Math.max(selectedBarRange.value, 90 * MS_DAY)); // fetch max range for stats
      const [statsResults, dailyResults, checksResults, hourlyResults] = await Promise.all([
        Promise.all(monitorIds.map(id => uptimeApi.getMonitorStats(id).catch(() => null))),
        Promise.all(monitorIds.map(id => uptimeApi.getDailyStats(id, 100).catch(() => null))),
        Promise.all(monitorIds.map(id => uptimeApi.getMonitorChecks(id, { limit: config.limitDataMax }).catch(() => null))),
        Promise.all(monitorIds.map(id => uptimeApi.getHourlyStats(id, hours).catch(() => null))),
      ]);
      const statsMap = new Map<string, UptimeStats>();
      const dailyMap = new Map<string, DailyUptimeStat[]>();
      const chkMap = new Map<string, UptimeCheck[]>();
      const hourlyMap = new Map<string, HourlyUptimeStat[]>();
      monitorIds.forEach((id, idx) => {
        if (statsResults[idx]) statsMap.set(id, statsResults[idx]!);
        if (dailyResults[idx]) dailyMap.set(id, dailyResults[idx]!);
        if (checksResults[idx]) chkMap.set(id, checksResults[idx]!);
        if (hourlyResults[idx]) hourlyMap.set(id, hourlyResults[idx]!);
      });
      monitorStatsMap.value = statsMap;
      dailyStatsMap.value = dailyMap;
      checksMap.value = chkMap;
      hourlyStatsMap.value = hourlyMap;
    }
  } catch (error) {
    console.error("Failed to fetch status page details:", error);
  } finally {
    loading.value = false;
  }
}

function openPublicPage() {
  if (!props.statusPage) return;
  const url = getStatusPageUrl(props.statusPage);
  window.open(url, "_blank");
}

async function fetchSubscribers() {
  if (!props.statusPage) return;
  subscriberLoading.value = true;
  try {
    const result = await statusPageApi.listSubscribers(props.statusPage.id);
    subscribers.value = result.data;
    subscriberCount.value = result.total;
  } catch (error) {
    console.error("Failed to fetch subscribers:", error);
  } finally {
    subscriberLoading.value = false;
  }
}

async function handleRemoveSubscriber(subscriberId: string) {
  if (!props.statusPage) return;
  try {
    await statusPageApi.removeSubscriber(props.statusPage.id, subscriberId);
    subscribers.value = subscribers.value.filter(s => s.id !== subscriberId);
    subscriberCount.value = Math.max(0, subscriberCount.value - 1);
  } catch (error) {
    console.error("Failed to remove subscriber:", error);
  }
}

// Add subscriber form
const showAddSubscriber = ref(false);
const addSubscriberLoading = ref(false);
const newSubscriberType = ref<SubscriptionType>("email");
const newSubscriberEmail = ref("");
const newSubscriberWebhookUrl = ref("");
const newSubscriberNotificationType = ref<NotificationType>("all");

const notificationTypeOptions = [
  { label: "All", value: "all" },
  { label: "Incidents Only", value: "incidents_only" },
  { label: "Maintenance Only", value: "maintenance_only" },
];

const subscriptionTypeOptions = [
  { label: "Email", value: "email" },
  { label: "Webhook", value: "webhook" },
];

function resetAddSubscriberForm() {
  showAddSubscriber.value = false;
  newSubscriberType.value = "email";
  newSubscriberEmail.value = "";
  newSubscriberWebhookUrl.value = "";
  newSubscriberNotificationType.value = "all";
}

async function handleAddSubscriber() {
  if (!props.statusPage) return;
  const isWebhook = newSubscriberType.value === "webhook";
  const address = isWebhook ? newSubscriberWebhookUrl.value.trim() : newSubscriberEmail.value.trim();
  if (!address) return;

  addSubscriberLoading.value = true;
  try {
    await statusPageApi.addSubscriber(props.statusPage.id, {
      email: isWebhook ? undefined : address,
      webhook_url: isWebhook ? address : undefined,
      subscription_type: newSubscriberType.value,
      notificationType: newSubscriberNotificationType.value,
    });
    resetAddSubscriberForm();
    await fetchSubscribers();
  } catch (error) {
    console.error("Failed to add subscriber:", error);
  } finally {
    addSubscriberLoading.value = false;
  }
}

// ==================== WATCH ====================

watch(() => props.statusPage, (newPage) => {
  if (newPage) {
    fetchIncidents();
    fetchSubscribers();
  } else {
    linkedMonitors.value = [];
    monitorStatsMap.value = new Map();
    dailyStatsMap.value = new Map();
    checksMap.value = new Map();
    hourlyStatsMap.value = new Map();
    subscribers.value = [];
    subscriberCount.value = 0;
    resetAddSubscriberForm();
    incidentPage.value = 1;
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
    <NDrawerContent v-if="statusPage">
      <template #header>
        <div class="drawer-header">
          <Icon
            icon="carbon:dashboard"
            class="drawer-header-icon"
          />
          <span>Status Page Details</span>
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
          :color="statusPage.overallStatus === 'operational' ? 'success' : statusPage.overallStatus.includes('outage') ? 'error' : 'warning'"
          :value-color="pageStatus.color"
          title="Status"
          :value="statusInfo.label"
        />
        <StatPanel
          size="small"
          icon="carbon:chart-line"
          color="success"
          value-color="#22c55e"
          title="Avg Uptime"
          :value="`${avgMonitorUptime.toFixed(1)}%`"
        />
        <StatPanel
          size="small"
          icon="carbon:warning-alt"
          :color="activeIncidentCount > 0 ? 'error' : 'success'"
          :value-color="activeIncidentCount > 0 ? '#ef4444' : '#22c55e'"
          title="Active Incidents"
          :value="String(activeIncidentCount)"
        />
        <StatPanel
          size="small"
          icon="carbon:application"
          color="primary"
          value-color="#3b82f6"
          title="Monitors"
          :value="String(statusPage.monitors.length)"
        />
      </div>

      <div class="detail-content">
        <!-- Status Banner -->
        <div
          class="status-banner"
          :style="{
            backgroundColor: pageStatus.bg,
            color: pageStatus.color,
            borderColor: pageStatus.borderColor,
          }"
        >
          <Icon :icon="statusInfo.icon" />
          <span><strong>{{ statusInfo.label.toUpperCase() }}</strong> - {{ statusPage.title }}</span>
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
                  Status Page ID
                </td>
                <td class="info-value">
                  <TagBadge
                    :label="statusPage.id"
                    :bold="true"
                  />
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Title
                </td>
                <td class="info-value">
                  <code>{{ statusPage.title }}</code>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Slug
                </td>
                <td class="info-value">
                  <code>/status/{{ statusPage.slug }}</code>
                </td>
              </tr>
              <tr v-if="statusPage.description">
                <td class="info-label">
                  Description
                </td>
                <td class="info-value">
                  {{ statusPage.description }}
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Visibility
                </td>
                <td class="info-value">
                  <NTag
                    :bordered="false"
                    size="small"
                    round
                    :style="{
                      backgroundColor: statusPage.isPublic ? 'rgba(34, 197, 94, 0.1)' : 'rgba(156, 163, 175, 0.1)',
                      color: statusPage.isPublic ? '#22c55e' : '#9ca3af',
                    }"
                  >
                    <template #icon>
                      <Icon :icon="statusPage.isPublic ? 'carbon:globe' : 'carbon:password'" />
                    </template>
                    {{ statusPage.isPublic ? 'Public' : 'Private' }}
                  </NTag>
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
                    round
                    :style="{
                      backgroundColor: pageStatus.bg,
                      color: pageStatus.color,
                    }"
                  >
                    <template #icon>
                      <Icon :icon="statusInfo.icon" />
                    </template>
                    {{ statusInfo.label }}
                  </NTag>
                </td>
              </tr>
              <tr v-if="statusPage.customDomain">
                <td class="info-label">
                  Custom Domain
                </td>
                <td class="info-value">
                  <div style="display: flex; align-items: center; gap: 8px">
                    <code>{{ statusPage.customDomain }}</code>
                    <NTag
                      :bordered="false"
                      size="tiny"
                      round
                      :style="{
                        backgroundColor: statusPage.customDomainVerified ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        color: statusPage.customDomainVerified ? '#22c55e' : '#f59e0b',
                      }"
                    >
                      <template #icon>
                        <Icon :icon="statusPage.customDomainVerified ? 'carbon:checkmark-filled' : 'carbon:warning'" />
                      </template>
                      {{ statusPage.customDomainVerified ? 'Verified' : 'Pending' }}
                    </NTag>
                  </div>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Created
                </td>
                <td class="info-value">
                  <code>{{ formatTimestamp(statusPage.createdAt) }}</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Linked Monitors -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:application" />
            <span>Linked Monitors ({{ statusPage.monitors.length }})</span>
            <NSelect
              v-model:value="selectedBarRange"
              :options="timeRangeOptions"
              size="tiny"
              class="range-select"
              :consistent-menu-width="false"
            />
          </div>
          <div class="monitors-list">
            <div
              v-if="monitorUptimeData.length === 0"
              class="empty-state"
            >
              <Icon
                icon="carbon:application"
                class="empty-icon"
              />
              <span>No monitors linked</span>
            </div>
            <div
              v-for="monitor in monitorUptimeData"
              :key="monitor.id"
              class="monitor-item"
            >
              <div class="monitor-header">
                <div class="monitor-name">
                  <span
                    class="status-dot"
                    :style="{ backgroundColor: monitor.status === 'up' ? '#22c55e' : monitor.status === 'degraded' ? '#f59e0b' : '#ef4444' }"
                  />
                  {{ monitor.name }}
                  <!-- SSL expiry badge -->
                  <NTooltip
                    v-if="monitor.hasSsl"
                    trigger="hover"
                    placement="top"
                  >
                    <template #trigger>
                      <NTag
                        :type="monitor.sslValid === false ? 'error' : monitor.sslDays === undefined ? 'default' : monitor.sslDays > 30 ? 'success' : monitor.sslDays > 14 ? 'warning' : 'error'"
                        size="tiny"
                        round
                        :bordered="false"
                        style="margin-left: 4px; cursor: default"
                      >
                        <template #icon>
                          <Icon :icon="monitor.sslValid === false ? 'carbon:certificate' : monitor.sslDays !== undefined && monitor.sslDays <= 14 ? 'carbon:warning-filled' : 'carbon:security'" />
                        </template>
                        {{ monitor.sslValid === false ? 'SSL Invalid' : monitor.sslDays !== undefined ? `${monitor.sslDays}d` : 'SSL' }}
                      </NTag>
                    </template>
                    <div style="line-height: 1.6">
                      <div style="font-weight: 600">
                        SSL Certificate
                      </div>
                      <div
                        v-if="monitor.sslValid === false"
                        style="color: #ef4444"
                      >
                        Certificate is invalid
                      </div>
                      <div v-else-if="monitor.sslDays !== undefined">
                        Expires in <strong>{{ monitor.sslDays }} days</strong>
                      </div>
                      <div v-else>
                        Valid
                      </div>
                    </div>
                  </NTooltip>
                </div>
                <div class="monitor-stats">
                  <span
                    class="uptime-value"
                    :style="{ color: getUptimeColor(monitor.uptime) }"
                  >
                    {{ monitor.uptime.toFixed(2) }}%
                  </span>
                  <span class="response-time">{{ monitor.responseTime }}ms</span>
                </div>
              </div>
              <!-- Vertical Status Bars (3-days time-bucket from real check data) -->
              <div class="vertical-bars-container">
                <NTooltip
                  v-for="(bar, i) in monitor.bars"
                  :key="i"
                  trigger="hover"
                  placement="top"
                >
                  <template #trigger>
                    <div
                      class="vertical-bar"
                      :style="{ backgroundColor: bar.color }"
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
              <div class="bars-range-label">
                <span>Older</span>
                <span>Recent</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Uptime Statistics (aggregate across all monitors) -->
        <div
          v-if="uptimeStatistics.length > 0"
          class="detail-section"
        >
          <div class="section-label">
            <Icon icon="carbon:chart-line" />
            <span>Uptime Statistics</span>
          </div>
          <div class="uptime-stats-list">
            <div
              v-for="stat in uptimeStatistics"
              :key="stat.label"
              class="uptime-stat-row"
            >
              <div class="uptime-stat-header">
                <span class="uptime-stat-label">{{ stat.label }}</span>
                <span
                  class="uptime-stat-value"
                  :style="{ color: stat.color }"
                >
                  {{ stat.value.toFixed(2) }}%
                </span>
              </div>
              <div class="vertical-bars-container">
                <NTooltip
                  v-for="(bar, i) in stat.bars"
                  :key="i"
                  trigger="hover"
                  placement="top"
                >
                  <template #trigger>
                    <div
                      class="vertical-bar"
                      :style="{ backgroundColor: bar.color }"
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
              <div class="bars-range-label">
                <span>Older</span>
                <span>Recent</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Display Settings -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:settings" />
            <span>Display Settings</span>
          </div>
          <table class="info-table">
            <tbody>
              <tr>
                <td class="info-label">
                  Show Uptime %
                </td>
                <td class="info-value">
                  <NTag
                    :type="statusPage.display.showUptimePercentage ? 'success' : 'default'"
                    size="small"
                    :bordered="false"
                    round
                  >
                    <template #icon>
                      <Icon :icon="statusPage.display.showUptimePercentage ? 'carbon:checkmark' : 'carbon:close'" />
                    </template>
                    {{ statusPage.display.showUptimePercentage ? 'Shown' : 'Hidden' }}
                  </NTag>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Show Response Time
                </td>
                <td class="info-value">
                  <NTag
                    :type="statusPage.display.showResponseTime ? 'success' : 'default'"
                    size="small"
                    :bordered="false"
                    round
                  >
                    <template #icon>
                      <Icon :icon="statusPage.display.showResponseTime ? 'carbon:checkmark' : 'carbon:close'" />
                    </template>
                    {{ statusPage.display.showResponseTime ? 'Shown' : 'Hidden' }}
                  </NTag>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Show Incident History
                </td>
                <td class="info-value">
                  <NTag
                    :type="statusPage.display.showIncidentHistory ? 'success' : 'default'"
                    size="small"
                    :bordered="false"
                    round
                  >
                    <template #icon>
                      <Icon :icon="statusPage.display.showIncidentHistory ? 'carbon:checkmark' : 'carbon:close'" />
                    </template>
                    {{ statusPage.display.showIncidentHistory ? 'Shown' : 'Hidden' }}
                  </NTag>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Maintenance Schedule
                </td>
                <td class="info-value">
                  <NTag
                    :type="statusPage.display.showMaintenanceSchedule ? 'success' : 'default'"
                    size="small"
                    :bordered="false"
                    round
                  >
                    <template #icon>
                      <Icon :icon="statusPage.display.showMaintenanceSchedule ? 'carbon:checkmark' : 'carbon:close'" />
                    </template>
                    {{ statusPage.display.showMaintenanceSchedule ? 'Shown' : 'Hidden' }}
                  </NTag>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Allow Subscriptions
                </td>
                <td class="info-value">
                  <NTag
                    :type="statusPage.display.allowSubscriptions ? 'success' : 'default'"
                    size="small"
                    :bordered="false"
                    round
                  >
                    <template #icon>
                      <Icon :icon="statusPage.display.allowSubscriptions ? 'carbon:checkmark' : 'carbon:close'" />
                    </template>
                    {{ statusPage.display.allowSubscriptions ? 'Enabled' : 'Disabled' }}
                  </NTag>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Show Legend
                </td>
                <td class="info-value">
                  <NTag
                    :type="statusPage.display.showLegend ? 'success' : 'default'"
                    size="small"
                    :bordered="false"
                    round
                  >
                    <template #icon>
                      <Icon :icon="statusPage.display.showLegend ? 'carbon:checkmark' : 'carbon:close'" />
                    </template>
                    {{ statusPage.display.showLegend ? 'Shown' : 'Hidden' }}
                  </NTag>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  Uptime Ranges
                </td>
                <td class="info-value">
                  <div style="display: flex; gap: 4px; flex-wrap: wrap">
                    <NTag
                      v-for="range in statusPage.display.uptimeRanges"
                      :key="range"
                      size="tiny"
                      :bordered="false"
                      style="background: rgba(59,130,246,0.1); color: #3b82f6"
                    >
                      {{ range === 1 ? '24h' : range === 7 ? '7d' : range === 30 ? '30d' : range === 90 ? '90d' : `${range}d` }}
                    </NTag>
                  </div>
                </td>
              </tr>
              <tr>
                <td class="info-label">
                  History Days
                </td>
                <td class="info-value">
                  <code>{{ statusPage.display.historyDays }} days</code>
                </td>
              </tr>
              <tr v-if="statusPage.display.theme">
                <td class="info-label">
                  Theme
                </td>
                <td class="info-value">
                  <NTag
                    size="small"
                    :bordered="false"
                  >
                    {{ statusPage.display.theme }}
                  </NTag>
                </td>
              </tr>
              <tr v-if="statusPage.display.googleAnalyticsId">
                <td class="info-label">
                  GA Tracking
                </td>
                <td class="info-value">
                  <code style="font-size: 11px">{{ statusPage.display.googleAnalyticsId }}</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Branding -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:color-palette" />
            <span>Branding</span>
          </div>
          <table class="info-table">
            <tbody>
              <tr>
                <td class="info-label">
                  Brand Color
                </td>
                <td class="info-value">
                  <div style="display: flex; align-items: center; gap: 8px">
                    <span
                      class="color-swatch"
                      :style="{ backgroundColor: statusPage.branding.brandColor }"
                    />
                    <code>{{ statusPage.branding.brandColor }}</code>
                  </div>
                </td>
              </tr>
              <tr v-if="statusPage.branding.headerText">
                <td class="info-label">
                  Header Text
                </td>
                <td class="info-value">
                  {{ statusPage.branding.headerText }}
                </td>
              </tr>
              <tr v-if="statusPage.branding.footerText">
                <td class="info-label">
                  Footer Text
                </td>
                <td class="info-value">
                  {{ statusPage.branding.footerText }}
                </td>
              </tr>
            </tbody>
          </table>
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
              @click="openPublicPage"
            >
              <template #icon>
                <Icon icon="carbon:launch" />
              </template>
              View Page
            </NButton>
            <NButton
              type="info"
              size="small"
              @click="emit('edit', statusPage)"
            >
              <template #icon>
                <Icon icon="carbon:edit" />
              </template>
              Edit
            </NButton>
            <NButton
              type="warning"
              size="small"
              @click="emit('manage-incidents', statusPage)"
            >
              <template #icon>
                <Icon icon="carbon:warning-alt" />
              </template>
              Incidents
            </NButton>
            <NPopconfirm @positive-click="emit('delete', statusPage)">
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
              Are you sure you want to delete this status page?
            </NPopconfirm>
          </div>
        </div>

        <!-- Subscribers -->
        <div
          v-if="statusPage.display.allowSubscriptions"
          class="detail-section"
        >
          <div class="section-label">
            <Icon icon="carbon:user-multiple" />
            <span>Subscribers ({{ subscriberCount }})</span>
            <NButton
              size="tiny"
              :type="showAddSubscriber ? 'default' : 'primary'"
              secondary
              style="margin-left: auto; text-transform: none; letter-spacing: normal"
              @click="showAddSubscriber = !showAddSubscriber"
            >
              <template #icon>
                <Icon :icon="showAddSubscriber ? 'carbon:close' : 'carbon:add'" />
              </template>
              {{ showAddSubscriber ? 'Cancel' : 'Add' }}
            </NButton>
          </div>

          <!-- Add Subscriber Form -->
          <div
            v-if="showAddSubscriber"
            class="add-subscriber-form"
          >
            <div class="add-subscriber-row">
              <NSelect
                v-model:value="newSubscriberType"
                :options="subscriptionTypeOptions"
                size="small"
                style="width: 120px"
              />
              <NInput
                v-if="newSubscriberType === 'email'"
                v-model:value="newSubscriberEmail"
                size="small"
                placeholder="email@example.com"
                style="flex: 1"
              />
              <NInput
                v-else
                v-model:value="newSubscriberWebhookUrl"
                size="small"
                placeholder="https://hooks.example.com/..."
                style="flex: 1"
              />
            </div>
            <div class="add-subscriber-row">
              <NSelect
                v-model:value="newSubscriberNotificationType"
                :options="notificationTypeOptions"
                size="small"
                style="flex: 1"
                placeholder="Notification type"
              />
              <NButton
                type="primary"
                size="small"
                :loading="addSubscriberLoading"
                :disabled="newSubscriberType === 'email' ? !newSubscriberEmail.trim() : !newSubscriberWebhookUrl.trim()"
                @click="handleAddSubscriber"
              >
                <template #icon>
                  <Icon icon="carbon:add" />
                </template>
                Add
              </NButton>
            </div>
          </div>

          <div class="subscribers-container">
            <div
              v-if="subscriberLoading"
              class="subscribers-loading"
            >
              <Icon
                icon="carbon:renew"
                class="spin-icon"
              />
              <span>Loading subscribers...</span>
            </div>
            <div
              v-else-if="subscribers.length === 0"
              class="subscribers-empty"
            >
              <Icon
                icon="carbon:user-multiple"
                class="empty-icon"
              />
              <span>No subscribers yet</span>
            </div>
            <div
              v-else
              class="subscribers-list"
            >
              <div
                v-for="sub in subscribers"
                :key="sub.id"
                class="subscriber-item"
              >
                <div class="subscriber-info">
                  <div class="subscriber-icon">
                    <Icon :icon="sub.subscriptionType === 'webhook' ? 'carbon:webhook' : 'carbon:email'" />
                  </div>
                  <div class="subscriber-details">
                    <div class="subscriber-address">
                      <code>{{ sub.subscriptionType === 'webhook' ? sub.webhookUrl : sub.email }}</code>
                    </div>
                    <div class="subscriber-meta">
                      <NTag
                        :type="sub.isConfirmed ? 'success' : 'warning'"
                        size="tiny"
                        :bordered="false"
                      >
                        {{ sub.isConfirmed ? 'Confirmed' : 'Pending' }}
                      </NTag>
                      <NTag
                        size="tiny"
                        :bordered="false"
                      >
                        {{ sub.subscriptionType === 'webhook' ? 'Webhook' : 'Email' }}
                      </NTag>
                      <span class="subscriber-date">{{ formatTimestamp(sub.createdAt) }}</span>
                    </div>
                  </div>
                </div>
                <NPopconfirm @positive-click="handleRemoveSubscriber(sub.id)">
                  <template #trigger>
                    <NButton
                      size="tiny"
                      type="error"
                      quaternary
                    >
                      <template #icon>
                        <Icon icon="carbon:trash-can" />
                      </template>
                    </NButton>
                  </template>
                  Remove this subscriber?
                </NPopconfirm>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent Incidents -->
        <div class="detail-section">
          <div class="section-label">
            <Icon icon="carbon:warning-alt" />
            <span>Past Incidents ({{ incidentTimeline.length }})</span>
          </div>
          <div class="incidents-container">
            <NTimeline v-if="paginatedIncidentTimeline.length > 0">
              <NTimelineItem
                v-for="incident in paginatedIncidentTimeline"
                :key="incident.id"
                :type="getIncidentTypeColor(incident.type)"
                :title="incident.title"
              >
                <template #icon>
                  <div
                    class="incident-timeline-icon"
                    :class="[`incident-icon-${incident.type}`]"
                  >
                    <Icon :icon="incident.type === 'firing' ? 'carbon:warning-filled' : 'carbon:checkmark-filled'" />
                  </div>
                </template>
                <div class="incident-content">
                  <div class="incident-badges">
                    <NTag
                      :type="getIncidentTypeColor(incident.type)"
                      size="small"
                      :bordered="false"
                    >
                      {{ incident.type.toUpperCase() }}
                    </NTag>
                    <NTag
                      size="small"
                      :bordered="false"
                      :type="INCIDENT_IMPACT[incident.impact]?.color as any"
                    >
                      {{ INCIDENT_IMPACT[incident.impact]?.label }}
                    </NTag>
                  </div>
                  <div class="incident-message-box">
                    <code>{{ incident.message }}</code>
                  </div>
                  <table class="incident-details-table">
                    <tbody>
                      <tr>
                        <td class="incident-detail-label">
                          Started
                        </td>
                        <td class="incident-detail-value">
                          {{ formatRelativeTime(incident.triggeredAt) }}
                        </td>
                      </tr>
                      <tr v-if="incident.resolvedAt">
                        <td class="incident-detail-label">
                          Resolved
                        </td>
                        <td class="incident-detail-value">
                          {{ formatRelativeTime(incident.resolvedAt) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </NTimelineItem>
            </NTimeline>
            <div
              v-else
              class="incidents-empty"
            >
              <Icon
                icon="carbon:checkmark-outline"
                class="incidents-empty-icon"
              />
              <span>No incidents reported</span>
            </div>
            <!-- Pagination -->
            <div
              v-if="incidentTotalPages > 1"
              class="incidents-pagination"
            >
              <button
                class="pagination-btn"
                :disabled="incidentPage <= 1"
                @click="incidentPage--"
              >
                <Icon icon="carbon:chevron-left" />
              </button>
              <span class="pagination-info">{{ incidentPage }} / {{ incidentTotalPages }}</span>
              <button
                class="pagination-btn"
                :disabled="incidentPage >= incidentTotalPages"
                @click="incidentPage++"
              >
                <Icon icon="carbon:chevron-right" />
              </button>
            </div>
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

// Info Table
.info-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  overflow: hidden;

  tr:not(:last-child) td {
    border-bottom: 1px solid var(--k8s-border-color);
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
      font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
      font-size: 0.8125rem;
      background: transparent;
      padding: 0;
      border: none;
    }
  }
}

// Monitors List
.monitors-list {
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  overflow: hidden;
}

.monitor-item {
  padding: 12px;
  border-bottom: 1px solid var(--k8s-border-color);

  &:last-child {
    border-bottom: none;
  }
}

.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.monitor-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 0.875rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.monitor-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.75rem;
}

.uptime-value {
  font-weight: 600;
}

.response-time {
  color: var(--n-text-color-3);
}

// Vertical Status Bars (like Uptime Statistics)
.vertical-bars-container {
  display: flex;
  gap: 2px;
  align-items: center;
  height: 24px;
  width: 100%;
}

.vertical-bar {
  flex: 1;
  height: 100%;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    opacity: 0.75;
    transform: scaleY(1.15);
  }
}

.bars-range-label {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 0.625rem;
  color: var(--n-text-color-3);
  letter-spacing: 0.03em;
}

// Bar Tooltip
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

// Uptime Statistics
.uptime-stats-list {
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  overflow: hidden;
}

.uptime-stat-row {
  padding: 12px;
  border-bottom: 1px solid var(--k8s-border-color);

  &:last-child {
    border-bottom: none;
  }
}

.uptime-stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.uptime-stat-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--n-text-color-2);
}

.uptime-stat-value {
  font-size: 0.875rem;
  font-weight: 700;
  font-family: 'SF Mono', Monaco, monospace;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--n-text-color-3);
}

.empty-icon {
  font-size: 32px;
}

.color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
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

// Add Subscriber Form
.add-subscriber-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  margin-bottom: 8px;
  background: rgba(59, 130, 246, 0.04);

  :root.dark & {
    background: rgba(59, 130, 246, 0.06);
  }
}

.add-subscriber-row {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 28px;
}

// Subscribers
.subscribers-container {
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  overflow: hidden;
}

.subscribers-loading,
.subscribers-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--n-text-color-3);
  font-size: 0.875rem;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.subscribers-list {
  max-height: 250px;
  overflow-y: auto;
}

.subscriber-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--k8s-border-color);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: rgba(100, 116, 139, 0.05);

    :root.dark & {
      background: rgba(51, 65, 85, 0.3);
    }
  }
}

.subscriber-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.subscriber-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;

  :root.dark & {
    background: rgba(59, 130, 246, 0.15);
  }
}

.subscriber-details {
  flex: 1;
  min-width: 0;
}

.subscriber-address {
  margin-bottom: 4px;

  code {
    font-family: "SF Mono", Monaco, monospace;
    font-size: 0.75rem;
    word-break: break-all;
    background: transparent;
    padding: 0;
    border: none;
  }
}

.subscriber-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.subscriber-date {
  font-size: 0.6875rem;
  color: var(--n-text-color-3);
}

// Incidents Timeline
.incidents-container {
  padding: 16px 20px;
  background: #f8fafc;
  border: 1px solid var(--k8s-border-color);
  border-radius: 8px;
  max-height: 350px;
  overflow-y: auto;

  :root.dark & {
    background: #0f172a;
  }

  :deep(.n-timeline) {
    .n-timeline-item {
      padding-bottom: 20px;

      &:last-child {
        padding-bottom: 0;
      }
    }

    .n-timeline-item-timeline__line {
      background-color: var(--k8s-border-color) !important;
      top: 24px !important;
    }

    .n-timeline-item-content {
      padding-left: 12px !important;
    }

    .n-timeline-item-content__title {
      font-weight: 600;
      font-size: 0.9375rem;
      margin-bottom: 8px;
    }
  }
}

.incident-timeline-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
  flex-shrink: 0;
  position: relative;
  z-index: 1;

  &.incident-icon-firing {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
  }

  &.incident-icon-resolved {
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    box-shadow: 0 2px 8px rgba(34, 197, 94, 0.4);
  }
}

.incident-content {
  margin-top: 0;
}

.incident-badges {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.incident-message-box {
  background: #f1f5f9;
  border: 1px solid var(--k8s-border-color);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;

  :root.dark & {
    background: #1e293b;
  }

  code {
    font-family: 'SF Mono', Monaco, monospace;
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

.incident-details-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: #ffffff;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--k8s-border-color);

  :root.dark & {
    background: #0f172a;
  }

  tr:not(:last-child) td {
    border-bottom: 1px solid var(--k8s-border-color);
  }

  td {
    padding: 8px 12px;
    font-size: 0.8125rem;
  }

  .incident-detail-label {
    width: 100px;
    color: #6b7280;
    font-weight: 600;
    font-size: 0.75rem;
    background: #f3f4f6;
    border-right: 1px solid var(--k8s-border-color);

    :root.dark & {
      color: #94a3b8;
      background: #1e293b;
    }
  }

  .incident-detail-value {
    color: #1f2937;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 0.75rem;

    :root.dark & {
      color: #e2e8f0;
    }
  }
}

.incidents-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--n-text-color-3);
  font-size: 0.875rem;
}

.incidents-empty-icon {
  font-size: 20px;
  color: #22c55e;
}

.incidents-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--k8s-border-color);
}

.pagination-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--k8s-border-color);
  background: transparent;
  color: var(--n-text-color-2);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    border-color: var(--n-primary-color);
    color: var(--n-primary-color);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.pagination-info {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--n-text-color-3);
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

// Range Select Dropdown
.range-select {
  margin-left: auto;
  width: 130px;
  flex-shrink: 0;
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
}
</style>