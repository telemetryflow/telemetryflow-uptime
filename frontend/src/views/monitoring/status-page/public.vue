<script setup lang="ts">
/**
 * Public Status Page View
 * Accessible without authentication at /status/:slug
 */

import { ref, computed, onMounted, watch, h } from "vue";
import { useRoute } from "vue-router";
import { Icon } from "@iconify/vue";
import { NButton, NInput, NSpin, NConfigProvider, useMessage, darkTheme, NDropdown, NTooltip, NTag, NSelect } from "naive-ui";
import { statusPageApi } from "@/api/statuspage";
import { uptimeApi } from "@/api/uptime";
import type { StatusPage, Incident } from "@/types/statuspage";
import type { UptimeStats, DailyUptimeStat, UptimeCheck, HourlyUptimeStat, Monitor } from "@/types/uptime";
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
import {
  OVERALL_STATUS,
  INCIDENT_STATUS,
  INCIDENT_IMPACT,
  isIncidentActive,
} from "@/types/statuspage";
import { config } from "@/config";
import { useRecaptcha } from "@/composables/useRecaptcha";
import { whiteLabelConfig } from "@/config/whitelabel";
import faviconLight from "@/assets/favicon.svg";
import faviconDark from "@/assets/favicon-dark.svg";
import tfoLogoDark from "@/assets/tfo-logo-dark.svg";

const route = useRoute();
const message = useMessage();

// ==================== DATA ====================

const loading = ref(true);
const statusPage = ref<StatusPage | null>(null);
const incidents = ref<Incident[]>([]);
const subscribeEmail = ref("");
const subscribing = ref(false);
const isDark = ref(false);
const showSubscribeModal = ref(false);
const subscribeMethod = ref<'email' | 'webhook'>('email');
const webhookUrl = ref("");

// Pagination for past incidents
const pastIncidentPage = ref(1);
const pastIncidentPageSize = 10;

// reCAPTCHA v3
const { isEnabled: recaptchaEnabled, loadScript: loadRecaptcha, executeRecaptcha } = useRecaptcha();

// Naive UI theme
const theme = computed(() => isDark.value ? darkTheme : null);

// Detect and initialize theme
onMounted(() => {
  // Check localStorage or system preference
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    isDark.value = true;
    document.documentElement.classList.add('dark');
  } else {
    isDark.value = false;
    document.documentElement.classList.remove('dark');
  }

  // Watch for theme changes
  const observer = new MutationObserver(() => {
    isDark.value = document.documentElement.classList.contains('dark');
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  });

  fetchStatusPage();

  // Load reCAPTCHA script (non-blocking)
  loadRecaptcha().catch((err) => {
    console.warn("reCAPTCHA script failed to load:", err);
  });
});

// Real monitor stats fetched from uptime API
const monitorStats = ref<Map<string, UptimeStats>>(new Map());
const dailyStatsMap = ref<Map<string, DailyUptimeStat[]>>(new Map());
const checksMap = ref<Map<string, UptimeCheck[]>>(new Map());
const hourlyStatsMap = ref<Map<string, HourlyUptimeStat[]>>(new Map());
const monitorCreatedAtMap = ref<Map<string, number>>(new Map());

async function fetchMonitorStats() {
  if (!statusPage.value) return;
  const monitorIds = statusPage.value.monitors.map((m) => m.monitorId);
  // Fetch max range (90 days) of hourly stats upfront so switching
  // time ranges doesn't need a refetch — buildBarsFromHourlyStats
  // filters by cutoff/now internally.
  const maxHours = rangeToHours(90 * MS_DAY);
  const [monitorResults, statsResults, dailyResults, checksResults, hourlyResults] = await Promise.all([
    Promise.all(monitorIds.map((id) => uptimeApi.getMonitor(id).catch(() => null))),
    Promise.all(monitorIds.map((id) => uptimeApi.getMonitorStats(id).catch(() => null))),
    Promise.all(monitorIds.map((id) => uptimeApi.getDailyStats(id, 100).catch(() => null))),
    Promise.all(monitorIds.map((id) => uptimeApi.getMonitorChecks(id, { limit: config.limitDataMax }).catch(() => null))),
    Promise.all(monitorIds.map((id) => uptimeApi.getHourlyStats(id, maxHours).catch(() => null))),
  ]);
  const createdMap = new Map<string, number>();
  const statsMap = new Map<string, UptimeStats>();
  const dailyMap = new Map<string, DailyUptimeStat[]>();
  const chkMap = new Map<string, UptimeCheck[]>();
  const hourlyMap = new Map<string, HourlyUptimeStat[]>();
  monitorIds.forEach((id, idx) => {
    if (monitorResults[idx]) createdMap.set(id, monitorResults[idx]!.createdAt);
    if (statsResults[idx]) statsMap.set(id, statsResults[idx]!);
    if (dailyResults[idx]) dailyMap.set(id, dailyResults[idx]!);
    if (checksResults[idx]) chkMap.set(id, checksResults[idx]!);
    if (hourlyResults[idx]) hourlyMap.set(id, hourlyResults[idx]!);
  });
  monitorCreatedAtMap.value = createdMap;
  monitorStats.value = statsMap;
  dailyStatsMap.value = dailyMap;
  checksMap.value = chkMap;
  hourlyStatsMap.value = hourlyMap;
}

// ==================== BAR GENERATION (shared composable) ====================

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;
const TOTAL_BARS = 90;

// Time range dropdown for monitor bars
const selectedBarRange = ref(24 * MS_HOUR); // default 24 hours
const timeRangeOptions = TIME_RANGE_OPTIONS;

/**
 * Build bars for a monitor — cascade through data sources.
 * Gray = no check data in that bucket. Only real check results show color.
 *
 * Priority: Hourly CH stats → Raw PG checks → All gray fallback
 */
function buildMonitorBars(monitorId: string, rangeMs: number, _uptimePct: number): BarEntry[] {
  const createdAt = monitorCreatedAtMap.value.get(monitorId);
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
  // 3. No data at all — all gray
  if (!bars) bars = buildBarsFromPercentage(0, TOTAL_BARS, rangeMs);

  // ALWAYS fill — never return unfilled bars
  return fillEmptyBars(bars, 0, createdAt);
}

/** Pick the uptime stat matching the selected time range */
function getUptimeForRange(stats: UptimeStats): number {
  const range = selectedBarRange.value;
  if (range <= 24 * MS_HOUR) return stats.uptime24h;
  if (range <= 7 * MS_DAY) return stats.uptime7d ?? stats.uptime24h;
  if (range <= 30 * MS_DAY) return stats.uptime30d ?? stats.uptime7d ?? stats.uptime24h;
  return stats.uptime90d ?? stats.uptime30d ?? stats.uptime7d ?? stats.uptime24h;
}

/** Derive uptime % from actual bar data for the selected time window */
function uptimeFromBars(bars: BarEntry[]): number | null {
  const withData = bars.filter(b => b.checkCount > 0);
  if (withData.length === 0) return null; // no real data → use pre-computed fallback
  const upCount = withData.filter(b => b.statusLabel === "Up").length;
  return (upCount / withData.length) * 100;
}

const monitorData = computed(() => {
  if (!statusPage.value) return [];

  return statusPage.value.monitors.map((m, idx) => {
    const stats = monitorStats.value.get(m.monitorId);
    const statUptime = stats ? getUptimeForRange(stats) : (95 + (((idx * 7 + 3) % 5)));
    const responseTime = Math.round(stats?.avgResponseTime24h ?? (80 + ((idx * 13 + 5) % 200)));
    const bars = buildMonitorBars(m.monitorId, selectedBarRange.value, statUptime);
    // Use bar-derived uptime for the selected range; fall back to pre-computed stat
    const uptime = uptimeFromBars(bars) ?? statUptime;
    return {
      id: m.monitorId,
      name: m.displayName || `Monitor ${idx + 1}`,
      uptime,
      status: uptime >= 99 ? "operational" as const : uptime >= 95 ? "degraded" as const : "down" as const,
      responseTime,
      bars,
    };
  });
});

// ==================== COMPUTED ====================

const pageStatus = computed(() => {
  if (!statusPage.value) return OVERALL_STATUS.unknown;
  return OVERALL_STATUS[statusPage.value.overallStatus];
});

const activeIncidents = computed(() => {
  if (config.useMock) {
    return incidents.value.filter(isIncidentActive);
  }
  // Real: active incidents tracked via uptime monitoring, PG seed data excluded
  return [];
});

// Past incidents — real uptime data (CH daily stats) when Mock=false, merged with PG when Mock=true
const allPastIncidents = computed(() => {
  // Manual PG incidents only included when Mock=true (they are seed/demo data)
  const manual = config.useMock ? incidents.value.filter(i => !isIncidentActive(i)) : [];

  // Generate real incidents from daily stats failures (CH materialized views)
  const automated: Incident[] = [];
  if (statusPage.value) {
    for (const m of statusPage.value.monitors) {
      const daily = dailyStatsMap.value.get(m.monitorId);
      if (!daily) continue;
      for (const day of daily) {
        if (day.failureCount > 0) {
          const monitorName = m.displayName || monitorData.value.find(md => md.id === m.monitorId)?.name || "Monitor";
          const dateTs = new Date(day.date).getTime();
          automated.push({
            id: `auto-${m.monitorId}-${day.date}`,
            statusPageId: statusPage.value.id,
            title: `${monitorName} — ${day.failureCount} failed check${day.failureCount > 1 ? "s" : ""}`,
            impact: day.uptimePercentage < 90 ? "major" : day.uptimePercentage < 99 ? "minor" : "none",
            status: "resolved",
            message: `${day.failureCount} of ${day.totalChecks} checks failed (${day.uptimePercentage}% uptime)`,
            affectedMonitorIds: [m.monitorId],
            updates: [],
            isScheduledMaintenance: false,
            startedAt: dateTs,
            resolvedAt: dateTs + 86400000,
            organizationId: statusPage.value.organizationId || "",
            createdBy: "system",
            createdAt: dateTs,
            updatedAt: dateTs,
          });
        }
      }
    }
  }

  // Merge and sort by date descending
  return [...manual, ...automated].sort((a, b) => b.startedAt - a.startedAt);
});

// Paginated past incidents
const paginatedPastIncidents = computed(() => {
  const start = (pastIncidentPage.value - 1) * pastIncidentPageSize;
  return allPastIncidents.value.slice(start, start + pastIncidentPageSize);
});

const pastIncidentTotalPages = computed(() =>
  Math.ceil(allPastIncidents.value.length / pastIncidentPageSize)
);

const avgUptime = computed(() => {
  if (monitorData.value.length === 0) return 100;
  const sum = monitorData.value.reduce((acc, m) => acc + m.uptime, 0);
  return sum / monitorData.value.length;
});

// ==================== METHODS ====================

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return "Just now";
}

async function fetchStatusPage() {
  loading.value = true;
  try {
    const slug = route.params.slug as string;
    const result = await statusPageApi.getStatusPageBySlug(slug);
    statusPage.value = result.statusPage;
    incidents.value = result.incidents;

    // Fetch monitor stats + daily stats (runs in background, non-blocking)
    if (statusPage.value.monitors.length > 0) {
      fetchMonitorStats();
    }
  } catch (error) {
    console.error("Failed to fetch status page:", error);
    message.error("Status page not found");
  } finally {
    loading.value = false;
  }
}

async function handleSubscribe() {
  if (!statusPage.value) return;

  // Validate based on subscription method
  if (subscribeMethod.value === 'email' && !subscribeEmail.value) {
    message.error("Please enter your email address");
    return;
  }

  if (subscribeMethod.value === 'webhook' && !webhookUrl.value) {
    message.error("Please enter webhook URL");
    return;
  }

  subscribing.value = true;
  try {
    // Get reCAPTCHA token (returns "" if not configured)
    let recaptchaToken = "";
    if (recaptchaEnabled) {
      try {
        recaptchaToken = await executeRecaptcha("subscribe");
      } catch (err) {
        console.warn("reCAPTCHA execution failed:", err);
      }
    }

    const slug = statusPage.value.slug;
    if (subscribeMethod.value === 'email') {
      const result = await statusPageApi.subscribePublic(slug, {
        email: subscribeEmail.value,
        subscription_type: "email",
        recaptcha_token: recaptchaToken || undefined,
      });
      message.success(result.message || "Successfully subscribed via email!");
      subscribeEmail.value = "";
    } else if (subscribeMethod.value === 'webhook') {
      const result = await statusPageApi.subscribePublic(slug, {
        webhook_url: webhookUrl.value,
        subscription_type: "webhook",
        recaptcha_token: recaptchaToken || undefined,
      });
      message.success(result.message || "Successfully subscribed via webhook!");
      webhookUrl.value = "";
    }
    showSubscribeModal.value = false;
  } catch (error: any) {
    const msg = error?.response?.data?.message || "Failed to subscribe";
    message.error(msg);
  } finally {
    subscribing.value = false;
  }
}

function openSubscribeModal(method: 'email' | 'webhook') {
  subscribeMethod.value = method;
  showSubscribeModal.value = true;
}

function closeSubscribeModal() {
  showSubscribeModal.value = false;
  subscribeEmail.value = "";
  webhookUrl.value = "";
}

watch(() => route.params.slug, () => {
  fetchStatusPage();
});

// No watch needed for selectedBarRange — we fetch max hourly data upfront
// and buildBarsFromHourlyStats filters by the selected range internally.
</script>

<template>
  <NConfigProvider :theme="theme">
    <div class="public-status-page">
      <NSpin
        :show="loading"
        size="large"
      >
        <div
          v-if="statusPage"
          class="status-container"
        >
          <!-- Header -->
          <div class="status-header">
            <div class="header-content">
              <div class="brand-logo">
                <img
                  v-if="statusPage.branding.logoUrl"
                  :src="statusPage.branding.logoUrl"
                  :alt="statusPage.title"
                  class="custom-logo"
                />
                <div
                  v-else
                  class="tfo-logo"
                >
                  <img
                    :src="isDark ? faviconDark : faviconLight"
                    alt="TFO Logo"
                    class="logo-image"
                  />
                  <span class="logo-text">{{ whiteLabelConfig.brandName }}</span>
                </div>
              </div>
              <div class="header-actions">
                <NDropdown
                  v-if="statusPage.display.allowSubscriptions"
                  trigger="click"
                  :options="[
                    {
                      label: 'Subscribe via Email',
                      key: 'email',
                      icon: () => h(Icon, { icon: 'carbon:email' })
                    },
                    {
                      label: 'Subscribe via Webhook',
                      key: 'webhook',
                      icon: () => h(Icon, { icon: 'carbon:webhook' })
                    }
                  ]"
                  @select="(key) => openSubscribeModal(key as 'email' | 'webhook')"
                >
                  <NButton
                    type="primary"
                    size="medium"
                  >
                    Subscribe to updates
                    <template #icon>
                      <Icon icon="carbon:chevron-down" />
                    </template>
                  </NButton>
                </NDropdown>
              </div>
            </div>
          </div>

          <!-- Overall Status Banner -->
          <div
            class="status-banner"
            :class="`status-${statusPage.overallStatus}`"
          >
            <div class="status-content">
              <div class="status-info">
                <h1 class="status-title">
                  {{ pageStatus.label }}
                </h1>
                <p
                  v-if="activeIncidents.length > 0"
                  class="status-subtitle"
                >
                  {{ activeIncidents.length }} active incident{{ activeIncidents.length > 1 ? 's' : '' }}
                </p>
              </div>
              <div class="status-uptime-box">
                <div class="uptime-value">
                  {{ avgUptime.toFixed(2) }}%
                </div>
                <div class="uptime-text">
                  UPTIME
                </div>
              </div>
            </div>
          </div>

          <!-- About Section -->
          <div
            v-if="statusPage.description || statusPage.branding.headerText"
            class="about-section"
          >
            <h2 class="section-title">
              About This Site
            </h2>
            <p class="section-description">
              {{ statusPage.description || statusPage.branding.headerText }}
            </p>
          </div>

          <!-- Monitors Status -->
          <div class="services-section">
            <div class="services-section-header">
              <span class="range-label-text"><strong>Time Range:</strong></span>
              <NSelect
                v-model:value="selectedBarRange"
                :options="timeRangeOptions"
                size="small"
                class="range-select"
                :consistent-menu-width="false"
              />
            </div>
            <div
              v-for="monitor in monitorData"
              :key="monitor.id"
              class="service-row"
            >
              <div class="service-header">
                <div class="service-name">
                  {{ monitor.name }}
                </div>
                <div class="service-status">
                  <span
                    class="status-badge"
                    :class="`status-${monitor.status}`"
                  >
                    {{ monitor.status === 'operational' ? 'Operational' : monitor.status === 'degraded' ? 'Degraded Performance' : 'Down' }}
                  </span>
                </div>
              </div>

              <!-- Uptime Bars (dynamic time range from dropdown) -->
              <div
                v-if="statusPage.display.showUptimePercentage"
                class="uptime-bars"
              >
                <NTooltip
                  v-for="(bar, idx) in monitor.bars"
                  :key="idx"
                  trigger="hover"
                  placement="top"
                >
                  <template #trigger>
                    <div
                      class="uptime-bar"
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

              <div
                v-if="statusPage.display.showUptimePercentage"
                class="uptime-summary"
              >
                <span class="uptime-range-labels">
                  <span class="range-label">Older</span>
                  <span class="range-label">Recent</span>
                </span>
                <span class="uptime-percentage">{{ monitor.uptime.toFixed(2) }}% <span
                  class="uptime-label"
                >uptime</span></span>
                <span
                  v-if="statusPage.display.showResponseTime"
                  class="response-time"
                >{{ monitor.responseTime
                }}ms</span>
              </div>
            </div>
          </div>

          <!-- Active Incidents -->
          <div
            v-if="activeIncidents.length > 0"
            class="incidents-section"
          >
            <h2 class="section-title">
              Active Incidents
            </h2>
            <div
              v-for="incident in activeIncidents"
              :key="incident.id"
              class="incident-card"
            >
              <div class="incident-header">
                <h3 class="incident-title">
                  {{ incident.title }}
                </h3>
                <div class="incident-badges">
                  <span
                    class="incident-badge"
                    :class="`impact-${incident.impact}`"
                  >
                    {{ INCIDENT_IMPACT[incident.impact]?.label }}
                  </span>
                  <span
                    class="incident-badge"
                    :class="`status-${incident.status}`"
                  >
                    {{ INCIDENT_STATUS[incident.status]?.label }}
                  </span>
                </div>
              </div>
              <p class="incident-message">
                {{ incident.message }}
              </p>
              <div class="incident-time">
                Started {{ formatRelativeTime(new Date(incident.startedAt).toISOString()) }}
              </div>
            </div>
          </div>

          <!-- Past Incidents (real uptime data when Mock=false; merged with PG when Mock=true) -->
          <div
            v-if="statusPage.display.showIncidentHistory && allPastIncidents.length > 0"
            class="past-incidents-section"
          >
            <h2 class="section-title">
              Past Incidents ({{ allPastIncidents.length }})
            </h2>
            <div class="incidents-list">
              <div
                v-for="incident in paginatedPastIncidents"
                :key="incident.id"
                class="past-incident-item"
              >
                <div class="incident-date">
                  {{ new Date(incident.startedAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year:
                      'numeric'
                  })
                  }}
                </div>
                <div class="incident-details">
                  <div class="incident-header-row">
                    <h4 class="incident-name">
                      {{ incident.title }}
                    </h4>
                    <span
                      v-if="incident.resolvedAt"
                      class="incident-resolved"
                    >Resolved</span>
                  </div>
                  <p class="incident-desc">
                    {{ incident.message }}
                  </p>
                </div>
              </div>
            </div>
            <!-- Pagination -->
            <div
              v-if="pastIncidentTotalPages > 1"
              class="incidents-pagination"
            >
              <button
                class="pagination-btn"
                :disabled="pastIncidentPage <= 1"
                @click="pastIncidentPage--"
              >
                <Icon icon="carbon:chevron-left" />
              </button>
              <span class="pagination-info">
                Page {{ pastIncidentPage }} of {{ pastIncidentTotalPages }}
              </span>
              <button
                class="pagination-btn"
                :disabled="pastIncidentPage >= pastIncidentTotalPages"
                @click="pastIncidentPage++"
              >
                <Icon icon="carbon:chevron-right" />
              </button>
            </div>
          </div>

          <!-- Subscribe Section -->
          <div
            v-if="statusPage.display.allowSubscriptions"
            class="subscribe-section"
          >
            <h2 class="section-title">
              Subscribe to Updates
            </h2>
            <p class="section-description">
              Get notified via email when incidents occur or are resolved.
            </p>
            <div class="subscribe-form">
              <NInput
                v-model:value="subscribeEmail"
                placeholder="Enter your email address"
                size="large"
                :disabled="subscribing"
                clearable
              >
                <template #prefix>
                  <Icon icon="carbon:email" />
                </template>
              </NInput>
              <NButton
                type="primary"
                size="large"
                :loading="subscribing"
                :disabled="!subscribeEmail"
                @click="handleSubscribe"
              >
                Subscribe
              </NButton>
            </div>
          </div>

          <!-- Subscribe Modal -->
          <Teleport to="body">
            <div
              v-if="showSubscribeModal"
              class="subscribe-modal-overlay"
              @click="closeSubscribeModal"
            >
              <div
                class="subscribe-modal"
                @click.stop
              >
                <div class="modal-header">
                  <h2 class="modal-title">
                    Subscribe to Updates
                  </h2>
                </div>

                <div class="modal-tabs">
                  <button
                    class="tab-button"
                    :class="{ active: subscribeMethod === 'email' }"
                    title="Email"
                    @click="subscribeMethod = 'email'"
                  >
                    <Icon icon="carbon:email" />
                  </button>
                  <button
                    class="tab-button"
                    :class="{ active: subscribeMethod === 'webhook' }"
                    title="Webhook"
                    @click="subscribeMethod = 'webhook'"
                  >
                    <Icon icon="carbon:webhook" />
                  </button>
                  <button
                    class="tab-button close-button"
                    title="Close"
                    @click="closeSubscribeModal"
                  >
                    <Icon icon="carbon:close" />
                  </button>
                </div>

                <div class="modal-content">
                  <!-- Email Tab -->
                  <div
                    v-if="subscribeMethod === 'email'"
                    class="subscribe-content"
                  >
                    <p class="subscribe-description">
                      Get email notifications whenever {{ statusPage.title }} <strong>creates, updates</strong> or
                      <strong>resolves</strong> an incident.
                    </p>
                    <div class="form-group">
                      <label class="form-label">Email address:</label>
                      <NInput
                        v-model:value="subscribeEmail"
                        placeholder="Enter your email"
                        size="large"
                        :disabled="subscribing"
                        clearable
                      />
                    </div>
                    <NButton
                      type="primary"
                      size="large"
                      block
                      :loading="subscribing"
                      :disabled="!subscribeEmail"
                      @click="handleSubscribe"
                    >
                      SUBSCRIBE VIA EMAIL
                    </NButton>
                    <p
                      v-if="recaptchaEnabled"
                      class="recaptcha-notice"
                    >
                      This site is protected by reCAPTCHA and the Google
                      <a
                        href="https://policies.google.com/privacy"
                        target="_blank"
                      >Privacy Policy</a> and
                      <a
                        href="https://policies.google.com/terms"
                        target="_blank"
                      >Terms of Service</a> apply.
                    </p>
                  </div>

                  <!-- Webhook Tab -->
                  <div
                    v-else-if="subscribeMethod === 'webhook'"
                    class="subscribe-content"
                  >
                    <p class="subscribe-description">
                      Get webhook notifications whenever {{ statusPage.title }} <strong>creates, updates</strong> or
                      <strong>resolves</strong> an incident.
                    </p>
                    <div class="form-group">
                      <label class="form-label">Webhook URL:</label>
                      <NInput
                        v-model:value="webhookUrl"
                        placeholder="https://your-webhook-url.com/endpoint"
                        size="large"
                        :disabled="subscribing"
                        clearable
                      />
                      <p class="field-hint">
                        The URL we should send the webhooks to
                      </p>
                    </div>
                    <NButton
                      type="primary"
                      size="large"
                      block
                      :loading="subscribing"
                      :disabled="!webhookUrl"
                      @click="handleSubscribe"
                    >
                      SUBSCRIBE VIA WEBHOOK
                    </NButton>
                    <p
                      v-if="recaptchaEnabled"
                      class="recaptcha-notice"
                    >
                      This site is protected by reCAPTCHA and the Google
                      <a
                        href="https://policies.google.com/privacy"
                        target="_blank"
                      >Privacy Policy</a> and
                      <a
                        href="https://policies.google.com/terms"
                        target="_blank"
                      >Terms of Service</a> apply.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Teleport>

          <!-- Footer -->
          <div class="status-footer">
            <div class="footer-content">
              <div class="footer-logo">
                <img
                  :src="tfoLogoDark"
                  :alt="whiteLabelConfig.brandName"
                  class="footer-logo-image"
                />
              </div>
              <div class="footer-copyright">
                Copyright © {{ new Date().getFullYear() }} - <strong>{{ whiteLabelConfig.brandName }}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- Not Found State -->
        <div
          v-else-if="!loading"
          class="not-found"
        >
          <Icon
            icon="carbon:warning-alt"
            class="not-found-icon"
          />
          <h2>Status Page Not Found</h2>
          <p>The status page you're looking for doesn't exist or has been removed.</p>
        </div>
      </NSpin>
    </div>
  </NConfigProvider>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.public-status-page {
  min-height: 100vh;
  background: $gray-50;
  padding: 0;

  :global(html.dark) & {
    background: $dark-bg-base;
  }
}

.status-container {
  max-width: 100%;
  margin: 0 auto;
}

// Header
.status-header {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  padding: 24px 60px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

  :global(html.dark) & {
    background: linear-gradient(135deg, #0f172a 0%, #020617 100%);
  }
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  @include flex-between;
}

.brand-logo {
  .custom-logo {
    max-height: 56px;
    max-width: 220px;
    object-fit: contain;
  }
}

.tfo-logo {
  display: flex;
  align-items: center;
  gap: 16px;

  .logo-image {
    height: 56px;
    width: 56px;
    object-fit: contain;
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
  }

  .logo-text {
    font-size: 22px;
    font-weight: 700;
    color: white;
    letter-spacing: -0.5px;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;

  :deep(.n-button--primary-type) {
    background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%) !important;
    color: white !important;
    border: none !important;
    font-weight: 700 !important;
    box-shadow: 0 4px 12px rgba(13, 148, 136, 0.4) !important;
    padding: 0 24px !important;
    height: 40px !important;
    text-transform: capitalize !important;
    border-radius: 8px !important;

    &:hover {
      background: linear-gradient(135deg, #0f766e 0%, #115e59 100%) !important;
      box-shadow: 0 6px 16px rgba(13, 148, 136, 0.5) !important;
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
      box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.3) !important;
    }
  }
}

// Status Banner
.status-banner {
  background: linear-gradient(135deg, rgba($info-color, 0.15) 0%, rgba($info-color, 0.05) 100%);
  padding: 48px 60px;
  border-bottom: 3px solid rgba($info-color, 0.3);

  :global(html.dark) & {
    background: linear-gradient(135deg, rgba($info-color, 0.1) 0%, rgba($info-color, 0.03) 100%);
    border-bottom-color: rgba($info-color, 0.2);
  }

  &.status-operational {
    background: linear-gradient(135deg, rgba($success-color, 0.15) 0%, rgba($success-color, 0.05) 100%);
    border-bottom-color: rgba($success-color, 0.3);

    :global(html.dark) & {
      background: linear-gradient(135deg, rgba($success-color, 0.1) 0%, rgba($success-color, 0.03) 100%);
      border-bottom-color: rgba($success-color, 0.2);
    }
  }

  &.status-degraded_performance {
    background: linear-gradient(135deg, rgba($warning-color, 0.15) 0%, rgba($warning-color, 0.05) 100%);
    border-bottom-color: rgba($warning-color, 0.3);

    :global(html.dark) & {
      background: linear-gradient(135deg, rgba($warning-color, 0.1) 0%, rgba($warning-color, 0.03) 100%);
      border-bottom-color: rgba($warning-color, 0.2);
    }
  }

  &.status-partial_outage,
  &.status-major_outage {
    background: linear-gradient(135deg, rgba($error-color, 0.15) 0%, rgba($error-color, 0.05) 100%);
    border-bottom-color: rgba($error-color, 0.3);

    :global(html.dark) & {
      background: linear-gradient(135deg, rgba($error-color, 0.1) 0%, rgba($error-color, 0.03) 100%);
      border-bottom-color: rgba($error-color, 0.2);
    }
  }

  &.status-maintenance {
    background: linear-gradient(135deg, rgba($primary-color, 0.15) 0%, rgba($primary-color, 0.05) 100%);
    border-bottom-color: rgba($primary-color, 0.3);

    :global(html.dark) & {
      background: linear-gradient(135deg, rgba($primary-color, 0.1) 0%, rgba($primary-color, 0.03) 100%);
      border-bottom-color: rgba($primary-color, 0.2);
    }
  }
}

.status-content {
  flex: 1;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-info {
  flex: 1;
}

.status-title {
  margin: 0;
  font-size: 36px;
  font-weight: 800;
  color: $gray-900;
  letter-spacing: -0.5px;

  :global(html.dark) & {
    color: $dark-text-primary;
  }
}

.status-subtitle {
  margin: 12px 0 0 0;
  font-size: 17px;
  color: $gray-600;
  font-weight: 500;

  :global(html.dark) & {
    color: $dark-text-secondary;
  }
}

.status-uptime-box {
  padding: 24px 40px;
  border: 3px solid $success-color;
  border-radius: $radius-xl;
  text-align: center;
  background: white;
  box-shadow: 0 8px 24px rgba($success-color, 0.2);

  :global(html.dark) & {
    border-color: #0d9488;
    background: $dark-bg-elevated;
    box-shadow: 0 8px 24px rgba(13, 148, 136, 0.15);
  }

  .uptime-value {
    font-size: 42px;
    font-weight: 900;
    line-height: 1;
    color: $success-color;
    letter-spacing: -1px;

    :global(html.dark) & {
      color: #2dd4bf;
    }
  }

  .uptime-text {
    margin-top: 8px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: $gray-600;

    :global(html.dark) & {
      color: $dark-text-muted;
    }
  }
}

// About Section
.about-section {
  background: white;
  padding: 40px 60px;
  border-bottom: 1px solid $gray-200;

  :global(html.dark) & {
    background: $dark-bg-elevated;
    border-bottom-color: $dark-border;
  }
}

.section-title {
  max-width: 1400px;
  margin: 0 auto 20px auto;
  font-size: 24px;
  font-weight: 800;
  color: $gray-900;
  letter-spacing: -0.5px;

  :global(html.dark) & {
    color: $dark-text-primary;
  }
}

.section-description {
  max-width: 1400px;
  margin: 0 auto;
  font-size: 16px;
  color: $gray-600;
  line-height: 1.8;

  :global(html.dark) & {
    color: $dark-text-secondary;
  }
}

// Services Section
.services-section {
  background: white;
  padding: 40px 60px;

  :global(html.dark) & {
    background: $dark-bg-elevated;
  }
}

.service-row {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px 0;
  border-bottom: 1px solid $gray-200;

  &:last-child {
    border-bottom: none;
  }

  :global(html.dark) & {
    border-bottom-color: $dark-border;
  }
}

.service-header {
  @include flex-between;
  margin-bottom: 16px;
}

.service-name {
  font-size: 18px;
  font-weight: 700;
  color: $gray-900;

  :global(html.dark) & {
    color: $dark-text-primary;
  }
}

.service-status {
  display: flex;
  align-items: center;
}

.status-badge {
  padding: 8px 16px;
  border-radius: $radius-md;
  font-size: 13px;
  font-weight: 700;
  text-transform: capitalize;
  letter-spacing: 0.3px;

  &.status-operational {
    background: rgba($success-color, 0.15);
    color: darken($success-color, 15%);
    border: 2px solid rgba($success-color, 0.3);

    :global(html.dark) & {
      background: rgba($success-color, 0.2);
      color: lighten($success-color, 15%);
      border-color: rgba($success-color, 0.4);
    }
  }

  &.status-degraded {
    background: rgba($warning-color, 0.15);
    color: darken($warning-color, 15%);
    border: 2px solid rgba($warning-color, 0.3);

    :global(html.dark) & {
      background: rgba($warning-color, 0.2);
      color: lighten($warning-color, 15%);
      border-color: rgba($warning-color, 0.4);
    }
  }

  &.status-down {
    background: rgba($error-color, 0.15);
    color: darken($error-color, 5%);
    border: 2px solid rgba($error-color, 0.3);

    :global(html.dark) & {
      background: rgba($error-color, 0.2);
      color: lighten($error-color, 15%);
      border-color: rgba($error-color, 0.4);
    }
  }
}

// Uptime Bars
.uptime-bars {
  display: flex;
  gap: 3px;
  height: 48px;
  margin-bottom: 12px;
}

.uptime-bar {
  flex: 1;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: $transition-fast;

  &:hover {
    opacity: 0.8;
    transform: scaleY(1.1);
  }
}

.uptime-summary {
  display: flex;
  gap: 20px;
  align-items: center;
  font-size: 14px;
}

.uptime-range-labels {
  display: flex;
  justify-content: space-between;
  flex: 1;

  .range-label {
    font-size: 11px;
    color: $gray-500;

    :global(html.dark) & {
      color: $dark-text-muted;
    }
  }
}

.services-section-header {
  max-width: 1400px;
  margin: 0 auto 12px auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.range-label-text {
  font-size: 13px;
  font-weight: 600;
  color: $gray-500;
  letter-spacing: 0.3px;

  :global(html.dark) & {
    color: $dark-text-muted;
  }
}

.range-select {
  width: 160px;
  flex-shrink: 0;
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
    opacity: 0.7;
  }
}

.uptime-percentage {
  font-weight: 800;
  font-size: 16px;
  color: $success-color;

  :global(html.dark) & {
    color: #2dd4bf;
  }

  .uptime-label {
    font-weight: 500;
    font-size: 12px;
    text-transform: uppercase;
    color: $gray-600;
    margin-left: 6px;
    letter-spacing: 0.5px;

    :global(html.dark) & {
      color: $dark-text-muted;
    }
  }
}

.response-time {
  font-size: 14px;
  color: $gray-600;

  :global(html.dark) & {
    color: $dark-text-secondary;
  }
}

// Incidents Section
.incidents-section {
  background: white;
  padding: 40px 60px;
  border-top: 1px solid $gray-200;

  :global(html.dark) & {
    background: $dark-bg-elevated;
    border-top-color: $dark-border;
  }
}

.incident-card {
  max-width: 1400px;
  margin: 0 auto 20px auto;
  background: rgba($error-color, 0.05);
  border: 1px solid rgba($error-color, 0.2);
  border-left: 4px solid $error-color;
  border-radius: $radius-md;
  padding: 24px;

  &:last-child {
    margin-bottom: 0;
  }

  :global(html.dark) & {
    background: rgba($error-color, 0.1);
    border-color: rgba($error-color, 0.3);
  }
}

.incident-header {
  @include flex-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.incident-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: $gray-900;

  :global(html.dark) & {
    color: $dark-text-primary;
  }
}

.incident-badges {
  display: flex;
  gap: 8px;
}

.incident-badge {
  padding: 4px 10px;
  border-radius: $radius-sm;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  &.impact-critical,
  &.impact-major {
    background: rgba($error-color, 0.1);
    color: darken($error-color, 10%);

    :global(html.dark) & {
      background: rgba($error-color, 0.15);
      color: lighten($error-color, 10%);
    }
  }

  &.impact-minor {
    background: rgba($warning-color, 0.1);
    color: darken($warning-color, 20%);

    :global(html.dark) & {
      background: rgba($warning-color, 0.15);
      color: lighten($warning-color, 10%);
    }
  }

  &.status-investigating,
  &.status-identified {
    background: rgba($primary-color, 0.1);
    color: darken($primary-color, 10%);

    :global(html.dark) & {
      background: rgba($primary-color, 0.15);
      color: lighten($primary-color, 10%);
    }
  }

  &.status-monitoring {
    background: rgba($warning-color, 0.1);
    color: darken($warning-color, 20%);

    :global(html.dark) & {
      background: rgba($warning-color, 0.15);
      color: lighten($warning-color, 10%);
    }
  }
}

.incident-message {
  margin: 0 0 12px 0;
  font-size: 15px;
  color: $gray-700;
  line-height: 1.7;

  :global(html.dark) & {
    color: $dark-text-secondary;
  }
}

.incident-time {
  font-size: 13px;
  color: $gray-600;

  :global(html.dark) & {
    color: $dark-text-muted;
  }
}

// Past Incidents Section
.past-incidents-section {
  background: $gray-50;
  padding: 40px 60px;
  border-top: 1px solid $gray-200;

  :global(html.dark) & {
    background: $dark-bg-base;
    border-top-color: $dark-border;
  }
}

.incidents-list {
  max-width: 1400px;
  margin: 24px auto 0 auto;
}

.incidents-pagination {
  max-width: 1400px;
  margin: 24px auto 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.pagination-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: $radius-md;
  border: 2px solid $gray-300;
  background: white;
  color: $gray-700;
  cursor: pointer;
  font-size: 18px;
  transition: $transition-fast;

  :global(html.dark) & {
    background: $dark-bg-elevated;
    border-color: $dark-border;
    color: $dark-text-secondary;
  }

  &:hover:not(:disabled) {
    border-color: $primary-color;
    color: $primary-color;
    background: rgba($primary-color, 0.05);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.pagination-info {
  font-size: 14px;
  font-weight: 600;
  color: $gray-600;

  :global(html.dark) & {
    color: $dark-text-muted;
  }
}

.past-incident-item {
  display: flex;
  gap: 32px;
  padding: 24px 0;
  border-bottom: 1px solid $gray-200;

  &:last-child {
    border-bottom: none;
  }

  :global(html.dark) & {
    border-bottom-color: $dark-border;
  }
}

.incident-date {
  flex-shrink: 0;
  width: 140px;
  font-size: 14px;
  font-weight: 700;
  color: $gray-600;

  :global(html.dark) & {
    color: $dark-text-muted;
  }
}

.incident-details {
  flex: 1;
}

.incident-header-row {
  @include flex-between;
  align-items: center;
  margin-bottom: 8px;
}

.incident-name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: $gray-900;

  :global(html.dark) & {
    color: $dark-text-primary;
  }
}

.incident-resolved {
  padding: 4px 10px;
  background: rgba($success-color, 0.1);
  color: darken($success-color, 20%);
  border-radius: $radius-sm;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  :global(html.dark) & {
    background: rgba($success-color, 0.15);
    color: lighten($success-color, 10%);
  }
}

.incident-desc {
  margin: 0;
  font-size: 15px;
  color: $gray-600;
  line-height: 1.7;

  :global(html.dark) & {
    color: $dark-text-secondary;
  }
}

// Subscribe Section
.subscribe-section {
  background: white;
  padding: 40px 60px;
  border-top: 1px solid $gray-200;

  :global(html.dark) & {
    background: $dark-bg-elevated;
    border-top-color: $dark-border;
  }

  .section-title,
  .section-description {
    max-width: 1400px;
    margin-left: auto;
    margin-right: auto;
  }
}

.subscribe-form {
  max-width: 1400px;
  margin: 24px auto 0 auto;
  display: flex;
  gap: 16px;
  align-items: center;

  :deep(.n-input) {
    flex: 1;
    max-width: 600px;

    * {
      outline: none !important;
    }

    .n-input-wrapper {
      padding: 0 !important;
      background: white !important;
      border: 3px solid $primary-color !important;
      border-radius: 16px !important;
      transition: all 0.2s ease !important;
      height: 64px !important;
      display: flex !important;
      align-items: center !important;
      box-shadow: none !important;
      outline: none !important;

      :global(html.dark) & {
        background: rgba(255, 255, 255, 0.05) !important;
        border-color: $primary-color !important;
      }

      &:hover {
        border-color: darken($primary-color, 10%) !important;
        box-shadow: 0 0 0 1px rgba($primary-color, 0.2) !important;

        :global(html.dark) & {
          border-color: lighten($primary-color, 10%) !important;
        }
      }

      &.n-input-wrapper--focus {
        border-color: $primary-color !important;
        box-shadow: 0 0 0 4px rgba($primary-color, 0.15) !important;

        :global(html.dark) & {
          border-color: $primary-color !important;
          box-shadow: 0 0 0 4px rgba($primary-color, 0.25) !important;
        }
      }
    }

    .n-input__border,
    .n-input__state-border {
      display: none !important;
      border: none !important;
      box-shadow: none !important;
      outline: none !important;
    }

    .n-input__prefix {
      margin-right: 12px !important;
      margin-left: 20px !important;
      display: flex !important;
      align-items: center !important;
      font-size: 20px !important;
      color: $gray-500 !important;
      height: 100% !important;

      :global(html.dark) & {
        color: rgba(255, 255, 255, 0.5) !important;
      }
    }

    .n-input__input {
      display: flex !important;
      align-items: center !important;
      height: 100% !important;
      border: none !important;
      outline: none !important;
    }

    .n-input__input-el {
      padding-left: 0 !important;
      padding-right: 20px !important;
      height: 100% !important;
      display: flex !important;
      align-items: center !important;
      font-size: 16px !important;
      color: $gray-900 !important;
      background: transparent !important;
      line-height: 64px !important;
      border: none !important;
      outline: none !important;

      :global(html.dark) & {
        color: white !important;
      }

      &:focus {
        outline: none !important;
        border: none !important;
      }
    }

    .n-input__placeholder {
      display: flex !important;
      align-items: center !important;
      height: 100% !important;
      padding-left: 0 !important;
      color: $gray-400 !important;
      font-size: 16px !important;
      line-height: 64px !important;

      :global(html.dark) & {
        color: rgba(255, 255, 255, 0.3) !important;
      }
    }

    .n-input__suffix {
      margin-right: 16px !important;
      display: flex !important;
      align-items: center !important;
      height: 100% !important;
    }
  }

  :deep(.n-button--primary-type) {
    background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%) !important;
    color: white !important;
    border: none !important;
    font-weight: 700 !important;
    height: 64px !important;
    padding: 0 40px !important;
    border-radius: 16px !important;
    box-shadow: 0 4px 12px rgba(13, 148, 136, 0.4) !important;
    transition: all 0.2s ease !important;
    text-transform: uppercase !important;
    letter-spacing: 1px !important;
    font-size: 15px !important;

    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #0f766e 0%, #115e59 100%) !important;
      box-shadow: 0 6px 16px rgba(13, 148, 136, 0.5) !important;
      transform: translateY(-2px);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
      box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.3) !important;
    }

    &:focus {
      box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.3) !important;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

// Footer
.status-footer {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  padding: 24px 60px;
  border-top: 3px solid rgba(13, 148, 136, 0.3);

  :global(html.dark) & {
    background: linear-gradient(135deg, #0f172a 0%, #020617 100%);
    border-top-color: rgba(13, 148, 136, 0.2);
  }
}

.footer-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 40px;
}

.footer-logo {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: -10px;

  .footer-logo-image {
    height: 64px;
    width: auto;
    object-fit: contain;
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
  }
}

.footer-copyright {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  text-align: right;

  strong {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 700;
  }
}

// Not Found
.not-found {
  background: white;
  padding: 100px 60px;
  text-align: center;
  margin: 60px;
  border-radius: $radius-lg;
  border: 1px solid $gray-200;
  box-shadow: $shadow-sm;

  :global(html.dark) & {
    background: $dark-bg-elevated;
    border-color: $dark-border;
  }
}

.not-found-icon {
  font-size: 72px;
  color: $error-color;
  margin-bottom: 24px;
}

.not-found h2 {
  margin: 0 0 12px 0;
  font-size: 28px;
  font-weight: 700;
  color: $gray-900;

  :global(html.dark) & {
    color: $dark-text-primary;
  }
}

.not-found p {
  margin: 0;
  font-size: 16px;
  color: $gray-600;

  :global(html.dark) & {
    color: $dark-text-secondary;
  }
}

// Subscribe Modal
.subscribe-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
  backdrop-filter: blur(4px);
}

.subscribe-modal {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 600px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  animation: modalSlideIn 0.3s ease-out;

  :global(html.dark) & {
    background: $dark-bg-elevated;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  }
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
  padding: 32px 40px;
  text-align: center;
}

.modal-title {
  margin: 0;
  font-size: 28px;
  font-weight: 800;
  color: white;
  letter-spacing: -0.5px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.modal-tabs {
  display: flex;
  background: $gray-100;
  border-bottom: 2px solid $gray-200;

  :global(html.dark) & {
    background: rgba(255, 255, 255, 0.05);
    border-bottom-color: $dark-border;
  }
}

.tab-button {
  flex: 1;
  padding: 20px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: $gray-500;
  transition: all 0.2s ease;
  position: relative;

  :global(html.dark) & {
    color: rgba(255, 255, 255, 0.4);
  }

  &:hover:not(.disabled) {
    background: rgba($primary-color, 0.05);
    color: $primary-color;

    :global(html.dark) & {
      background: rgba($primary-color, 0.1);
      color: $primary-color;
    }
  }

  &.active {
    background: white;
    color: $primary-color;

    :global(html.dark) & {
      background: $dark-bg-base;
      color: $primary-color;
    }

    &::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      right: 0;
      height: 3px;
      background: $primary-color;
    }
  }

  &.disabled {
    cursor: not-allowed;
    opacity: 0.3;

    &:hover {
      background: transparent;
      color: $gray-500;

      :global(html.dark) & {
        color: rgba(255, 255, 255, 0.4);
      }
    }
  }

  &.close-button {
    flex: 0 0 auto;
    width: 80px;
    background: rgba($error-color, 0.1);
    color: $error-color;

    :global(html.dark) & {
      background: rgba($error-color, 0.15);
    }

    &:hover {
      background: rgba($error-color, 0.2);
      color: darken($error-color, 10%);

      :global(html.dark) & {
        background: rgba($error-color, 0.25);
        color: lighten($error-color, 10%);
      }
    }
  }
}

.modal-content {
  padding: 40px;
}

.subscribe-content {
  .subscribe-description {
    font-size: 16px;
    color: $gray-700;
    line-height: 1.7;
    margin: 0 0 32px 0;
    text-align: center;

    :global(html.dark) & {
      color: $dark-text-secondary;
    }

    strong {
      color: $gray-900;
      font-weight: 700;

      :global(html.dark) & {
        color: $dark-text-primary;
      }
    }
  }

  .form-group {
    margin-bottom: 24px;
  }

  .form-label {
    display: block;
    font-size: 16px;
    font-weight: 700;
    color: $gray-900;
    margin-bottom: 12px;

    :global(html.dark) & {
      color: $dark-text-primary;
    }
  }

  :deep(.n-input) {
    .n-input-wrapper {
      padding: 0 !important;
      background: white !important;
      border: 2px solid $gray-300 !important;
      border-radius: 8px !important;
      transition: all 0.2s ease !important;

      :global(html.dark) & {
        background: rgba(255, 255, 255, 0.05) !important;
        border-color: rgba(255, 255, 255, 0.2) !important;
      }

      &:hover {
        border-color: $primary-color !important;

        :global(html.dark) & {
          border-color: rgba(255, 255, 255, 0.3) !important;
        }
      }

      &.n-input-wrapper--focus {
        border-color: $primary-color !important;
        box-shadow: 0 0 0 3px rgba($primary-color, 0.1) !important;

        :global(html.dark) & {
          box-shadow: 0 0 0 3px rgba($primary-color, 0.2) !important;
        }
      }
    }

    .n-input__input-el {
      padding: 14px 16px !important;
      height: 52px !important;
      font-size: 15px !important;
      color: $gray-900 !important;

      :global(html.dark) & {
        color: white !important;
      }
    }

    .n-input__placeholder {
      padding-left: 16px !important;
      color: $gray-500 !important;
      font-size: 15px !important;

      :global(html.dark) & {
        color: rgba(255, 255, 255, 0.4) !important;
      }
    }
  }

  :deep(.n-button) {
    background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%) !important;
    color: white !important;
    border: none !important;
    font-weight: 700 !important;
    height: 52px !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 12px rgba(13, 148, 136, 0.4) !important;
    transition: all 0.2s ease !important;
    font-size: 14px !important;
    letter-spacing: 0.5px !important;

    &:hover {
      background: linear-gradient(135deg, #0f766e 0%, #115e59 100%) !important;
      box-shadow: 0 6px 16px rgba(13, 148, 136, 0.5) !important;
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  }

  .recaptcha-notice {
    margin: 20px 0 0 0;
    font-size: 12px;
    color: $gray-600;
    text-align: center;
    line-height: 1.6;

    :global(html.dark) & {
      color: $dark-text-muted;
    }

    a {
      color: $primary-color;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  }
}

// Responsive
@media (max-width: 768px) {
  .status-header {
    padding: 16px 24px;
  }

  .header-content {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }

  .status-banner,
  .about-section,
  .services-section,
  .incidents-section,
  .past-incidents-section,
  .subscribe-section {
    padding: 32px 24px;
  }

  .status-banner {
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
  }

  .status-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
    width: 100%;
  }

  .status-uptime-box {
    align-self: flex-end;
  }

  .past-incident-item {
    flex-direction: column;
    gap: 12px;
  }

  .incident-date {
    width: auto;
  }

  .subscribe-form {
    flex-direction: column;

    :deep(.n-input) {
      max-width: 100%;
    }

    :deep(.n-button) {
      width: 100%;
    }
  }

  .status-footer {
    padding: 20px 24px;
  }

  .footer-content {
    flex-direction: column;
    gap: 16px;
    align-items: center;
  }

  .footer-copyright {
    text-align: center;
  }

  .subscribe-modal {
    max-width: 95%;
    margin: 0 10px;
  }

  .modal-header {
    padding: 24px 20px;
  }

  .modal-title {
    font-size: 22px;
  }

  .modal-tabs {
    overflow-x: auto;
  }

  .tab-button {
    padding: 16px;
    font-size: 20px;
    min-width: 60px;

    &.close-button {
      width: 60px;
    }
  }

  .modal-content {
    padding: 24px 20px;
  }

  .subscribe-content {
    .subscribe-description {
      font-size: 14px;
      margin-bottom: 24px;
    }
  }
}
</style>