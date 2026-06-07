<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";
import { useAppStore } from "@/store";
import type { UptimeStats } from "@/types/uptime";
import { formatUptime, formatResponseTime } from "@/types/uptime";

const appStore = useAppStore();

const props = defineProps<{
  stats: UptimeStats | null;
  loading?: boolean;
}>();

type TimeRange = "24h" | "7d" | "30d" | "90d";

const selectedRange = ref<TimeRange>("24h");

// Time range configurations
const timeRanges: Array<{ value: TimeRange; label: string }> = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
];

// Get stats for selected time range
const currentUptime = computed(() => {
  if (!props.stats) return 0;
  switch (selectedRange.value) {
    case "24h":
      return props.stats.uptime24h;
    case "7d":
      return props.stats.uptime7d;
    case "30d":
      return props.stats.uptime30d;
    case "90d":
      return props.stats.uptime90d;
    default:
      return 0;
  }
});

const currentAvgResponse = computed(() => {
  if (!props.stats) return 0;
  // For now, we only have avgResponseTime24h
  return props.stats.avgResponseTime24h;
});

const currentPercentiles = computed(() => {
  if (!props.stats) return null;
  switch (selectedRange.value) {
    case "24h":
      return props.stats.percentiles24h;
    case "7d":
      return props.stats.percentiles7d;
    case "30d":
      return props.stats.percentiles30d;
    case "90d":
      return props.stats.percentiles90d;
    default:
      return null;
  }
});

// Computed styles for dark/light mode
const borderColor = computed(() =>
  appStore.isDarkMode ? "#334155" : "#e5e7eb",
);
const bgColor = computed(() => (appStore.isDarkMode ? "#1e293b" : "#ffffff"));
const textColor = computed(() => (appStore.isDarkMode ? "#f1f5f9" : "#1f2937"));
const mutedTextColor = computed(() =>
  appStore.isDarkMode ? "#94a3b8" : "#6b7280",
);

const panelStyle = computed(() => ({
  background: bgColor.value,
  border: `1px solid ${borderColor.value}`,
  boxShadow: appStore.isDarkMode
    ? "0 2px 8px rgba(0, 0, 0, 0.3)"
    : "0 2px 8px rgba(0, 0, 0, 0.08)",
}));

const sectionTitleStyle = computed(() => ({
  color: textColor.value,
}));

// Get max percentile value for scaling bars
const maxPercentile = computed(() => {
  if (!currentPercentiles.value) return 100;
  const values = [
    currentPercentiles.value.p50,
    currentPercentiles.value.p75,
    currentPercentiles.value.p90,
    currentPercentiles.value.p95,
    currentPercentiles.value.p99,
  ];
  return Math.max(...values, 100);
});

// Keyboard navigation for time range tabs
function selectPreviousRange() {
  const currentIndex = timeRanges.findIndex(
    (r) => r.value === selectedRange.value,
  );
  if (currentIndex > 0) {
    selectedRange.value = timeRanges[currentIndex - 1].value;
  }
}

function selectNextRange() {
  const currentIndex = timeRanges.findIndex(
    (r) => r.value === selectedRange.value,
  );
  if (currentIndex < timeRanges.length - 1) {
    selectedRange.value = timeRanges[currentIndex + 1].value;
  }
}
</script>

<template>
  <div
    class="stats-panel"
    :style="panelStyle"
    role="region"
    aria-label="Monitor statistics panel"
  >
    <!-- Time Range Tabs -->
    <div
      class="time-range-tabs"
      role="tablist"
      aria-label="Time range selection"
    >
      <button
        v-for="range in timeRanges"
        :key="range.value"
        role="tab"
        :aria-selected="selectedRange === range.value"
        :aria-label="`View statistics for ${range.label}`"
        :class="{ active: selectedRange === range.value }"
        :tabindex="selectedRange === range.value ? 0 : -1"
        @click="selectedRange = range.value"
        @keydown.left.prevent="selectPreviousRange"
        @keydown.right.prevent="selectNextRange"
      >
        {{ range.label }}
      </button>
    </div>

    <!-- Loading State -->
    <div
      v-if="loading"
      class="loading-state"
    >
      <div class="skeleton-grid">
        <div
          v-for="i in 4"
          :key="i"
          class="skeleton-card"
        />
      </div>
      <div class="skeleton-percentiles">
        <div class="skeleton-title" />
        <div
          v-for="i in 5"
          :key="i"
          class="skeleton-bar"
        />
      </div>
    </div>

    <!-- Stats Content -->
    <div
      v-else-if="stats"
      class="stats-content"
      role="tabpanel"
      :aria-label="`Statistics for ${selectedRange}`"
    >
      <!-- Stats Grid -->
      <div class="stats-grid">
        <div
          class="stat-card"
          role="group"
          aria-label="Uptime percentage"
        >
          <div
            class="stat-icon"
            style="background: rgba(34, 197, 94, 0.1)"
            aria-hidden="true"
          >
            <Icon
              icon="carbon:checkmark-filled"
              style="color: #22c55e"
            />
          </div>
          <div class="stat-info">
            <span class="stat-label">Uptime</span>
            <span
              class="stat-value"
              aria-label="Uptime percentage"
            >{{ formatUptime(currentUptime) }}</span>
          </div>
        </div>

        <div
          class="stat-card"
          role="group"
          aria-label="Average response time"
        >
          <div
            class="stat-icon"
            style="background: rgba(59, 130, 246, 0.1)"
            aria-hidden="true"
          >
            <Icon
              icon="carbon:time"
              style="color: #3b82f6"
            />
          </div>
          <div class="stat-info">
            <span class="stat-label">Avg Response Time</span>
            <span
              class="stat-value"
              aria-label="Average response time in milliseconds"
            >{{
              formatResponseTime(currentAvgResponse)
            }}</span>
          </div>
        </div>

        <div
          class="stat-card"
          role="group"
          aria-label="Total checks"
        >
          <div
            class="stat-icon"
            style="background: rgba(139, 92, 246, 0.1)"
            aria-hidden="true"
          >
            <Icon
              icon="carbon:chart-line"
              style="color: #8b5cf6"
            />
          </div>
          <div class="stat-info">
            <span class="stat-label">Total Checks</span>
            <span
              class="stat-value"
              aria-label="Total number of checks"
            >N/A</span>
          </div>
        </div>

        <div
          class="stat-card"
          role="group"
          aria-label="Failed checks"
        >
          <div
            class="stat-icon"
            style="background: rgba(239, 68, 68, 0.1)"
            aria-hidden="true"
          >
            <Icon
              icon="carbon:warning-filled"
              style="color: #ef4444"
            />
          </div>
          <div class="stat-info">
            <span class="stat-label">Failed Checks</span>
            <span
              class="stat-value"
              aria-label="Number of failed checks"
            >N/A</span>
          </div>
        </div>
      </div>

      <!-- Latency Percentiles Section -->
      <div
        v-if="currentPercentiles"
        class="latency-percentiles"
        role="region"
        aria-label="Latency percentiles"
      >
        <h4
          class="section-title"
          :style="sectionTitleStyle"
        >
          <Icon
            icon="carbon:chart-histogram"
            class="section-icon"
            aria-hidden="true"
          />
          Latency Percentiles ({{ selectedRange }})
        </h4>
        <div class="percentile-grid">
          <div
            class="percentile-bar"
            role="group"
            aria-label="P50 median latency"
          >
            <div class="percentile-header">
              <span class="percentile-label">P50 (Median)</span>
              <span
                class="percentile-value"
                :aria-label="`P50 latency: ${formatResponseTime(currentPercentiles.p50)}`"
              >{{
                formatResponseTime(currentPercentiles.p50)
              }}</span>
            </div>
            <div
              class="bar-container"
              role="progressbar"
              :aria-valuenow="currentPercentiles.p50"
              :aria-valuemin="0"
              :aria-valuemax="maxPercentile"
              :aria-label="`P50 latency bar: ${currentPercentiles.p50} milliseconds`"
            >
              <div
                class="bar-fill"
                :style="{
                  width: `${(currentPercentiles.p50 / maxPercentile) * 100}%`,
                  background: '#22c55e',
                }"
              />
            </div>
          </div>

          <div
            class="percentile-bar"
            role="group"
            aria-label="P75 latency"
          >
            <div class="percentile-header">
              <span class="percentile-label">P75</span>
              <span
                class="percentile-value"
                :aria-label="`P75 latency: ${formatResponseTime(currentPercentiles.p75)}`"
              >{{
                formatResponseTime(currentPercentiles.p75)
              }}</span>
            </div>
            <div
              class="bar-container"
              role="progressbar"
              :aria-valuenow="currentPercentiles.p75"
              :aria-valuemin="0"
              :aria-valuemax="maxPercentile"
              :aria-label="`P75 latency bar: ${currentPercentiles.p75} milliseconds`"
            >
              <div
                class="bar-fill"
                :style="{
                  width: `${(currentPercentiles.p75 / maxPercentile) * 100}%`,
                  background: '#3b82f6',
                }"
              />
            </div>
          </div>

          <div
            class="percentile-bar"
            role="group"
            aria-label="P90 latency"
          >
            <div class="percentile-header">
              <span class="percentile-label">P90</span>
              <span
                class="percentile-value"
                :aria-label="`P90 latency: ${formatResponseTime(currentPercentiles.p90)}`"
              >{{
                formatResponseTime(currentPercentiles.p90)
              }}</span>
            </div>
            <div
              class="bar-container"
              role="progressbar"
              :aria-valuenow="currentPercentiles.p90"
              :aria-valuemin="0"
              :aria-valuemax="maxPercentile"
              :aria-label="`P90 latency bar: ${currentPercentiles.p90} milliseconds`"
            >
              <div
                class="bar-fill"
                :style="{
                  width: `${(currentPercentiles.p90 / maxPercentile) * 100}%`,
                  background: '#8b5cf6',
                }"
              />
            </div>
          </div>

          <div
            class="percentile-bar"
            role="group"
            aria-label="P95 latency"
          >
            <div class="percentile-header">
              <span class="percentile-label">P95</span>
              <span
                class="percentile-value"
                :aria-label="`P95 latency: ${formatResponseTime(currentPercentiles.p95)}`"
              >{{
                formatResponseTime(currentPercentiles.p95)
              }}</span>
            </div>
            <div
              class="bar-container"
              role="progressbar"
              :aria-valuenow="currentPercentiles.p95"
              :aria-valuemin="0"
              :aria-valuemax="maxPercentile"
              :aria-label="`P95 latency bar: ${currentPercentiles.p95} milliseconds`"
            >
              <div
                class="bar-fill"
                :style="{
                  width: `${(currentPercentiles.p95 / maxPercentile) * 100}%`,
                  background: '#f59e0b',
                }"
              />
            </div>
          </div>

          <div
            class="percentile-bar"
            role="group"
            aria-label="P99 latency"
          >
            <div class="percentile-header">
              <span class="percentile-label">P99</span>
              <span
                class="percentile-value"
                :aria-label="`P99 latency: ${formatResponseTime(currentPercentiles.p99)}`"
              >{{
                formatResponseTime(currentPercentiles.p99)
              }}</span>
            </div>
            <div
              class="bar-container"
              role="progressbar"
              :aria-valuenow="currentPercentiles.p99"
              :aria-valuemin="0"
              :aria-valuemax="maxPercentile"
              :aria-label="`P99 latency bar: ${currentPercentiles.p99} milliseconds`"
            >
              <div
                class="bar-fill"
                :style="{
                  width: `${(currentPercentiles.p99 / maxPercentile) * 100}%`,
                  background: '#ef4444',
                }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- No Percentiles Message -->
      <div
        v-else
        class="no-percentiles"
      >
        <Icon
          icon="carbon:chart-histogram"
          class="empty-icon"
        />
        <p :style="{ color: mutedTextColor }">
          No latency percentile data available for this time range
        </p>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else
      class="empty-state"
    >
      <Icon
        icon="carbon:chart-line"
        class="empty-icon"
      />
      <p :style="{ color: mutedTextColor }">
        No statistics available
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.stats-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  border-radius: 12px;
}

// Time Range Tabs
.time-range-tabs {
  display: flex;
  gap: 8px;
  padding: 4px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 8px;
  flex-wrap: wrap;

  button {
    flex: 1;
    min-width: 80px;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #94a3b8;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(148, 163, 184, 0.15);
      color: #64748b;
    }

    &:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    &:focus:not(:focus-visible) {
      outline: none;
    }

    &.active {
      background: #3b82f6;
      color: #ffffff;
      box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
    }
  }
}

// Stats Grid
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.05);
  border: 1px solid rgba(148, 163, 184, 0.1);
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  font-size: 20px;
  flex-shrink: 0;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.stat-label {
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 500;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// Latency Percentiles
.latency-percentiles {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 24px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.section-icon {
  font-size: 20px;
  color: #3b82f6;
}

.percentile-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.percentile-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.percentile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.percentile-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #64748b;
}

.percentile-value {
  font-size: 0.875rem;
  font-weight: 700;
  color: #1f2937;
}

.bar-container {
  width: 100%;
  height: 8px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

// Loading State
.loading-state {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.skeleton-card {
  height: 72px;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.1) 25%,
    rgba(148, 163, 184, 0.2) 50%,
    rgba(148, 163, 184, 0.1) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}

.skeleton-percentiles {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 24px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.skeleton-title {
  width: 200px;
  height: 24px;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.1) 25%,
    rgba(148, 163, 184, 0.2) 50%,
    rgba(148, 163, 184, 0.1) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

.skeleton-bar {
  height: 32px;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.1) 25%,
    rgba(148, 163, 184, 0.2) 50%,
    rgba(148, 163, 184, 0.1) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

// Empty States
.empty-state,
.no-percentiles {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  color: #94a3b8;
  opacity: 0.5;
}

// Mobile Responsive
@media (max-width: 768px) {
  .stats-panel {
    padding: 16px;
    gap: 20px;
  }

  .time-range-tabs {
    gap: 6px;

    button {
      min-width: 60px;
      padding: 6px 12px;
      font-size: 0.8rem;
    }
  }

  .stats-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
  }

  .stat-card {
    padding: 12px;
    gap: 10px;
  }

  .stat-icon {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }

  .stat-label {
    font-size: 0.7rem;
  }

  .stat-value {
    font-size: 1rem;
  }

  .section-title {
    font-size: 0.9rem;
  }

  .percentile-label,
  .percentile-value {
    font-size: 0.8rem;
  }
}

@media (max-width: 480px) {
  .stats-panel {
    padding: 12px;
    gap: 16px;
  }

  .time-range-tabs {
    gap: 4px;

    button {
      min-width: 50px;
      padding: 5px 8px;
      font-size: 0.75rem;
    }
  }

  .stats-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .stat-card {
    padding: 10px;
    gap: 8px;
  }

  .stat-icon {
    width: 28px;
    height: 28px;
    font-size: 14px;
  }

  .stat-label {
    font-size: 0.65rem;
  }

  .stat-value {
    font-size: 0.9rem;
  }

  .section-title {
    font-size: 0.85rem;
  }

  .section-icon {
    font-size: 16px;
  }

  .percentile-label,
  .percentile-value {
    font-size: 0.75rem;
  }

  .bar-container {
    height: 6px;
  }
}
</style>
