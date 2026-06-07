<script setup lang="ts">
/**
 * MonitorList View
 * Task 11: Create MonitorList view
 *
 * Features:
 * - Filter controls for name, type, status
 * - Pagination controls
 * - MonitorCard component to display each monitor
 * - Click handler to navigate to MonitorDetail
 * - Empty state display when no monitors exist
 * - Loading state while fetching
 * - Error messages with retry button
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";
import {
  NButton,
  NInput,
  NSelect,
  NSpace,
  NPagination,
  NSpin,
  NEmpty,
  NAlert,
  useMessage,
} from "naive-ui";
import type { SelectOption } from "naive-ui";
import { useUptimeStore } from "@/store";
import MonitorCard from "@/components/monitoring/MonitorCard.vue";
import type { MonitorStatus, MonitorType } from "@/types/uptime";
import { MONITOR_STATUS, MONITOR_TYPES } from "@/types/uptime";

const router = useRouter();
const message = useMessage();
const uptimeStore = useUptimeStore();

// ==================== FILTERS ====================

const nameFilter = ref("");
const statusFilter = ref<MonitorStatus | null>(null);
const typeFilter = ref<MonitorType | null>(null);

// Filter options
const statusOptions: SelectOption[] = [
  { label: "All Status", value: undefined as any },
  ...Object.entries(MONITOR_STATUS).map(([key, val]) => ({
    label: val.label,
    value: key as MonitorStatus,
  })),
];

const typeOptions: SelectOption[] = [
  { label: "All Types", value: undefined as any },
  ...Object.entries(MONITOR_TYPES).map(([key, val]) => ({
    label: val.label,
    value: key as MonitorType,
  })),
];

// ==================== COMPUTED ====================

const monitors = computed(() => uptimeStore.monitors);
const loading = computed(() => uptimeStore.loading);
const error = computed(() => uptimeStore.error);
const total = computed(() => uptimeStore.total);
const page = computed(() => uptimeStore.page);
const pageSize = computed(() => uptimeStore.pageSize);
const totalPages = computed(() => uptimeStore.totalPages);

const hasFilters = computed(
  () =>
    nameFilter.value !== "" ||
    statusFilter.value !== null ||
    typeFilter.value !== null,
);

const isEmpty = computed(() => !loading.value && monitors.value.length === 0);

const isEmptyWithFilters = computed(() => isEmpty.value && hasFilters.value);

const isEmptyWithoutFilters = computed(
  () => isEmpty.value && !hasFilters.value,
);

// ==================== METHODS ====================

async function fetchMonitors() {
  try {
    await uptimeStore.fetchMonitors({
      name: nameFilter.value || undefined,
      status: statusFilter.value || undefined,
      type: typeFilter.value || undefined,
    });
  } catch (err: any) {
    console.error("[MonitorList] Failed to fetch monitors:", err);
  }
}

function handleSearch() {
  uptimeStore.setPage(1);
  fetchMonitors();
}

function handleClearFilters() {
  nameFilter.value = "";
  statusFilter.value = null;
  typeFilter.value = null;
  uptimeStore.clearFilters();
}

function handlePageChange(newPage: number) {
  uptimeStore.setPage(newPage);
}

function handlePageSizeChange(newPageSize: number) {
  uptimeStore.setPageSize(newPageSize);
}

function handleMonitorClick(monitorId: string) {
  // Navigate to uptime monitoring view with the monitor selected
  // The uptime view will handle showing the detail panel
  router.push({
    name: "UptimeMonitoring",
    query: { monitorId },
  });
}

function handleRetry() {
  fetchMonitors();
}

// ==================== LIFECYCLE ====================

onMounted(() => {
  fetchMonitors();
});

// Watch filters and refetch
watch([statusFilter, typeFilter], () => {
  handleSearch();
});
</script>

<template>
  <div
    class="monitor-list-view"
    role="main"
    aria-label="Uptime monitors list"
  >
    <!-- Header -->
    <div class="view-header">
      <div class="header-left">
        <h1 class="view-title">
          <Icon
            icon="carbon:activity"
            class="title-icon"
            aria-hidden="true"
          />
          Uptime Monitors
        </h1>
        <p class="view-subtitle">
          Monitor service availability and response times
        </p>
      </div>
      <div class="header-right">
        <NButton
          type="primary"
          aria-label="Add new monitor"
          @click="router.push({ name: 'UptimeMonitoring' })"
        >
          <template #icon>
            <Icon
              icon="carbon:add"
              aria-hidden="true"
            />
          </template>
          Add Monitor
        </NButton>
      </div>
    </div>

    <!-- Filters -->
    <div
      class="filters-section"
      role="search"
      aria-label="Monitor filters"
    >
      <NSpace
        align="center"
        :size="12"
        :wrap="false"
      >
        <NInput
          v-model:value="nameFilter"
          placeholder="Search by name..."
          clearable
          style="width: 240px"
          aria-label="Search monitors by name"
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <Icon
              icon="carbon:search"
              aria-hidden="true"
            />
          </template>
        </NInput>

        <NSelect
          v-model:value="statusFilter"
          :options="statusOptions"
          placeholder="Filter by status"
          clearable
          style="width: 160px"
          aria-label="Filter monitors by status"
        />

        <NSelect
          v-model:value="typeFilter"
          :options="typeOptions"
          placeholder="Filter by type"
          clearable
          style="width: 160px"
          aria-label="Filter monitors by type"
        />

        <NButton
          aria-label="Apply search filters"
          @click="handleSearch"
        >
          <template #icon>
            <Icon
              icon="carbon:search"
              aria-hidden="true"
            />
          </template>
          Search
        </NButton>

        <NButton
          v-if="hasFilters"
          aria-label="Clear all filters"
          @click="handleClearFilters"
        >
          <template #icon>
            <Icon
              icon="carbon:close"
              aria-hidden="true"
            />
          </template>
          Clear
        </NButton>

        <NButton
          aria-label="Refresh monitor list"
          @click="fetchMonitors"
        >
          <template #icon>
            <Icon
              icon="carbon:renew"
              aria-hidden="true"
            />
          </template>
          Refresh
        </NButton>
      </NSpace>
    </div>

    <!-- Error State -->
    <NAlert
      v-if="error && !loading"
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
          <span>Failed to load monitors</span>
        </div>
      </template>
      <div class="error-content">
        <p>{{ error }}</p>
        <NButton
          size="small"
          type="primary"
          aria-label="Retry loading monitors"
          @click="handleRetry"
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
      v-if="loading"
      class="loading-container"
      role="status"
      aria-live="polite"
      aria-label="Loading monitors"
    >
      <NSpin size="large">
        <template #description>
          Loading monitors...
        </template>
      </NSpin>
    </div>

    <!-- Empty State - No Monitors -->
    <div
      v-else-if="isEmptyWithoutFilters"
      class="empty-container"
    >
      <NEmpty
        description="No monitors configured"
        size="large"
      >
        <template #icon>
          <Icon
            icon="carbon:activity"
            style="font-size: 64px; color: var(--n-icon-color)"
          />
        </template>
        <template #extra>
          <p class="empty-message">
            Get started by creating your first uptime monitor to track service
            availability.
          </p>
          <NButton
            type="primary"
            @click="router.push({ name: 'UptimeMonitoring' })"
          >
            <template #icon>
              <Icon icon="carbon:add" />
            </template>
            Create Monitor
          </NButton>
        </template>
      </NEmpty>
    </div>

    <!-- Empty State - No Results -->
    <div
      v-else-if="isEmptyWithFilters"
      class="empty-container"
    >
      <NEmpty
        description="No monitors found"
        size="large"
      >
        <template #icon>
          <Icon
            icon="carbon:search"
            style="font-size: 64px; color: var(--n-icon-color)"
          />
        </template>
        <template #extra>
          <p class="empty-message">
            No monitors match your current filters. Try adjusting your search
            criteria.
          </p>
          <NButton @click="handleClearFilters">
            <template #icon>
              <Icon icon="carbon:close" />
            </template>
            Clear Filters
          </NButton>
        </template>
      </NEmpty>
    </div>

    <!-- Monitor Grid -->
    <div
      v-else
      class="monitors-grid"
      role="list"
      aria-label="Monitor cards"
    >
      <MonitorCard
        v-for="monitor in monitors"
        :key="monitor.id"
        :monitor="monitor"
        :show-stats="true"
        role="listitem"
        @click="handleMonitorClick"
      />
    </div>

    <!-- Pagination -->
    <div
      v-if="!isEmpty && !loading"
      class="pagination-container"
      role="navigation"
      aria-label="Monitor list pagination"
    >
      <NPagination
        :page="page"
        :page-size="pageSize"
        :page-count="totalPages"
        :item-count="total"
        :page-sizes="[10, 20, 50, 100]"
        show-size-picker
        show-quick-jumper
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      >
        <template #prefix="{ itemCount }">
          <span
            class="pagination-prefix"
            aria-live="polite"
          >Total: {{ itemCount }}</span>
        </template>
      </NPagination>
    </div>
  </div>
</template>

<style scoped lang="scss">
.monitor-list-view {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  gap: 16px;
}

.header-left {
  flex: 1;
}

.view-title {
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

.view-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--n-text-color-3);
}

.header-right {
  flex-shrink: 0;
}

.filters-section {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--n-color);
  border-radius: 8px;
  border: 1px solid var(--n-border-color);
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

.empty-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  padding: 48px 24px;
}

.empty-message {
  margin: 16px 0;
  font-size: 14px;
  color: var(--n-text-color-3);
  text-align: center;
  max-width: 400px;
}

.monitors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.pagination-container {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

.pagination-prefix {
  font-size: 14px;
  color: var(--n-text-color-3);
  margin-right: 16px;
}

// Responsive styles
@media (max-width: 1200px) {
  .monitors-grid {
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  }
}

@media (max-width: 768px) {
  .monitor-list-view {
    padding: 16px;
  }

  .view-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-right {
    width: 100%;

    :deep(.n-button) {
      width: 100%;
    }
  }

  .view-title {
    font-size: 24px;
  }

  .title-icon {
    font-size: 28px;
  }

  .filters-section {
    padding: 12px;

    :deep(.n-space) {
      flex-wrap: wrap;
    }

    :deep(.n-input),
    :deep(.n-select) {
      width: 100% !important;
      min-width: 100%;
    }

    :deep(.n-button) {
      width: 100%;
    }
  }

  .monitors-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .pagination-container {
    padding: 16px 0;

    :deep(.n-pagination) {
      flex-wrap: wrap;
      justify-content: center;
    }
  }
}

@media (max-width: 480px) {
  .monitor-list-view {
    padding: 12px;
  }

  .view-title {
    font-size: 20px;
  }

  .title-icon {
    font-size: 24px;
  }

  .view-subtitle {
    font-size: 13px;
  }

  .filters-section {
    padding: 10px;
  }

  .empty-container {
    min-height: 300px;
    padding: 32px 16px;
  }

  .empty-message {
    font-size: 13px;
  }
}
</style>
