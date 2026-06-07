<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import { useAppStore, useUptimeStore } from "@/store";
import type { UptimeCheck } from "@/types/uptime";
import { formatTimestamp, formatRelativeTime } from "@/utils/format";
import config from "@/config";

const appStore = useAppStore();
const uptimeStore = useUptimeStore();

const props = defineProps<{
  monitorId: string;
  timeRange: "24h" | "7d" | "30d" | "90d";
}>();

interface Incident {
  id: string;
  startTime: number;
  endTime: number | null;
  duration: number;
  checkCount: number;
  firstError: string;
  status: "resolved" | "ongoing";
  affectedChecks: UptimeCheck[];
}

const loading = ref(false);
const incidents = ref<Incident[]>([]);

// Time range in milliseconds
const timeRangeMs = computed(() => {
  const ranges = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };
  return ranges[props.timeRange];
});

// Detect incidents from check sequence
function detectIncidents(checks: UptimeCheck[]): Incident[] {
  if (!checks || !Array.isArray(checks)) {
    return [];
  }

  const detectedIncidents: Incident[] = [];
  let currentIncident: Partial<Incident> | null = null;
  const affectedChecks: UptimeCheck[] = [];

  // Sort checks by time (oldest first)
  const sortedChecks = [...checks].sort((a, b) => a.checkedAt - b.checkedAt);

  for (const check of sortedChecks) {
    const isFailure = ["failure", "timeout", "error"].includes(check.status);

    if (isFailure) {
      if (!currentIncident) {
        // Start new incident
        currentIncident = {
          id: `incident-${check.checkedAt}`,
          startTime: check.checkedAt,
          endTime: null,
          duration: 0,
          checkCount: 1,
          firstError: check.error || check.message || "Unknown error",
          status: "ongoing",
          affectedChecks: [check],
        };
        affectedChecks.length = 0;
        affectedChecks.push(check);
      } else {
        // Continue current incident
        currentIncident.checkCount = (currentIncident.checkCount || 0) + 1;
        affectedChecks.push(check);
      }
    } else if (currentIncident) {
      // End current incident
      currentIncident.endTime = check.checkedAt;
      currentIncident.duration =
        currentIncident.endTime - (currentIncident.startTime || 0);
      currentIncident.status = "resolved";
      currentIncident.affectedChecks = [...affectedChecks];
      detectedIncidents.push(currentIncident as Incident);
      currentIncident = null;
      affectedChecks.length = 0;
    }
  }

  // Handle ongoing incident
  if (currentIncident) {
    const now = Date.now();
    currentIncident.endTime = now;
    currentIncident.duration = now - (currentIncident.startTime || 0);
    currentIncident.affectedChecks = [...affectedChecks];
    detectedIncidents.push(currentIncident as Incident);
  }

  // Return incidents in reverse chronological order (newest first)
  return detectedIncidents.reverse();
}

// Format duration
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// Fetch and analyze incidents
async function fetchIncidents() {
  loading.value = true;
  try {
    const now = Date.now();
    const from = new Date(now - timeRangeMs.value).toISOString();
    const to = new Date(now).toISOString();

    await uptimeStore.fetchMonitorChecks(props.monitorId, {
      from,
      to,
      limit: config.limitDataMax,
    });

    const checks = uptimeStore.selectedMonitorChecks;
    incidents.value = detectIncidents(checks);
  } catch (error) {
    console.error("Failed to fetch incidents:", error);
  } finally {
    loading.value = false;
  }
}

// Watch for changes
watch(() => [props.monitorId, props.timeRange], fetchIncidents, {
  immediate: false,
});

onMounted(() => {
  fetchIncidents();
});

// Computed styles
const borderColor = computed(() =>
  appStore.isDarkMode ? "#334155" : "#e5e7eb",
);
const bgColor = computed(() => (appStore.isDarkMode ? "#1e293b" : "#ffffff"));
const textColor = computed(() => (appStore.isDarkMode ? "#f1f5f9" : "#1f2937"));
const mutedTextColor = computed(() =>
  appStore.isDarkMode ? "#94a3b8" : "#6b7280",
);

const containerStyle = computed(() => ({
  background: bgColor.value,
  border: `1px solid ${borderColor.value}`,
  boxShadow: appStore.isDarkMode
    ? "0 2px 8px rgba(0, 0, 0, 0.3)"
    : "0 2px 8px rgba(0, 0, 0, 0.08)",
}));

const headerStyle = computed(() => ({
  color: textColor.value,
}));
</script>

<template>
  <div
    class="incident-timeline"
    :style="containerStyle"
  >
    <!-- Header -->
    <div class="timeline-header">
      <h3
        class="timeline-title"
        :style="headerStyle"
      >
        <Icon
          icon="carbon:warning-alt"
          class="title-icon"
        />
        Incident History
      </h3>
      <div class="incident-count">
        <span :style="{ color: mutedTextColor }">Total Incidents:</span>
        <span class="count-badge">{{ incidents.length }}</span>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="loading"
      class="loading-state"
    >
      <div class="skeleton-timeline">
        <div
          v-for="i in 3"
          :key="i"
          class="skeleton-incident"
        />
      </div>
    </div>

    <!-- Incidents List -->
    <div
      v-else-if="incidents.length > 0"
      class="incidents-list"
    >
      <div
        v-for="incident in incidents"
        :key="incident.id"
        class="incident-card"
        :class="{ ongoing: incident.status === 'ongoing' }"
      >
        <!-- Incident Header -->
        <div class="incident-header">
          <div class="incident-status">
            <Icon
              :icon="
                incident.status === 'ongoing'
                  ? 'carbon:warning-filled'
                  : 'carbon:checkmark-filled'
              "
              :class="
                incident.status === 'ongoing'
                  ? 'status-ongoing'
                  : 'status-resolved'
              "
            />
            <span class="status-label">
              {{ incident.status === "ongoing" ? "Ongoing" : "Resolved" }}
            </span>
          </div>
          <div class="incident-duration">
            <Icon
              icon="carbon:time"
              class="duration-icon"
            />
            <span>{{ formatDuration(incident.duration) }}</span>
          </div>
        </div>

        <!-- Incident Timeline -->
        <div class="incident-timeline-bar">
          <div class="timeline-point start">
            <div class="point-dot" />
            <div class="point-label">
              <span class="label-text">Started</span>
              <span class="label-time">{{
                formatTimestamp(incident.startTime)
              }}</span>
              <span class="label-relative">{{
                formatRelativeTime(incident.startTime)
              }}</span>
            </div>
          </div>

          <div
            class="timeline-line"
            :class="{ ongoing: incident.status === 'ongoing' }"
          />

          <div
            v-if="incident.endTime"
            class="timeline-point end"
          >
            <div class="point-dot" />
            <div class="point-label">
              <span class="label-text">{{
                incident.status === "ongoing" ? "Current" : "Resolved"
              }}</span>
              <span class="label-time">{{
                formatTimestamp(incident.endTime)
              }}</span>
              <span class="label-relative">{{
                formatRelativeTime(incident.endTime)
              }}</span>
            </div>
          </div>
        </div>

        <!-- Incident Details -->
        <div class="incident-details">
          <div class="detail-row">
            <Icon
              icon="carbon:error"
              class="detail-icon"
            />
            <span class="detail-label">Error:</span>
            <span class="detail-value">{{ incident.firstError }}</span>
          </div>
          <div class="detail-row">
            <Icon
              icon="carbon:data-check"
              class="detail-icon"
            />
            <span class="detail-label">Affected Checks:</span>
            <span class="detail-value">{{ incident.checkCount }}</span>
          </div>
        </div>

        <!-- Affected Checks (Expandable) -->
        <details class="affected-checks">
          <summary>
            <Icon
              icon="carbon:chevron-right"
              class="chevron-icon"
            />
            View Affected Checks ({{ incident.affectedChecks.length }})
          </summary>
          <div class="checks-list">
            <div
              v-for="check in incident.affectedChecks"
              :key="check.id"
              class="check-item"
            >
              <span class="check-time">{{
                formatTimestamp(check.checkedAt)
              }}</span>
              <span
                class="check-status"
                :class="`status-${check.status}`"
              >
                {{ check.status }}
              </span>
              <span class="check-message">{{
                check.error || check.message || "-"
              }}</span>
            </div>
          </div>
        </details>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else
      class="empty-state"
    >
      <Icon
        icon="carbon:checkmark-outline"
        class="empty-icon"
      />
      <p :style="{ color: mutedTextColor }">
        No incidents detected in the last {{ timeRange }}
      </p>
      <p
        class="empty-subtext"
        :style="{ color: mutedTextColor }"
      >
        Your monitor has been running smoothly!
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.incident-timeline {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  border-radius: 12px;
}

// Header
.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.timeline-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.title-icon {
  font-size: 24px;
  color: #f59e0b;
}

.incident-count {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.75rem;
}

// Loading State
.loading-state {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skeleton-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skeleton-incident {
  height: 200px;
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

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

// Incidents List
.incidents-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.incident-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-left: 4px solid #ef4444;
  border-radius: 8px;
  transition: all 0.2s ease;

  &.ongoing {
    background: rgba(245, 158, 11, 0.05);
    border-color: rgba(245, 158, 11, 0.2);
    border-left-color: #f59e0b;
    animation: pulse 2s ease-in-out infinite;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.9;
  }
}

// Incident Header
.incident-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.incident-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 0.875rem;

  .status-ongoing {
    color: #f59e0b;
    font-size: 18px;
  }

  .status-resolved {
    color: #22c55e;
    font-size: 18px;
  }
}

.status-label {
  color: #1f2937;
}

.incident-duration {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 600;
  color: #64748b;
}

.duration-icon {
  font-size: 16px;
}

// Timeline Bar
.incident-timeline-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
}

.timeline-point {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.point-dot {
  width: 12px;
  height: 12px;
  background: #ef4444;
  border: 3px solid rgba(239, 68, 68, 0.2);
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.1);
}

.timeline-point.end .point-dot {
  background: #22c55e;
  border-color: rgba(34, 197, 94, 0.2);
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.1);
}

.point-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
}

.label-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
}

.label-time {
  font-size: 0.875rem;
  font-weight: 500;
  color: #1f2937;
}

.label-relative {
  font-size: 0.75rem;
  color: #94a3b8;
}

.timeline-line {
  flex: 1;
  height: 3px;
  background: linear-gradient(to right, #ef4444, #22c55e);
  border-radius: 2px;
  position: relative;

  &.ongoing {
    background: linear-gradient(to right, #ef4444, #f59e0b);
    animation: lineGlow 2s ease-in-out infinite;
  }
}

@keyframes lineGlow {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

// Incident Details
.incident-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: rgba(148, 163, 184, 0.05);
  border-radius: 6px;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
}

.detail-icon {
  font-size: 16px;
  color: #64748b;
  flex-shrink: 0;
}

.detail-label {
  font-weight: 600;
  color: #64748b;
  flex-shrink: 0;
}

.detail-value {
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// Affected Checks
.affected-checks {
  margin-top: 8px;

  summary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(148, 163, 184, 0.05);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 600;
    color: #64748b;
    transition: all 0.2s ease;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &:hover {
      background: rgba(148, 163, 184, 0.1);
    }
  }

  &[open] summary {
    margin-bottom: 12px;

    .chevron-icon {
      transform: rotate(90deg);
    }
  }
}

.chevron-icon {
  font-size: 16px;
  transition: transform 0.2s ease;
}

.checks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px;
}

.check-item {
  display: grid;
  grid-template-columns: 180px 100px 1fr;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(148, 163, 184, 0.03);
  border-radius: 4px;
  font-size: 0.8125rem;
  align-items: center;
}

.check-time {
  color: #64748b;
  font-weight: 500;
}

.check-status {
  padding: 2px 8px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.75rem;
  text-align: center;

  &.status-failure {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  &.status-timeout {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
  }

  &.status-error {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
  }
}

.check-message {
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// Empty State
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  color: #22c55e;
  opacity: 0.5;
}

.empty-subtext {
  font-size: 0.875rem;
  margin-top: -8px;
}

// Mobile Responsive
@media (max-width: 768px) {
  .incident-timeline {
    padding: 16px;
    gap: 16px;
  }

  .timeline-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .timeline-title {
    font-size: 1rem;
  }

  .title-icon {
    font-size: 20px;
  }

  .incident-card {
    padding: 16px;
    gap: 12px;
  }

  .incident-timeline-bar {
    flex-direction: column;
    gap: 12px;
  }

  .timeline-line {
    width: 3px;
    height: 40px;
    background: linear-gradient(to bottom, #ef4444, #22c55e);

    &.ongoing {
      background: linear-gradient(to bottom, #ef4444, #f59e0b);
    }
  }

  .check-item {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .check-time {
    font-size: 0.75rem;
  }

  .check-status {
    width: fit-content;
  }
}

@media (max-width: 480px) {
  .incident-timeline {
    padding: 12px;
    gap: 12px;
  }

  .timeline-title {
    font-size: 0.9rem;
  }

  .title-icon {
    font-size: 18px;
  }

  .incident-card {
    padding: 12px;
    gap: 10px;
  }

  .incident-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .label-time {
    font-size: 0.75rem;
  }

  .label-relative {
    font-size: 0.7rem;
  }

  .detail-row {
    font-size: 0.8rem;
  }

  .empty-state {
    padding: 32px 16px;
  }

  .empty-icon {
    font-size: 48px;
  }
}
</style>
