<script setup lang="ts">
import { ref, computed, watch, h } from "vue";
import { Icon } from "@iconify/vue";
import { useAppStore } from "@/store";
import type { UptimeCheck } from "@/types/uptime";
import { CHECK_STATUS, formatResponseTime } from "@/types/uptime";
import { formatTimestamp } from "@/utils/format";
import type { DataTableColumn } from "naive-ui";

const appStore = useAppStore();

const props = defineProps<{
  checks: UptimeCheck[];
  loading?: boolean;
  monitorId: string;
}>();

type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d";

const selectedTimeRange = ref<TimeRange>("24h");
const currentPage = ref(1);
const pageSize = ref(20);

// Time range configurations
const timeRanges: Array<{ value: TimeRange; label: string }> = [
  { value: "1h", label: "1 Hour" },
  { value: "6h", label: "6 Hours" },
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

// Filter checks by selected time range
const filteredChecks = computed(() => {
  const now = Date.now();
  const ranges: Record<TimeRange, number> = {
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };

  const cutoff = now - ranges[selectedTimeRange.value];
  return props.checks.filter((check) => check.checkedAt >= cutoff);
});

// Sort checks in reverse chronological order (newest first)
const sortedChecks = computed(() => {
  return [...filteredChecks.value].sort((a, b) => b.checkedAt - a.checkedAt);
});

// Paginated checks
const paginatedChecks = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return sortedChecks.value.slice(start, end);
});

// Total pages
const totalPages = computed(() => {
  return Math.ceil(sortedChecks.value.length / pageSize.value);
});

// Reset to page 1 when time range changes
watch(selectedTimeRange, () => {
  currentPage.value = 1;
});

// Table columns
const columns = computed<DataTableColumn<UptimeCheck>[]>(() => [
  {
    title: "Timestamp",
    key: "checkedAt",
    width: 180,
    render: (row) => formatTimestamp(row.checkedAt),
  },
  {
    title: "Status",
    key: "status",
    width: 120,
    render: (row) => {
      const statusConfig = CHECK_STATUS[row.status];
      return h("div", { class: "status-cell" }, [
        h(
          "span",
          {
            class: `status-badge status-${row.status}`,
          },
          statusConfig.label,
        ),
      ]);
    },
  },
  {
    title: "Response Time",
    key: "responseTime",
    width: 140,
    render: (row) => formatResponseTime(row.responseTime),
  },
  {
    title: "Status Code",
    key: "statusCode",
    width: 120,
    render: (row) => row.statusCode?.toString() || "-",
  },
  {
    title: "Region",
    key: "region",
    width: 120,
    render: (row) => row.region || "-",
  },
  {
    title: "Message",
    key: "message",
    ellipsis: {
      tooltip: true,
    },
    render: (row) => row.message || row.error || "-",
  },
]);

// Row class name based on status
function getRowClassName(row: UptimeCheck): string {
  return `check-row check-row-${row.status}`;
}

// Computed styles for dark/light mode
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

// Pagination
function handlePageChange(page: number) {
  currentPage.value = page;
}

function handlePageSizeChange(size: number) {
  pageSize.value = size;
  currentPage.value = 1;
}
</script>

<template>
  <div
    class="check-history"
    :style="containerStyle"
    role="region"
    aria-label="Check history"
  >
    <!-- Header -->
    <div class="history-header">
      <h3
        class="history-title"
        :style="headerStyle"
      >
        <Icon
          icon="carbon:time"
          class="title-icon"
          aria-hidden="true"
        />
        Check History
      </h3>

      <!-- Time Range Selector -->
      <div
        class="time-range-selector"
        role="group"
        aria-label="Time range filter"
      >
        <button
          v-for="range in timeRanges"
          :key="range.value"
          :aria-pressed="selectedTimeRange === range.value"
          :aria-label="`Filter checks for ${range.label}`"
          :class="{ active: selectedTimeRange === range.value }"
          @click="selectedTimeRange = range.value"
        >
          {{ range.label }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="loading"
      class="loading-state"
    >
      <div class="skeleton-table">
        <div
          v-for="i in 5"
          :key="i"
          class="skeleton-row"
        />
      </div>
    </div>

    <!-- Checks Table -->
    <div
      v-else-if="sortedChecks.length > 0"
      class="checks-table-container"
    >
      <n-data-table
        :columns="columns"
        :data="paginatedChecks"
        :scroll-x="900"
        :row-key="(row: UptimeCheck) => row.id"
        :row-class-name="getRowClassName"
        :striped="true"
        :bordered="false"
        :bottom-bordered="true"
        :single-line="false"
        size="medium"
        :pagination="false"
        role="table"
        aria-label="Check history table"
      />

      <!-- Pagination Controls -->
      <div
        v-if="totalPages > 1"
        class="pagination-controls"
        role="navigation"
        aria-label="Check history pagination"
      >
        <n-pagination
          v-model:page="currentPage"
          v-model:page-size="pageSize"
          :page-count="totalPages"
          :page-sizes="[10, 20, 50, 100]"
          show-size-picker
          :show-quick-jumper="totalPages > 5"
          @update:page="handlePageChange"
          @update:page-size="handlePageSizeChange"
        />
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else
      class="empty-state"
    >
      <Icon
        icon="carbon:data-table"
        class="empty-icon"
      />
      <p :style="{ color: mutedTextColor }">
        No check history available for this time range
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.check-history {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  border-radius: 12px;
}

// Header
.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.history-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.title-icon {
  font-size: 24px;
  color: #3b82f6;
}

// Time Range Selector
.time-range-selector {
  display: flex;
  gap: 6px;
  padding: 4px;
  background: rgba(148, 163, 184, 0.1);
  border-radius: 8px;
  flex-wrap: wrap;

  button {
    padding: 6px 14px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #94a3b8;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;

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

// Checks Table
.checks-table-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// Status badges in table
:deep(.status-badge) {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;

  &.status-success {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }

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

// Row styling based on status
:deep(.check-row) {
  &.check-row-success {
    // Default styling
  }

  &.check-row-failure {
    background: rgba(239, 68, 68, 0.03) !important;
  }

  &.check-row-timeout {
    background: rgba(245, 158, 11, 0.03) !important;
  }

  &.check-row-error {
    background: rgba(245, 158, 11, 0.03) !important;
  }
}

// Pagination
.pagination-controls {
  display: flex;
  justify-content: center;
  padding-top: 16px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

// Loading State
.loading-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-row {
  height: 48px;
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
  font-size: 48px;
  color: #94a3b8;
  opacity: 0.5;
}

// Mobile Responsive
@media (max-width: 768px) {
  .check-history {
    padding: 16px;
    gap: 16px;
  }

  .history-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .history-title {
    font-size: 1rem;
  }

  .title-icon {
    font-size: 20px;
  }

  .time-range-selector {
    width: 100%;
    gap: 4px;

    button {
      flex: 1;
      min-width: 60px;
      padding: 5px 10px;
      font-size: 0.8rem;
    }
  }

  .pagination-controls {
    padding-top: 12px;
  }

  :deep(.n-pagination) {
    .n-pagination-item {
      font-size: 0.75rem;
      min-width: 28px;
      height: 28px;
    }
  }
}

@media (max-width: 480px) {
  .check-history {
    padding: 12px;
    gap: 12px;
  }

  .history-title {
    font-size: 0.9rem;
  }

  .title-icon {
    font-size: 18px;
  }

  .time-range-selector {
    gap: 3px;

    button {
      padding: 4px 8px;
      font-size: 0.75rem;
    }
  }

  .empty-state {
    padding: 32px 16px;
  }

  .empty-icon {
    font-size: 36px;
  }

  :deep(.n-pagination) {
    .n-pagination-item {
      font-size: 0.7rem;
      min-width: 24px;
      height: 24px;
    }
  }
}
</style>
