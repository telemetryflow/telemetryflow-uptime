<script setup lang="ts">
/**
 * MonitorDetail View
 * Task 12: Create MonitorDetail view
 *
 * Features:
 * - Fetch monitor details, stats, and checks on mount using monitorId from route params
 * - Display monitor configuration fields (name, URL, type, interval, timeout, active status)
 * - Show paused indicator when isPaused=true
 * - Display tags if present
 * - Integrate StatsPanel component for metrics
 * - Integrate CheckHistory component for check history
 * - Integrate ResponseTimeChart component for trends
 * - Integrate IncidentTimeline component for incident history
 * - Handle 404 error with redirect to monitor list
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { ref, computed, onMounted, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { Icon } from "@iconify/vue";
import {
  NButton,
  NTag,
  NSpace,
  NSpin,
  NAlert,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NTooltip,
  useMessage,
} from "naive-ui";
import { useUptimeStore } from "@/store";
import StatsPanel from "@/components/monitoring/StatsPanel.vue";
import CheckHistory from "@/components/monitoring/CheckHistory.vue";
import ResponseTimeChart from "@/components/monitoring/ResponseTimeChart.vue";
import IncidentTimeline from "@/components/monitoring/IncidentTimeline.vue";
import { MONITOR_TYPES, MONITOR_STATUS } from "@/types/uptime";

const router = useRouter();
const route = useRoute();
const message = useMessage();
const uptimeStore = useUptimeStore();

// ==================== STATE ====================

const monitorId = computed(() => route.params.id as string);
const loading = ref(false);
const error = ref<string | null>(null);

// ==================== COMPUTED ====================

const monitor = computed(() => uptimeStore.selectedMonitor);
const stats = computed(() => uptimeStore.selectedMonitorStats);
const checks = computed(() => uptimeStore.selectedMonitorChecks);

const loadingMonitor = computed(() => uptimeStore.loadingMonitor);
const loadingStats = computed(() => uptimeStore.loadingStats);
const loadingChecks = computed(() => uptimeStore.loadingChecks);

const monitorError = computed(() => uptimeStore.monitorError);
const statsError = computed(() => uptimeStore.statsError);
const checksError = computed(() => uptimeStore.checksError);

const hasError = computed(
  () =>
    error.value || monitorError.value || statsError.value || checksError.value,
);

const errorMessage = computed(
  () =>
    error.value || monitorError.value || statsError.value || checksError.value,
);

const typeInfo = computed(() => {
  if (!monitor.value) return null;
  return MONITOR_TYPES[monitor.value.type];
});

const statusInfo = computed(() => {
  if (!monitor.value) return null;
  return MONITOR_STATUS[monitor.value.status];
});

const isPaused = computed(() => monitor.value?.isPaused || false);

const isActive = computed(() => monitor.value?.isActive || false);

// ==================== METHODS ====================

async function fetchMonitorData() {
  if (!monitorId.value) {
    error.value = "Monitor ID is required";
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    // Fetch monitor details, stats, and checks in parallel
    await uptimeStore.selectMonitor(monitorId.value);
  } catch (err: any) {
    console.error("[MonitorDetail] Failed to fetch monitor data:", err);
    error.value = err.message || "Failed to load monitor details";

    // Handle 404 error - redirect to monitor list
    if (err.response?.status === 404 || err.message?.includes("not found")) {
      message.error("Monitor not found. It may have been deleted.");
      setTimeout(() => {
        router.push({ name: "UptimeMonitoring" });
      }, 2000);
    }
  } finally {
    loading.value = false;
  }
}

function handleBack() {
  router.push({ name: "UptimeMonitoring" });
}

function handleEdit() {
  if (monitor.value) {
    // Navigate to edit mode or open edit modal
    router.push({
      name: "UptimeMonitoring",
      query: { edit: monitor.value.id },
    });
  }
}

function handleRefresh() {
  fetchMonitorData();
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function formatTimestamp(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ==================== LIFECYCLE ====================

onMounted(() => {
  fetchMonitorData();
});

// Watch for route changes (if navigating between different monitors)
watch(
  () => route.params.id,
  (newId) => {
    if (newId && newId !== monitorId.value) {
      fetchMonitorData();
    }
  },
);
</script>

<template>
  <div
    class="monitor-detail-page"
    role="main"
    aria-label="Monitor detail page"
  >
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <NButton
          text
          aria-label="Go back to monitor list"
          @click="handleBack"
        >
          <template #icon>
            <Icon
              icon="carbon:arrow-left"
              aria-hidden="true"
            />
          </template>
        </NButton>
        <div class="header-title-section">
          <h1 class="page-title">
            <Icon
              icon="carbon:activity"
              class="title-icon"
              aria-hidden="true"
            />
            <span v-if="monitor">{{ monitor.name }}</span>
            <span v-else>Monitor Details</span>
          </h1>
          <p
            v-if="monitor"
            class="page-subtitle"
          >
            {{ monitor.url }}
          </p>
        </div>
      </div>
      <div class="header-right">
        <NButton
          v-if="monitor"
          aria-label="Edit monitor configuration"
          @click="handleEdit"
        >
          <template #icon>
            <Icon
              icon="carbon:edit"
              aria-hidden="true"
            />
          </template>
          Edit
        </NButton>
        <NButton
          aria-label="Refresh monitor data"
          @click="handleRefresh"
        >
          <template #icon>
            <Icon
              icon="carbon:renew"
              aria-hidden="true"
            />
          </template>
          Refresh
        </NButton>
      </div>
    </div>

    <!-- Error State -->
    <NAlert
      v-if="hasError && !loading"
      type="error"
      class="error-alert"
      closable
      role="alert"
      aria-live="assertive"
      @close="uptimeStore.clearErrors()"
    >
      <template #header>
        <div class="error-header">
          <Icon
            icon="carbon:warning"
            class="error-icon"
            aria-hidden="true"
          />
          <span>Failed to load monitor details</span>
        </div>
      </template>
      <div class="error-content">
        <p>{{ errorMessage }}</p>
        <NButton
          size="small"
          type="primary"
          aria-label="Retry loading monitor data"
          @click="handleRefresh"
        >
          <template #icon>
            <Icon
              icon="carbon:renew"
              aria-hidden="true"
            />
          </template>
          Retry
        </NButton>
      </div>
    </NAlert>

    <!-- Loading State -->
    <div
      v-if="loading && !monitor"
      class="loading-container"
      role="status"
      aria-live="polite"
      aria-label="Loading monitor details"
    >
      <NSpin size="large">
        <template #description>
          Loading monitor details...
        </template>
      </NSpin>
    </div>

    <!-- Monitor Details Content -->
    <div
      v-else-if="monitor"
      class="detail-content"
    >
      <!-- Monitor Configuration Card -->
      <NCard
        title="Monitor Configuration"
        class="config-card"
      >
        <template #header-extra>
          <NSpace :size="8">
            <!-- Paused Indicator -->
            <NTooltip v-if="isPaused">
              <template #trigger>
                <NTag
                  type="warning"
                  :bordered="false"
                  round
                  role="status"
                  aria-label="Monitor is paused"
                >
                  <template #icon>
                    <Icon
                      icon="carbon:pause-filled"
                      aria-hidden="true"
                    />
                  </template>
                  Paused
                </NTag>
              </template>
              This monitor is currently paused and not performing checks
            </NTooltip>

            <!-- Active Status -->
            <NTag
              :type="isActive ? 'success' : 'default'"
              :bordered="false"
              round
              role="status"
              :aria-label="`Monitor is ${isActive ? 'active' : 'inactive'}`"
            >
              <template #icon>
                <Icon
                  :icon="
                    isActive ? 'carbon:checkmark-filled' : 'carbon:close-filled'
                  "
                  aria-hidden="true"
                />
              </template>
              {{ isActive ? "Active" : "Inactive" }}
            </NTag>

            <!-- Monitor Status -->
            <NTag
              v-if="statusInfo"
              :type="statusInfo.color as any"
              :bordered="false"
              round
              role="status"
              :aria-label="`Monitor status: ${statusInfo.label}`"
            >
              <template #icon>
                <Icon
                  :icon="statusInfo.icon"
                  aria-hidden="true"
                />
              </template>
              {{ statusInfo.label }}
            </NTag>

            <!-- Monitor Type -->
            <NTag
              v-if="typeInfo"
              :bordered="false"
              round
              :aria-label="`Monitor type: ${typeInfo.label}`"
            >
              <template #icon>
                <Icon
                  :icon="typeInfo.icon"
                  aria-hidden="true"
                />
              </template>
              {{ typeInfo.label }}
            </NTag>
          </NSpace>
        </template>

        <NDescriptions
          :column="2"
          bordered
        >
          <NDescriptionsItem label="Name">
            {{ monitor.name }}
          </NDescriptionsItem>
          <NDescriptionsItem label="URL">
            <a
              :href="monitor.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ monitor.url }}
              <Icon
                icon="carbon:launch"
                style="margin-left: 4px"
              />
            </a>
          </NDescriptionsItem>
          <NDescriptionsItem label="Type">
            {{ typeInfo?.label || monitor.type }}
          </NDescriptionsItem>
          <NDescriptionsItem label="Status">
            {{ statusInfo?.label || monitor.status }}
          </NDescriptionsItem>
          <NDescriptionsItem label="Check Interval">
            {{ formatInterval(monitor.interval) }}
          </NDescriptionsItem>
          <NDescriptionsItem label="Timeout">
            {{ formatInterval(monitor.timeout) }}
          </NDescriptionsItem>
          <NDescriptionsItem label="Retries">
            {{ monitor.retries }}
          </NDescriptionsItem>
          <NDescriptionsItem label="Last Check">
            {{
              monitor.lastCheckAt
                ? formatTimestamp(monitor.lastCheckAt)
                : "Never"
            }}
          </NDescriptionsItem>
          <NDescriptionsItem
            v-if="monitor.description"
            label="Description"
            :span="2"
          >
            {{ monitor.description }}
          </NDescriptionsItem>
          <NDescriptionsItem
            v-if="monitor.tags.length > 0"
            label="Tags"
            :span="2"
          >
            <NSpace :size="8">
              <NTag
                v-for="tag in monitor.tags"
                :key="tag"
                type="info"
                :bordered="false"
                size="small"
              >
                {{ tag }}
              </NTag>
            </NSpace>
          </NDescriptionsItem>

          <!-- Type-specific configuration fields -->
          <!-- HTTP/HTTPS specific fields -->
          <template v-if="monitor.type === 'http' || monitor.type === 'https'">
            <NDescriptionsItem
              v-if="monitor.httpMethod"
              label="HTTP Method"
            >
              <NTag
                type="info"
                :bordered="false"
                size="small"
              >
                {{ monitor.httpMethod }}
              </NTag>
            </NDescriptionsItem>
            <NDescriptionsItem
              v-if="
                monitor.acceptedStatusCodes &&
                  monitor.acceptedStatusCodes.length > 0
              "
              label="Accepted Status Codes"
            >
              <NSpace :size="4">
                <NTag
                  v-for="code in monitor.acceptedStatusCodes"
                  :key="code"
                  type="success"
                  :bordered="false"
                  size="small"
                >
                  {{ code }}
                </NTag>
              </NSpace>
            </NDescriptionsItem>
            <NDescriptionsItem
              v-if="
                monitor.httpHeaders &&
                  Object.keys(monitor.httpHeaders).length > 0
              "
              label="HTTP Headers"
              :span="2"
            >
              <div class="http-headers">
                <div
                  v-for="(value, key) in monitor.httpHeaders"
                  :key="key"
                  class="header-item"
                >
                  <span class="header-key">{{ key }}:</span>
                  <span class="header-value">{{ value }}</span>
                </div>
              </div>
            </NDescriptionsItem>
            <NDescriptionsItem
              v-if="monitor.httpBody"
              label="HTTP Body"
              :span="2"
            >
              <pre class="http-body">{{ monitor.httpBody }}</pre>
            </NDescriptionsItem>
            <NDescriptionsItem
              v-if="monitor.maxRedirects !== undefined"
              label="Max Redirects"
            >
              {{ monitor.maxRedirects }}
            </NDescriptionsItem>
            <NDescriptionsItem
              v-if="monitor.ignoreTlsErrors !== undefined"
              label="Ignore TLS Errors"
            >
              <NTag
                :type="monitor.ignoreTlsErrors ? 'warning' : 'success'"
                :bordered="false"
                size="small"
              >
                {{ monitor.ignoreTlsErrors ? "Yes" : "No" }}
              </NTag>
            </NDescriptionsItem>
          </template>

          <!-- SSL Certificate specific fields -->
          <template
            v-if="
              monitor.type === 'https' || monitor.type === 'ssl_certificate'
            "
          >
            <NDescriptionsItem
              v-if="monitor.sslExpiryWarningDays !== undefined"
              label="SSL Expiry Warning (days)"
            >
              {{ monitor.sslExpiryWarningDays }}
            </NDescriptionsItem>
          </template>
        </NDescriptions>
      </NCard>

      <!-- Stats Panel -->
      <div class="stats-section">
        <h2 class="section-title">
          <Icon
            icon="carbon:chart-line"
            class="section-icon"
            aria-hidden="true"
          />
          Statistics & Metrics
        </h2>
        <StatsPanel
          :stats="stats"
          :loading="loadingStats"
        />
      </div>

      <!-- Response Time Chart -->
      <div class="chart-section">
        <h2 class="section-title">
          <Icon
            icon="carbon:chart-area"
            class="section-icon"
            aria-hidden="true"
          />
          Response Time Trends
        </h2>
        <ResponseTimeChart
          :checks="checks"
          :loading="loadingChecks"
        />
      </div>

      <!-- Check History -->
      <div class="history-section">
        <h2 class="section-title">
          <Icon
            icon="carbon:list"
            class="section-icon"
            aria-hidden="true"
          />
          Check History
        </h2>
        <CheckHistory
          :checks="checks"
          :loading="loadingChecks"
          :monitor-id="monitorId"
        />
      </div>

      <!-- Incident Timeline -->
      <div class="incidents-section">
        <h2 class="section-title">
          <Icon
            icon="carbon:warning-alt"
            class="section-icon"
            aria-hidden="true"
          />
          Incident History
        </h2>
        <IncidentTimeline
          :monitor-id="monitorId"
          time-range="30d"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.monitor-detail-page {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
}

.header-title-section {
  flex: 1;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 600;
  color: var(--n-text-color);
}

.title-icon {
  font-size: 32px;
  color: var(--n-color-target);
}

.page-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--n-text-color-3);
  word-break: break-all;
}

.header-right {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.error-alert {
  margin-bottom: 24px;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.error-icon {
  font-size: 20px;
}

.error-content {
  display: flex;
  flex-direction: column;
  gap: 12px;

  p {
    margin: 0;
  }
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.config-card {
  :deep(.n-card__header) {
    padding: 20px 24px;
  }

  :deep(.n-card__content) {
    padding: 24px;
  }

  a {
    color: var(--n-color-target);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;

    &:hover {
      text-decoration: underline;
    }
  }

  .http-headers {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-family: "Courier New", monospace;
    font-size: 13px;
  }

  .header-item {
    display: flex;
    gap: 8px;
    padding: 4px 8px;
    background-color: var(--n-color-hover);
    border-radius: 4px;
  }

  .header-key {
    font-weight: 600;
    color: var(--n-text-color);
  }

  .header-value {
    color: var(--n-text-color-2);
    word-break: break-all;
  }

  .http-body {
    margin: 0;
    padding: 12px;
    background-color: var(--n-color-hover);
    border-radius: 4px;
    font-family: "Courier New", monospace;
    font-size: 13px;
    line-height: 1.5;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 16px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--n-text-color);
}

.section-icon {
  font-size: 24px;
  color: var(--n-color-target);
}

.stats-section,
.chart-section,
.history-section,
.incidents-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// Responsive styles
@media (max-width: 768px) {
  .monitor-detail-page {
    padding: 16px;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-left {
    flex-direction: column;
    gap: 8px;
  }

  .header-right {
    width: 100%;

    :deep(.n-button) {
      flex: 1;
    }
  }

  .page-title {
    font-size: 24px;
    flex-wrap: wrap;
  }

  .title-icon {
    font-size: 28px;
  }

  .config-card {
    :deep(.n-descriptions) {
      --n-th-padding: 12px;
      --n-td-padding: 12px;
    }

    :deep(.n-descriptions-table-wrapper) {
      overflow-x: auto;
    }
  }

  .section-title {
    font-size: 18px;
  }

  .section-icon {
    font-size: 20px;
  }
}

@media (max-width: 480px) {
  .monitor-detail-page {
    padding: 12px;
  }

  .page-title {
    font-size: 20px;
  }

  .title-icon {
    font-size: 24px;
  }

  .page-subtitle {
    font-size: 13px;
  }

  .config-card {
    :deep(.n-card__header) {
      padding: 16px;
    }

    :deep(.n-card__content) {
      padding: 16px;
    }

    :deep(.n-descriptions) {
      --n-th-padding: 8px;
      --n-td-padding: 8px;
    }
  }

  .section-title {
    font-size: 16px;
  }

  .section-icon {
    font-size: 18px;
  }
}
</style>
