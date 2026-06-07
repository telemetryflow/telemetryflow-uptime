<script setup lang="ts">
/**
 * UptimeGraphs.vue
 *
 * Two graphs driven by RegistryGraphPanel:
 *   UPT10017 — Response Time per URL (time-series, avg response time ms per monitor, success only)
 *   UPT10018 — SSL Days Remaining per URL (bar chart, latest value per monitor, color-coded by severity)
 *
 * Data source: real ClickHouse materialized views via backend API.
 * No mock fallback — data comes from real ingestion only.
 */

import { computed, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import RegistryGraphPanel from "@/components/charts/RegistryGraphPanel.vue";
import { uptimeApi } from "@/api/uptime";
import { SERIES_COLORS } from "@/utils";
import { useAppStore } from "@/store";
import { config } from "@/config";
import type { UptimeCheck } from "@/types/uptime";
import type { Monitor } from "@/types/uptime";
import type { ChartSeries } from "@/types/dashboard";

interface Props {
  /** All currently loaded monitors (used in "all monitors" mode). */
  monitors: Monitor[];
  /** When set, both graphs are scoped to this single monitor. */
  monitor?: Monitor | null;
}

const props = defineProps<Props>();
const appStore = useAppStore();

// ─── Time window (derived from global time range) ────────────────────────────

const hours = computed(() => {
  const diffMs = appStore.globalTimeRange.end - appStore.globalTimeRange.start;
  return Math.max(1, Math.round(diffMs / 3_600_000));
});

// ─── Data stores ─────────────────────────────────────────────────────────────

interface HourlyStat {
  hour: string;
  successCount: number;
  totalChecks: number;
  avgResponseTimeMs: number;
}
interface SSLPoint {
  hour: string;
  minSslDays: number;
}
const hourlyData = ref<Map<string, HourlyStat[]>>(new Map());
const checkData = ref<Map<string, UptimeCheck[]>>(new Map());
const sslData = ref<Map<string, SSLPoint[]>>(new Map());
const loading = ref(false);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Monitors to show series for (max 10 to keep charts readable). */
const targetMonitors = computed(() =>
  props.monitor ? [props.monitor] : props.monitors.slice(0, 10),
);

/** Series label matching the "VM name (short-id)" convention. */
function seriesLabel(m: Monitor): string {
  try {
    return `${new URL(m.url).hostname} (${m.id.slice(0, 8)})`;
  } catch {
    return `${m.name} (${m.id.slice(0, 8)})`;
  }
}

/** True if monitor type can carry SSL data. */
function isSslMonitor(m: Monitor): boolean {
  return m.type === "https" || m.type === "ssl_certificate";
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchData() {
  const targets = targetMonitors.value;
  if (targets.length === 0) return;

  // Fetch at least 24h of hourly data so there are enough points for a chart line
  const h = Math.max(24, hours.value);
  loading.value = true;
  try {
    await Promise.all(
      targets.map(async (m) => {
        // Raw checks — for response time series (same source as detail minigraph)
        try {
          const checks = await uptimeApi.getMonitorChecks(m.id, { limit: config.limitDataMax });
          checkData.value = new Map(checkData.value).set(m.id, checks);
        } catch (err) {
          console.warn(`[UptimeGraphs] Failed to fetch checks for ${m.id}:`, err);
        }

        // Uptime hourly stats — kept for potential future use
        try {
          const rows = await uptimeApi.getHourlyStats(m.id, h);
          hourlyData.value = new Map(hourlyData.value).set(
            m.id,
            rows.map((r) => ({
              hour: r.hour,
              successCount: r.successCount,
              totalChecks: r.totalChecks,
              avgResponseTimeMs: r.avgResponseTimeMs ?? 0,
            })),
          );
        } catch {
          // Silently ignore per-monitor fetch errors
        }

        // SSL trend — only for HTTPS / ssl_certificate monitors
        if (isSslMonitor(m)) {
          try {
            const pts = await uptimeApi.getSSLTrend(m.id, h);
            sslData.value = new Map(sslData.value).set(m.id, pts);
          } catch {
            // Silently ignore
          }
        }
      }),
    );
  } finally {
    loading.value = false;
  }
}

// Re-fetch when monitors or global time range changes
watch(
  () =>
    [
      targetMonitors.value.map((m) => m.id).join(","),
      appStore.globalTimeRange.start,
      appStore.globalTimeRange.end,
    ] as const,
  fetchData,
  { immediate: true },
);

// ─── Uptime series ────────────────────────────────────────────────────────────

const uptimeSeries = computed((): ChartSeries[] | undefined => {
  const { start, end } = appStore.globalTimeRange;
  const result = targetMonitors.value
    .map((m, i) => {
      const checks = checkData.value.get(m.id) ?? [];
      // Use raw checks (same as detail minigraph) — filter by time range + success only
      const data: [number, number][] = checks
        .filter((c) => c.checkedAt >= start && c.checkedAt <= end)
        .sort((a, b) => a.checkedAt - b.checkedAt)
        .map((c) => [c.checkedAt, c.status === "success" ? c.responseTime : 0] as [number, number]);
      return {
        name: seriesLabel(m),
        data,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      } as ChartSeries;
    })
    .filter((s) => s.data.length > 0);
  return result.length ? result : undefined;
});

// ─── SSL series (bar chart — one bar per URL, latest value) ───────────────────

/** Color based on SSL days remaining severity. */
function sslColor(days: number): string {
  if (days <= 0) return "#ef4444"; // expired — red
  if (days < 7) return "#f97316"; // critical — orange
  if (days < 30) return "#f59e0b"; // warning — amber
  return "#10b981"; // safe — green
}

const sslSeries = computed((): ChartSeries[] | undefined => {
  const result = targetMonitors.value
    .filter(isSslMonitor)
    .map((m) => {
      const pts = sslData.value.get(m.id) ?? [];
      // Latest SSL days remaining (last point from trend data)
      const latestDays = pts.length > 0 ? pts[pts.length - 1].minSslDays : -1;
      if (latestDays < 0) return null;
      return {
        name: seriesLabel(m),
        // Single data point — toBarChartData sums it → produces the bar height
        data: [[0, latestDays]] as [number, number][],
        color: sslColor(latestDays),
      } as ChartSeries;
    })
    .filter((s): s is ChartSeries => s !== null);
  return result.length ? result : undefined;
});

// ─── Collapsed state ─────────────────────────────────────────────────────────

const collapsed = ref(false);
const isFiltered = computed(() => !!props.monitor);
const filterLabel = computed(() => {
  if (!props.monitor) return "";
  try {
    return new URL(props.monitor.url).hostname;
  } catch {
    return props.monitor.name;
  }
});
</script>

<template>
  <div class="section">
    <!-- Section header -->
    <div
      class="section-header"
      @click="collapsed = !collapsed"
    >
      <div class="section-title">
        <Icon
          icon="carbon:activity"
          class="section-icon"
        />
        <Icon
          :icon="collapsed ? 'carbon:chevron-right' : 'carbon:chevron-down'"
          class="chevron-icon"
        />
        <span>Uptime &amp; SSL Trends</span>
        <span
          v-if="isFiltered"
          class="section-badge badge-primary filter-inline-badge"
        >
          <Icon
            icon="carbon:filter"
            style="font-size: 11px; margin-right: 4px"
          />
          {{ filterLabel }}
        </span>
      </div>
      <div class="section-header-right">
        <span class="section-badge badge-info">
          <span class="badge-number">2</span> graphs
        </span>
      </div>
    </div>

    <!-- Graphs -->
    <div
      v-show="!collapsed"
      class="section-content"
    >
      <div class="graphs-grid">
        <!-- Uptime % per URL -->
        <RegistryGraphPanel
          graph-id="UPT10017"
          variant="panel"
          editable
          show-toggle
          show-zoom
          height="280px"
          :query-collapsed="true"
          no-auto-query
          :override-series="uptimeSeries"
          :override-loading="loading"
        />

        <!-- SSL Days Remaining per URL -->
        <RegistryGraphPanel
          graph-id="UPT10018"
          variant="panel"
          editable
          show-toggle
          show-zoom
          height="280px"
          :query-collapsed="true"
          no-auto-query
          :override-series="sslSeries"
          :override-loading="loading"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/section-styles.scss" as *;

.section-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-inline-badge {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  font-size: 0.6875rem;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.graphs-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  align-items: start;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
}
</style>
