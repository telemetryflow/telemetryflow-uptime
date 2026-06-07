<script setup lang="ts">
/**
 * Status Page View
 * TASK-10: Frontend view for Status Page module
 *
 * Features:
 * - Data table listing all status pages
 * - Modal form for create/edit (like MonitorFormModal)
 * - Detail panel for viewing status page info
 */

import { h, ref, computed, onMounted, watch } from "vue";
import { Icon } from "@iconify/vue";
import {
  NButton,
  NTag,
  NDataTable,
  NDropdown,
  NInput,
  NButtonGroup,
  NSelect,
  NSpace,
  NGrid,
  NGi,
  useMessage,
  useDialog,
  type DataTableColumns,
  type SelectOption,
} from "naive-ui";
import { StatPanel } from "@/components/charts";
import { useAppStore } from "@/store";
import { statusPageApi } from "@/api/statuspage";

const appStore = useAppStore();
import type {
  StatusPage,
  CreateStatusPageRequest,
  UpdateStatusPageRequest,
} from "@/types/statuspage";
import {
  OVERALL_STATUS,
  getStatusPageUrl,
} from "@/types/statuspage";
import { useStatPanelsFromRegistry } from "@/composables/useStatPanelsFromRegistry";
import { exportToCSV, exportToJSON, getExportFilename } from "@/utils/export";
import { formatDateTime } from "@/utils/format";
import { usePagination } from "@/composables/usePagination";
import StatusPageFormModal from "./components/StatusPageFormModal.vue";
import StatusPageDetailPanel from "./components/StatusPageDetailPanel.vue";

const message = useMessage();
const dialog = useDialog();

// Pagination
const { paginationConfig } = usePagination(10);

// ==================== DATA ====================

const statusPages = ref<StatusPage[]>([]);
const loading = ref(false);

// Search & Filters
const searchQuery = ref("");
const filterStatus = ref<string | null>(null);
const filterVisibility = ref<string | null>(null);

// Filter options
const statusOptions = [
  { label: "All Status", value: null },
  { label: "Operational", value: "operational" },
  { label: "Degraded Performance", value: "degraded_performance" },
  { label: "Partial Outage", value: "partial_outage" },
  { label: "Major Outage", value: "major_outage" },
  { label: "Maintenance", value: "maintenance" },
] as SelectOption[];

const visibilityOptions = [
  { label: "All Visibility", value: null },
  { label: "Public", value: "public" },
  { label: "Private", value: "private" },
] as SelectOption[];

// Modal state
const showFormModal = ref(false);
const editingStatusPage = ref<StatusPage | null>(null);

// Detail panel state
const showDetailPanel = ref(false);
const selectedStatusPage = ref<StatusPage | null>(null);

// ==================== COMPUTED ====================

// Filtered status pages based on search and filters
const filteredStatusPages = computed(() => {
  let result = statusPages.value;

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      (page) =>
        page.title.toLowerCase().includes(query) ||
        page.slug.toLowerCase().includes(query) ||
        page.description?.toLowerCase().includes(query)
    );
  }

  // Filter by status
  if (filterStatus.value) {
    result = result.filter((page) => page.overallStatus === filterStatus.value);
  }

  // Filter by visibility
  if (filterVisibility.value) {
    result = result.filter((page) =>
      filterVisibility.value === "public" ? page.isPublic : !page.isPublic
    );
  }

  return result;
});

const stats = computed(() => {
  const total = statusPages.value.length;
  const publicPages = statusPages.value.filter((p) => p.isPublic).length;
  const privatePages = statusPages.value.filter((p) => !p.isPublic).length;
  
  // Calculate from actual API data
  const activeIncidents = statusPages.value.reduce(
    (sum, p) => sum + (p.activeIncidents || 0),
    0
  );
  const totalMonitors = statusPages.value.reduce(
    (sum, p) => sum + p.monitors.length,
    0
  );
  
  // Count by status from API data
  const operational = statusPages.value.filter((p) => p.overallStatus === "operational").length;
  const degraded = statusPages.value.filter((p) => p.overallStatus === "degraded_performance").length;
  const outage = statusPages.value.filter((p) =>
    p.overallStatus === "partial_outage" || p.overallStatus === "major_outage"
  ).length;

  return { total, publicPages, privatePages, activeIncidents, totalMonitors, operational, degraded, outage };
});

// Row 1: Overview stats (STP20001-STP20004)
const statCardsRow1 = useStatPanelsFromRegistry(
  ['STP20001', 'STP20002', 'STP20003', 'STP20004'],
  {
    STP20001: computed(() => stats.value.total),
    STP20002: computed(() => stats.value.operational),
    STP20003: computed(() => stats.value.degraded),
    STP20004: computed(() => stats.value.outage),
  },
);

// Row 2: Detail stats (STP20005-STP20008)
const statCardsRow2 = useStatPanelsFromRegistry(
  ['STP20005', 'STP20006', 'STP20007', 'STP20008'],
  {
    STP20005: computed(() => stats.value.publicPages),
    STP20006: computed(() => stats.value.privatePages),
    STP20007: computed(() => stats.value.activeIncidents),
    STP20008: computed(() => stats.value.totalMonitors),
  },
);

// ==================== TABLE COLUMNS ====================

const columns: DataTableColumns<StatusPage> = [
  {
    title: "TITLE",
    key: "title",
    minWidth: 320,
    sorter: "default",
    render(row) {
      const visibilityConfig = row.isPublic
        ? { bg: '#22c55e', color: '#ffffff', label: 'PUBLIC' }
        : { bg: 'rgba(100, 116, 139, 0.7)', color: '#ffffff', label: 'PRIVATE' };
      return h("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } }, [
        h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
          h("span", { style: { fontWeight: 600, fontSize: "15px" } }, row.title),
          h('span', {
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 12px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: '600',
              backgroundColor: visibilityConfig.bg,
              color: visibilityConfig.color,
            },
          }, visibilityConfig.label),
        ]),
        h("div", { style: { fontSize: "12px", opacity: 0.6, fontWeight: 400, fontFamily: "'SF Mono', Monaco, monospace" } }, `/status/${row.slug}`),
      ]);
    },
  },
  {
    title: "STATUS",
    key: "overallStatus",
    width: 220,
    sorter: (a, b) => a.overallStatus.localeCompare(b.overallStatus),
    render(row) {
      const status = OVERALL_STATUS[row.overallStatus] || OVERALL_STATUS.unknown;
      const statusColors: Record<string, { bg: string; color: string }> = {
        operational: { bg: '#22c55e', color: '#ffffff' },
        degraded_performance: { bg: '#f59e0b', color: '#ffffff' },
        partial_outage: { bg: '#ea580c', color: '#ffffff' },
        major_outage: { bg: '#ef4444', color: '#ffffff' },
        maintenance: { bg: '#3b82f6', color: '#ffffff' },
      };
      const config = statusColors[row.overallStatus] || { bg: '#666666', color: '#ffffff' };
      return h('span', {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 12px',
          borderRadius: '4px',
          fontSize: '0.75rem',
          fontWeight: '600',
          backgroundColor: config.bg,
          color: config.color,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        },
      }, [
        h(Icon, { icon: status.icon, style: { fontSize: '14px', flexShrink: '0' } }),
        status.label,
      ]);
    },
  },
  {
    title: "MONITORS",
    key: "monitors",
    width: 120,
    align: "center",
    sorter: (a, b) => a.monitors.length - b.monitors.length,
    render(row) {
      return h('span', {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 12px',
          borderRadius: '4px',
          fontSize: '0.75rem',
          fontWeight: '600',
          backgroundColor: 'rgba(139, 92, 246, 0.9)',
          color: '#ffffff',
          minWidth: '32px',
        },
      }, row.monitors.length);
    },
  },
  {
    title: "ACTIVE INCIDENTS",
    key: "activeIncidents",
    width: 160,
    align: "center",
    sorter: (a, b) => (a.activeIncidents || 0) - (b.activeIncidents || 0),
    render(row) {
      const count = row.activeIncidents || 0;
      if (count === 0) {
        return h('span', {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 12px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: '600',
            backgroundColor: 'rgba(100, 116, 139, 0.3)',
            color: 'var(--n-text-color-3)',
            textTransform: 'uppercase',
          },
        }, 'NONE');
      }
      return h('span', {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 12px',
          borderRadius: '4px',
          fontSize: '0.75rem',
          fontWeight: '600',
          backgroundColor: '#ef4444',
          color: '#ffffff',
          textTransform: 'uppercase',
        },
      }, `${count} ACTIVE`);
    },
  },
  {
    title: "UPDATED AT",
    key: "updatedAt",
    width: 180,
    sorter: (a, b) =>
      new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
    render(row) {
      return h("div", { style: { fontSize: "13px" } }, formatDateTime(row.updatedAt));
    },
  },
  {
    title: "ACTIONS",
    key: "actions",
    width: 80,
    align: "center",
    render(row) {
      return h(
        NDropdown,
        {
          trigger: "click",
          options: [
            { label: "Edit", key: "edit", icon: () => h(Icon, { icon: "carbon:edit" }) },
            { label: "Public Page", key: "viewPublic", icon: () => h(Icon, { icon: "carbon:launch" }) },
            { type: "divider", key: "d1" },
            { label: "Details", key: "view", icon: () => h(Icon, { icon: "carbon:magnify" }) },
            { label: "Duplicate", key: "duplicate", icon: () => h(Icon, { icon: "carbon:copy" }) },
            { type: "divider", key: "d2" },
            { label: "Delete", key: "delete", icon: () => h(Icon, { icon: "carbon:trash-can" }), props: { class: "delete-action" } },
          ],
          onSelect: (key: string) => handleRowAction(key, row),
        },
        {
          default: () =>
            h(
              NButton,
              {
                size: "small",
                quaternary: true,
                onClick: (e: Event) => e.stopPropagation(),
              },
              { icon: () => h(Icon, { icon: "carbon:overflow-menu-vertical" }) }
            ),
        }
      );
    },
  },
];

// ==================== FETCH ====================

async function fetchStatusPages() {
  loading.value = true;
  try {
    const result = await statusPageApi.listStatusPages({ pageSize: 100 });
    statusPages.value = result.data;
  } catch (error) {
    message.error("Failed to fetch status pages");
    console.error(error);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchStatusPages();
});

watch(() => appStore.globalTimeRange, () => { fetchStatusPages(); }, { deep: true });

// ==================== ACTIONS ====================

function openFormModal(page?: StatusPage) {
  editingStatusPage.value = page || null;
  showFormModal.value = true;
}

function closeFormModal() {
  showFormModal.value = false;
  editingStatusPage.value = null;
}

async function handleFormSave(data: CreateStatusPageRequest | UpdateStatusPageRequest) {
  try {
    if (editingStatusPage.value) {
      await statusPageApi.updateStatusPage(editingStatusPage.value.id, data as UpdateStatusPageRequest);
      message.success("Status page updated successfully");
    } else {
      await statusPageApi.createStatusPage(data as CreateStatusPageRequest);
      message.success("Status page created successfully");
    }
    closeFormModal();
    fetchStatusPages();
  } catch (error: any) {
    const backendMsg = error?.response?.data?.message;
    if (error?.response?.status === 409) {
      message.error(backendMsg || "A status page with this slug already exists");
    } else {
      message.error(backendMsg || "Failed to save status page");
    }
    console.error(error);
  }
}

function handleRowAction(key: string, row: StatusPage) {
  if (key === "edit") {
    openFormModal(row);
  } else if (key === "viewPublic") {
    window.open(getStatusPageUrl(row), "_blank");
  } else if (key === "view") {
    selectedStatusPage.value = row;
    showDetailPanel.value = true;
  } else if (key === "delete") {
    dialog.warning({
      title: "Delete Status Page",
      content: `Are you sure you want to delete "${row.title}"? This action cannot be undone.`,
      positiveText: "Delete",
      negativeText: "Cancel",
      onPositiveClick: async () => {
        try {
          await statusPageApi.deleteStatusPage(row.id);
          message.success("Status page deleted");
          fetchStatusPages();
        } catch (error) {
          message.error("Failed to delete status page");
        }
      },
    });
  } else if (key === "duplicate") {
    duplicateStatusPage(row);
  }
}

async function duplicateStatusPage(page: StatusPage) {
  try {
    await statusPageApi.createStatusPage({
      title: `${page.title} (Copy)`,
      slug: `${page.slug}-copy`,
      description: page.description,
      isPublic: false,
      branding: { ...page.branding },
      display: { ...page.display },
    });
    message.success("Status page duplicated");
    fetchStatusPages();
  } catch (error: any) {
    const backendMsg = error?.response?.data?.message;
    if (error?.response?.status === 409) {
      message.error(backendMsg || "A status page with this slug already exists. Try a different slug.");
    } else {
      message.error(backendMsg || "Failed to duplicate status page");
    }
    console.error(error);
  }
}

// Export functionality
function handleExportCSV() {
  const filename = getExportFilename("status-pages");
  exportToCSV(filteredStatusPages.value as unknown as Record<string, unknown>[], filename);
}

function handleExportJSON() {
  const filename = getExportFilename("status-pages");
  exportToJSON(filteredStatusPages.value, filename);
}

function handleRowClick(row: StatusPage) {
  selectedStatusPage.value = row;
  showDetailPanel.value = true;
}

function handleResetFilters() {
  searchQuery.value = "";
  filterStatus.value = null;
  filterVisibility.value = null;
}
</script>

<template>
  <div class="status-page-view">
    <!-- Page Header -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <Icon
            icon="carbon:status-partial-fail"
            class="title-icon"
          />
          Status Pages
        </h1>
        <span class="page-subtitle">Manage public status pages for your services</span>
      </div>
      <div class="header-right">
        <NButton
          type="primary"
          @click="openFormModal()"
        >
          <template #icon>
            <Icon icon="carbon:add" />
          </template>
          Create Status Page
        </NButton>
      </div>
    </div>

    <!-- Statistics Cards -->
    <div class="stat-cards-container">
      <NGrid
        :cols="4"
        :x-gap="16"
        :y-gap="16"
      >
        <NGi
          v-for="(config, index) in statCardsRow1"
          :key="`stat-1-${index}`"
        >
          <StatPanel v-bind="config" />
        </NGi>
      </NGrid>
      <NGrid
        :cols="4"
        :x-gap="16"
        :y-gap="16"
        style="margin-top: 16px"
      >
        <NGi
          v-for="(config, index) in statCardsRow2"
          :key="`stat-2-${index}`"
        >
          <StatPanel v-bind="config" />
        </NGi>
      </NGrid>
    </div>

    <!-- Filters Section -->
    <div class="section">
      <div class="section-header filters-header">
        <div class="section-title">
          <Icon
            icon="carbon:filter"
            class="section-icon"
          />
          <span>Filters</span>
        </div>
        <NSpace
          align="center"
          :size="12"
        >
          <NSelect
            v-model:value="filterStatus"
            :options="statusOptions"
            placeholder="Status"
            size="small"
            style="width: 180px"
          />

          <NSelect
            v-model:value="filterVisibility"
            :options="visibilityOptions"
            placeholder="Visibility"
            size="small"
            style="width: 150px"
          />

          <NButton
            size="small"
            ghost
            @click="handleResetFilters"
          >
            <template #icon>
              <Icon icon="carbon:reset" />
            </template>
            Reset
          </NButton>

          <NButton
            size="small"
            ghost
            @click="fetchStatusPages"
          >
            <template #icon>
              <Icon icon="carbon:renew" />
            </template>
            Refresh
          </NButton>
        </NSpace>
      </div>
    </div>

    <!-- Data Table Section -->
    <div class="section">
      <div class="section-header">
        <div class="section-title">
          <Icon
            icon="carbon:status-partial-fail"
            class="section-icon"
          />
          <span>Status Pages</span>
          <NTag
            :bordered="false"
            size="small"
            type="info"
          >
            {{ filteredStatusPages.length }} pages
          </NTag>
        </div>
        <div class="table-actions">
          <NInput
            v-model:value="searchQuery"
            placeholder="Search status pages..."
            size="small"
            clearable
            class="search-input"
          >
            <template #prefix>
              <Icon icon="carbon:search" />
            </template>
          </NInput>
          <NButtonGroup size="small">
            <NButton @click="handleExportCSV">
              <template #icon>
                <Icon icon="carbon:download" />
              </template>
              CSV
            </NButton>
            <NButton @click="handleExportJSON">
              <template #icon>
                <Icon icon="carbon:json-reference" />
              </template>
              JSON
            </NButton>
          </NButtonGroup>
        </div>
      </div>
      <div class="section-content table-content">
        <!-- datatableId: STP30001 -->
        <n-data-table
          :columns="columns"
          :data="filteredStatusPages"
          :loading="loading"
          :scroll-x="1200"
          :row-key="(row: StatusPage) => row.id"
          :bordered="false"
          bottom-bordered
          striped
          size="small"
          :pagination="{ ...paginationConfig, itemCount: filteredStatusPages.length }"
          :row-props="(row: StatusPage) => ({
            style: 'cursor: pointer',
            onClick: () => handleRowClick(row),
          })"
        />
      </div>
    </div>

    <!-- Form Modal -->
    <StatusPageFormModal
      v-model:show="showFormModal"
      :status-page="editingStatusPage"
      @save="handleFormSave"
    />

    <!-- Detail Panel -->
    <StatusPageDetailPanel
      v-model:show="showDetailPanel"
      :status-page="selectedStatusPage"
      @edit="(page) => openFormModal(page)"
    />
  </div>
</template>

<style scoped lang="scss">
@import "@/styles/tfo-table-styles.scss";

.status-page-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// Header styles (matching Uptime)
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  color: var(--n-text-color);
}

.title-icon {
  font-size: 24px;
  color: var(--n-primary-color);
}

.page-subtitle {
  font-size: 0.875rem;
  color: var(--n-text-color-3);
  margin: 0;
}

.header-right {
  display: flex;
  gap: 8px;
}

// Stats cards
.stat-cards-container {
  margin-bottom: 8px;
}

// Section styles (matching agent)
.section {
  border: 1px solid var(--k8s-border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--n-card-color);
}

:global(html.dark) .section {
  background: rgba(30, 41, 59, 0.3);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  font-weight: 500;
  font-size: 0.875rem;
  background: var(--n-card-color);
  border-bottom: 1px solid var(--k8s-border-color);
  flex-wrap: wrap;
  gap: 12px;
}

:global(html.dark) .section-header {
  background: rgba(30, 41, 59, 0.4);
}

.filters-header {
  padding: 10px 16px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.section-icon {
  font-size: 18px;
  color: var(--n-text-color-3);
}

.table-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search-input {
  width: 220px;
}

.section-content {
  padding: 16px;
  border-top: 1px solid var(--k8s-border-color);
}

// Override single-line table padding
:deep(.n-data-table--single-line) {
  .n-data-table-td {
    padding: 12px !important;
  }
}

// Responsive
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: 16px;
  }

  .header-right {
    width: 100%;
  }

  .stat-cards-container :deep(.n-grid) {
    grid-template-columns: repeat(2, 1fr) !important;
  }
}
</style>