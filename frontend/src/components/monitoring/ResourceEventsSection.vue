<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { NTimeline, NTimelineItem, NSpin } from "naive-ui";
import type { ResourceEvent } from "@/composables/useResourceEvents";

defineProps<{
  events: ResourceEvent[];
  loading?: boolean;
  maxItems?: number;
}>();

type NaiveTimelineType = "default" | "error" | "info" | "success" | "warning";

const SEVERITY_CONFIG: Record<string, {
  timelineType: NaiveTimelineType;
  label: string;
  labelBg: string;
  labelColor: string;
  msgBg: string;
  msgBorder: string;
  msgColor: string;
  msgBgDark: string;
  msgBorderDark: string;
  msgColorDark: string;
}> = {
  trace:   { timelineType: "default",  label: "TRACE",   labelBg: "#f1f5f9",           labelColor: "#64748b", msgBg: "#f8fafc",           msgBorder: "#e2e8f0",           msgColor: "#475569", msgBgDark: "rgba(100,116,139,0.15)", msgBorderDark: "rgba(100,116,139,0.3)", msgColorDark: "#94a3b8" },
  debug:   { timelineType: "default",  label: "DEBUG",   labelBg: "#eff6ff",           labelColor: "#3b82f6", msgBg: "#eff6ff",           msgBorder: "#bfdbfe",           msgColor: "#1d4ed8", msgBgDark: "rgba(59,130,246,0.12)",  msgBorderDark: "rgba(59,130,246,0.3)",  msgColorDark: "#93c5fd" },
  info:    { timelineType: "info",     label: "INFO",    labelBg: "#ecfdf5",           labelColor: "#10b981", msgBg: "#ecfdf5",           msgBorder: "#a7f3d0",           msgColor: "#065f46", msgBgDark: "rgba(16,185,129,0.12)",  msgBorderDark: "rgba(16,185,129,0.3)",  msgColorDark: "#6ee7b7" },
  normal:  { timelineType: "success",  label: "NORMAL",  labelBg: "#ecfdf5",           labelColor: "#10b981", msgBg: "#ecfdf5",           msgBorder: "#a7f3d0",           msgColor: "#065f46", msgBgDark: "rgba(16,185,129,0.12)",  msgBorderDark: "rgba(16,185,129,0.3)",  msgColorDark: "#6ee7b7" },
  warn:    { timelineType: "warning",  label: "WARN",    labelBg: "#fffbeb",           labelColor: "#d97706", msgBg: "#fffbeb",           msgBorder: "#fcd34d",           msgColor: "#92400e", msgBgDark: "rgba(217,119,6,0.15)",   msgBorderDark: "rgba(217,119,6,0.3)",   msgColorDark: "#fbbf24" },
  warning: { timelineType: "warning",  label: "WARNING", labelBg: "#fffbeb",           labelColor: "#d97706", msgBg: "#fffbeb",           msgBorder: "#fcd34d",           msgColor: "#92400e", msgBgDark: "rgba(217,119,6,0.15)",   msgBorderDark: "rgba(217,119,6,0.3)",   msgColorDark: "#fbbf24" },
  error:   { timelineType: "error",    label: "ERROR",   labelBg: "#fef2f2",           labelColor: "#dc2626", msgBg: "#fef2f2",           msgBorder: "#fecaca",           msgColor: "#991b1b", msgBgDark: "rgba(220,38,38,0.15)",   msgBorderDark: "rgba(220,38,38,0.3)",   msgColorDark: "#fca5a5" },
  fatal:   { timelineType: "error",    label: "FATAL",   labelBg: "rgba(168,85,247,0.12)", labelColor: "#a855f7", msgBg: "rgba(168,85,247,0.08)", msgBorder: "rgba(168,85,247,0.35)", msgColor: "#6b21a8", msgBgDark: "rgba(168,85,247,0.18)", msgBorderDark: "rgba(168,85,247,0.4)", msgColorDark: "#d8b4fe" },
};

function getSeverityConfig(type: string) {
  return SEVERITY_CONFIG[type.toLowerCase()] ?? SEVERITY_CONFIG.info;
}

function formatEventTime(ts: number): string {
  if (!ts) return "-";
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  const diffSec = Math.floor(diff / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  let relative: string;
  if (diffDay > 0) relative = `${diffDay}d${diffHour % 24}h ago`;
  else if (diffHour > 0) relative = `${diffHour}h${diffMin % 60}m ago`;
  else if (diffMin > 0) relative = `${diffMin}m${diffSec % 60}s ago`;
  else relative = `${diffSec}s ago`;

  const absolute = d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${relative} (${absolute})`;
}
</script>

<template>
  <div class="events-section">
    <div class="section-label">
      <Icon icon="carbon:event-schedule" />
      <span>Events</span>
      <span
        v-if="events.length > 0"
        class="event-count"
      >({{ events.length }})</span>
    </div>

    <n-spin
      :show="loading"
      size="small"
    >
      <div class="tfo-events-container">
        <n-timeline v-if="events.length > 0">
          <n-timeline-item
            v-for="(event, idx) in events.slice(0, maxItems || 50)"
            :key="idx"
            :type="getSeverityConfig(event.type).timelineType"
          >
            <template #header>
              <div class="tfo-event-header">
                <span
                  class="tfo-severity-badge"
                  :style="{
                    background: getSeverityConfig(event.type).labelBg,
                    color: getSeverityConfig(event.type).labelColor,
                  }"
                >{{ getSeverityConfig(event.type).label }}</span>
                <span class="tfo-event-reason">{{ event.reason }}</span>
              </div>
            </template>
            <div class="tfo-event-content">
              <div
                class="tfo-event-message-box"
                :style="{
                  background: getSeverityConfig(event.type).msgBg,
                  borderColor: getSeverityConfig(event.type).msgBorder,
                }"
                :data-severity="event.type.toLowerCase()"
              >
                <code :style="{ color: getSeverityConfig(event.type).msgColor }">{{ event.message }}</code>
              </div>
              <table class="tfo-event-details-table">
                <tbody>
                  <tr>
                    <td class="tfo-event-detail-label">
                      Source
                    </td>
                    <td class="tfo-event-detail-value">
                      {{ event.source || "-" }}
                    </td>
                  </tr>
                  <tr>
                    <td class="tfo-event-detail-label">
                      Count
                    </td>
                    <td class="tfo-event-detail-value">
                      {{ event.count }}
                    </td>
                  </tr>
                  <tr v-if="event.firstSeen">
                    <td class="tfo-event-detail-label">
                      First seen
                    </td>
                    <td class="tfo-event-detail-value">
                      {{ formatEventTime(event.firstSeen) }}
                    </td>
                  </tr>
                  <tr>
                    <td class="tfo-event-detail-label">
                      Last seen
                    </td>
                    <td class="tfo-event-detail-value">
                      {{ formatEventTime(event.lastSeen) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </n-timeline-item>
        </n-timeline>
        <div
          v-else
          class="tfo-events-empty"
        >
          <Icon
            icon="carbon:checkmark-outline"
            class="tfo-events-empty-icon"
          />
          <span>No events recorded</span>
        </div>
      </div>
    </n-spin>
  </div>
</template>

<style scoped lang="scss">
.events-section {
  margin-top: 4px;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 0.8125rem;
  margin-bottom: 12px;
  color: var(--n-text-color);
}

.event-count {
  font-weight: 400;
  color: var(--n-text-color-3);
  font-size: 0.75rem;
}

.tfo-events-container {
  padding: 16px 20px;
  background: #f8fafc;
  border: 1px solid var(--k8s-border-color, #e2e8f0);
  border-radius: 8px;
  min-height: 350px;
  max-height: 900px;
  overflow-y: auto;

  :root.dark & {
    background: #0f172a;
    border-color: var(--k8s-border-color, #1e293b);
  }

  :deep(.n-timeline) {
    .n-timeline-item {
      padding-bottom: 20px;

      &:last-child {
        padding-bottom: 0;
      }
    }

    .n-timeline-item-timeline__line {
      background-color: var(--k8s-border-color, #e2e8f0) !important;
    }

    .n-timeline-item-content__title {
      font-weight: 600;
      font-size: 0.9375rem;
      color: var(--n-text-color);
      margin-bottom: 4px;
    }
  }
}

.tfo-event-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.tfo-severity-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  flex-shrink: 0;
}

.tfo-event-reason {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--n-text-color);
}

.tfo-event-content {
  margin-top: 2px;
  padding-top: 2px;
}

.tfo-event-message-box {
  border: 1px solid;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;

  code {
    font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-size: 0.75rem;
    line-height: 1.5;
    word-break: break-word;
    white-space: pre-wrap;
    display: block;
  }
}

.tfo-event-details-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: #ffffff;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--k8s-border-color, #e2e8f0);

  :root.dark & {
    background: #0f172a;
    border-color: var(--k8s-border-color, #1e293b);
  }

  tr {
    &:not(:last-child) td {
      border-bottom: 1px solid var(--k8s-border-color, #e2e8f0);

      :root.dark & {
        border-color: var(--k8s-border-color, #1e293b);
      }
    }
  }

  td {
    padding: 8px 12px;
    font-size: 0.8125rem;
    vertical-align: middle;
  }

  .tfo-event-detail-label {
    width: 140px;
    min-width: 120px;
    color: #6b7280;
    font-weight: 600;
    font-size: 0.75rem;
    background: #f3f4f6;
    border-right: 1px solid var(--k8s-border-color, #e2e8f0);

    :root.dark & {
      color: #94a3b8;
      background: #1e293b;
      border-right-color: var(--k8s-border-color, #1e293b);
    }
  }

  .tfo-event-detail-value {
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

.tfo-events-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--n-text-color-3);
  font-size: 0.875rem;
}

.tfo-events-empty-icon {
  font-size: 20px;
  color: #22c55e;
}
</style>
