<script setup lang="ts">
/**
 * Uptime Monitoring View
 * TASK-09: Frontend view for Uptime module
 *
 * Features:
 * - List all monitors with status indicators
 * - Create/Edit monitors with vertical tabs form
 * - View monitor details in right panel
 * - View check history and statistics
 * - Pause/Resume monitors
 */

import { h, ref, computed, onMounted, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";
import {
  NButton,
  NButtonGroup,
  NTag,
  NSelect,
  NInput,
  NDataTable,
  NCard,
  NSpace,
  NGrid,
  NGi,
  NText,
  NDropdown,
  NTooltip,
  useMessage,
  useDialog,
} from "naive-ui";
import type { DataTableColumns, SelectOption } from "naive-ui";
import { exportToCSV, exportToJSON, getExportFilename } from "@/utils/export";
import { StatPanel } from "@/components/charts";
import { uptimeApi } from "@/api/uptime";
import { statusPageApi } from "@/api/statuspage";
import type { StatusPage } from "@/types/statuspage";
import type {
  Monitor,
  MonitorType,
  MonitorStatus,
  CreateMonitorRequest,
  UpdateMonitorRequest,
  ListMonitorsQuery,
} from "@/types/uptime";
import {
  MONITOR_TYPES,
  MONITOR_STATUS,
  UPTIME_COLORS,
} from "@/types/uptime";
import { useStatPanelsFromRegistry } from "@/composables/useStatPanelsFromRegistry";
import { useAppStore, useAlertsStore } from "@/store";

// New components
import MonitorFormModal from "./components/MonitorFormModal.vue";
import MonitorDetailPanel from "./components/MonitorDetailPanel.vue";
import MonitorList from "./components/MonitorList.vue";
import UptimeGraphs from "./components/UptimeGraphs.vue";

const message = useMessage();
const dialog = useDialog();
const router = useRouter();
const alertsStore = useAlertsStore();

// ==================== HELPERS ====================

/**
 * Extract root domain from URL (e.g., telemetryflow.id from api.telemetryflow.id)
 */
function extractRootDomain(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.hostname.split(".");
    // Get last 2 parts (e.g., telemetryflow.id) or full hostname if less than 2 parts
    if (parts.length >= 2) {
      return parts.slice(-2).join(".");
    }
    return parsed.hostname;
  } catch {
    return url;
  }
}

/**
 * Extract subdomain from URL (e.g., api.telemetryflow.id)
 */
function extractSubdomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    const match = url.match(/^(?:https?:\/\/)?([^/]+)/i);
    return match ? match[1] : url;
  }
}

/**
 * Extract path from URL (e.g., /health)
 */
function extractPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    return "/";
  }
}

/**
 * Tree node type for grouped monitors
 * Level 1: Domain (telemetryflow.id) or Environment (Production)
 * Level 2: Subdomain (api.telemetryflow.id)
 * Level 3: Endpoint (/health)
 */
interface MonitorTreeNode {
  id: string;
  name: string;
  url: string;
  type: MonitorType;
  status: MonitorStatus;
  level: "domain" | "subdomain" | "endpoint" | "environment";
  childCount?: number;
  avgUptime?: number;
  children?: MonitorTreeNode[];
  original?: Monitor;
  color?: string;
  icon?: string;
}

// ==================== DATA ====================

const monitors = ref<Monitor[]>([]);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const dataVersion = ref(0); // Add version counter for forcing re-renders

// Status page association: monitorId → linked status page(s)
const statusPages = ref<StatusPage[]>([]);
const monitorStatusPageMap = computed(() => {
  const map = new Map<string, StatusPage[]>();
  for (const sp of statusPages.value) {
    for (const m of sp.monitors) {
      if (!map.has(m.monitorId)) map.set(m.monitorId, []);
      map.get(m.monitorId)!.push(sp);
    }
  }
  return map;
});

async function fetchStatusPages() {
  try {
    const result = await statusPageApi.listStatusPages({ pageSize: 100 });
    statusPages.value = result.data;
  } catch {
    // Non-critical — status page column will just be empty
  }
}

// Grouping mode: 'none' | 'domain' | 'environment'
type GroupingMode = "none" | "domain" | "environment";
const groupingMode = ref<GroupingMode>("domain");

// Grouping mode options for selector
const groupingModeOptions = [
  { label: "No Grouping", value: "none" },
  { label: "By Domain", value: "domain" },
  { label: "By Environment", value: "environment" },
];

// Environment groups configuration (mock data - in production from API)
interface EnvironmentGroup {
  id: string;
  name: string;
  color: string;
  icon: string;
  monitorIds: string[];
}

const environmentGroups = ref<EnvironmentGroup[]>([
  { id: "prod", name: "Production", color: "#ef4444", icon: "carbon:cloud", monitorIds: [] },
  { id: "staging", name: "Staging", color: "#f59e0b", icon: "carbon:cloud-satellite", monitorIds: [] },
  { id: "dev", name: "Development", color: "#22c55e", icon: "carbon:code", monitorIds: [] },
  { id: "internal", name: "Internal", color: "#6366f1", icon: "carbon:enterprise", monitorIds: [] },
]);

// Filters
const searchQuery = ref("");
const filterStatus = ref<MonitorStatus | null>(null);
const filterType = ref<MonitorType | null>(null);

const statusOptions = [
  { label: "All Status", value: null },
  ...Object.entries(MONITOR_STATUS).map(([key, val]) => ({
    label: val.label,
    value: key as MonitorStatus,
  })),
] as SelectOption[];

const typeOptions = [
  { label: "All Types", value: null },
  ...Object.entries(MONITOR_TYPES)
    .filter(([key]) => ["http", "https", "tcp", "ping", "dns"].includes(key))
    .map(([key, val]) => ({
      label: val.label,
      value: key as MonitorType,
    })),
] as SelectOption[];

// ==================== GROUPED DATA ====================

/**
 * Calculate aggregated status from monitors
 */
function getAggregatedStatus(items: Monitor[]): MonitorStatus {
  const hasDown = items.some((m) => m.status === "down");
  const hasDegraded = items.some((m) => m.status === "degraded");
  const allPaused = items.every((m) => m.status === "paused" || m.isPaused);

  if (hasDown) return "down";
  if (hasDegraded) return "degraded";
  if (allPaused) return "paused";
  return "up";
}

/**
 * Get environment for a monitor based on its tags or groupId
 */
function getMonitorEnvironment(monitor: Monitor): string {
  // Check tags first
  for (const tag of monitor.tags) {
    const lowerTag = tag.toLowerCase();
    if (lowerTag.includes("prod")) return "prod";
    if (lowerTag.includes("stag")) return "staging";
    if (lowerTag.includes("dev")) return "dev";
    if (lowerTag.includes("internal")) return "internal";
  }
  // Default: assign based on URL pattern
  const url = monitor.url.toLowerCase();
  if (url.includes("prod") || url.includes("api.")) return "prod";
  if (url.includes("stag") || url.includes("staging.")) return "staging";
  if (url.includes("dev") || url.includes("localhost")) return "dev";
  return "internal";
}

/**
 * Group monitors into hierarchy:
 * - Domain mode: Domain -> Subdomain -> Endpoint
 * - Environment mode: Environment -> Endpoint
 */
const groupedMonitors = computed<MonitorTreeNode[]>(() => {
  // No grouping - flat list
  if (groupingMode.value === "none") {
    return monitors.value.map((m) => ({
      id: m.id,
      name: m.name,
      url: m.url,
      type: m.type,
      status: m.status,
      level: "endpoint" as const,
      original: m,
    }));
  }

  // Environment grouping
  if (groupingMode.value === "environment") {
    const envMap = new Map<string, Monitor[]>();

    // Group monitors by environment
    monitors.value.forEach((monitor) => {
      const envId = getMonitorEnvironment(monitor);
      if (!envMap.has(envId)) {
        envMap.set(envId, []);
      }
      envMap.get(envId)!.push(monitor);
    });

    // Build tree nodes for each environment group
    const result: MonitorTreeNode[] = [];

    environmentGroups.value.forEach((group) => {
      const monitorsInGroup = envMap.get(group.id) || [];
      if (monitorsInGroup.length === 0) return;

      const avgUptime = monitorsInGroup.reduce((acc, m) => acc + (m.uptimeStats?.uptime24h || 0), 0) / monitorsInGroup.length;

      result.push({
        id: `env-${group.id}`,
        name: group.name,
        url: "",
        type: "https",
        status: getAggregatedStatus(monitorsInGroup),
        level: "environment",
        childCount: monitorsInGroup.length,
        avgUptime,
        color: group.color,
        icon: group.icon,
        children: monitorsInGroup.map((m) => ({
          id: m.id,
          name: m.name,
          url: m.url,
          type: m.type,
          status: m.status,
          level: "endpoint" as const,
          original: m,
        })),
      });
    });

    return result;
  }

  // Domain grouping (default)

  // Step 1: Group by root domain
  const domainMap = new Map<string, Map<string, Monitor[]>>();

  monitors.value.forEach((monitor) => {
    const rootDomain = extractRootDomain(monitor.url);
    const subdomain = extractSubdomain(monitor.url);

    if (!domainMap.has(rootDomain)) {
      domainMap.set(rootDomain, new Map());
    }

    const subdomainMap = domainMap.get(rootDomain)!;
    if (!subdomainMap.has(subdomain)) {
      subdomainMap.set(subdomain, []);
    }
    subdomainMap.get(subdomain)!.push(monitor);
  });

  // Step 2: Build tree structure
  const result: MonitorTreeNode[] = [];

  domainMap.forEach((subdomainMap, rootDomain) => {
    const allMonitorsInDomain: Monitor[] = [];
    subdomainMap.forEach((monitors) => allMonitorsInDomain.push(...monitors));

    // If only 1 subdomain with 1 monitor, no grouping needed
    if (subdomainMap.size === 1 && allMonitorsInDomain.length === 1) {
      const m = allMonitorsInDomain[0];
      result.push({
        id: m.id,
        name: m.name,
        url: m.url,
        type: m.type,
        status: m.status,
        level: "endpoint",
        original: m,
      });
      return;
    }

    // Create domain node
    const avgUptime = allMonitorsInDomain.reduce((acc, m) => acc + (m.uptimeStats?.uptime24h || 0), 0) / allMonitorsInDomain.length;

    const subdomainNodes: MonitorTreeNode[] = [];

    subdomainMap.forEach((subdomainMonitors, subdomain) => {
      // If only 1 monitor in subdomain, flatten it
      if (subdomainMonitors.length === 1) {
        const m = subdomainMonitors[0];
        subdomainNodes.push({
          id: m.id,
          name: `${m.name}`,
          url: m.url,
          type: m.type,
          status: m.status,
          level: "endpoint",
          original: m,
        });
      } else {
        // Create subdomain node with endpoint children
        const subAvgUptime = subdomainMonitors.reduce((acc, m) => acc + (m.uptimeStats?.uptime24h || 0), 0) / subdomainMonitors.length;

        subdomainNodes.push({
          id: `subdomain-${subdomain}`,
          name: subdomain,
          url: subdomain,
          type: "https",
          status: getAggregatedStatus(subdomainMonitors),
          level: "subdomain",
          childCount: subdomainMonitors.length,
          avgUptime: subAvgUptime,
          children: subdomainMonitors.map((m) => ({
            id: m.id,
            name: `${extractPath(m.url)} - ${m.name}`,
            url: m.url,
            type: m.type,
            status: m.status,
            level: "endpoint" as const,
            original: m,
          })),
        });
      }
    });

    // If only 1 subdomain (but multiple endpoints), skip domain level
    if (subdomainMap.size === 1 && subdomainNodes[0].children) {
      result.push(subdomainNodes[0]);
    } else {
      result.push({
        id: `domain-${rootDomain}`,
        name: rootDomain,
        url: rootDomain,
        type: "https",
        status: getAggregatedStatus(allMonitorsInDomain),
        level: "domain",
        childCount: subdomainMap.size,
        avgUptime,
        children: subdomainNodes,
      });
    }
  });

  // Sort by name
  return result.sort((a, b) => a.name.localeCompare(b.name));
});

// ==================== STATISTICS ====================

const stats = computed(() => {
  // For stats, use current page data when in "no grouping" mode
  // The counts are based on current page, but total uses the API total
  const up = monitors.value.filter((m) => m.status === "up").length;
  const down = monitors.value.filter((m) => m.status === "down").length;
  const degraded = monitors.value.filter((m) => m.status === "degraded").length;
  const paused = monitors.value.filter((m) => m.status === "paused" || m.isPaused).length;
  // Derive uptime from status when stats are missing: up=100, degraded=95, down=0
  const getEffectiveUptime = (m: Monitor) =>
    m.uptimeStats?.uptime24h ?? (m.status === "up" ? 100 : m.status === "degraded" ? 95 : 0);
  const avgUptime = monitors.value.length > 0
    ? monitors.value.reduce((acc, m) => acc + getEffectiveUptime(m), 0) / monitors.value.length
    : 0;
  // Use lastResponseTime as fallback when avgResponseTime24h is missing
  const avgResponseTime = monitors.value.length > 0
    ? monitors.value.reduce((acc, m) => acc + (m.uptimeStats?.avgResponseTime24h || m.lastResponseTime || 0), 0) / monitors.value.length
    : 0;

  // Use total.value for total count (from API), monitors.value.length for current page
  // When grouping is enabled, all data is fetched so they're equal
  return {
    up,
    down,
    degraded,
    paused,
    avgUptime,
    avgResponseTime,
    total: groupingMode.value === "none" ? total.value : monitors.value.length,
  };
});

// Stat panel cards driven by the stat-panel-registry (Row 1: UPT20001–UPT20004)
const statCardsRow1 = useStatPanelsFromRegistry(
  ['UPT20001', 'UPT20002', 'UPT20003', 'UPT20004'],
  {
    UPT20001: computed(() => stats.value.total),
    UPT20002: computed(() => stats.value.up),
    UPT20003: computed(() => stats.value.down),
    UPT20004: computed(() => stats.value.degraded),
  },
);

// Stat panel cards driven by the stat-panel-registry (Row 2: UPT20005–UPT20008)
const statCardsRow2 = useStatPanelsFromRegistry(
  ['UPT20005', 'UPT20006', 'UPT20007', 'UPT20008'],
  {
    UPT20005: computed(() => stats.value.paused),
    UPT20006: computed(() => `${stats.value.avgUptime.toFixed(1)}`),
    UPT20007: computed(() => `${stats.value.avgResponseTime.toFixed(0)}`),
    UPT20008: computed(() => monitors.value.filter(m => m.isActive && !m.isPaused).length),
  },
);

// SSL stats from ClickHouse via GET /ssl-summary — real data only
const sslSummary = ref({ total: 0, nearExpiry: 0, minDays: 0, maxDays: 0 });
// Per-monitor SSL days map for the datatable SSL column: monitorId → days remaining
const sslDaysMap = ref<Map<string, number>>(new Map());

async function fetchSSLSummary() {
  try {
    const result = await uptimeApi.getSSLSummary();
    sslSummary.value = result;
    if (result.perMonitor) {
      sslDaysMap.value = new Map(result.perMonitor.map((m) => [m.monitorId, m.days]));
    }
  } catch {
    // Non-critical — keep defaults (0)
  }
}

// Stat panel cards driven by the stat-panel-registry (Row 3: UPT20013–UPT20016 — SSL)
const statCardsRow3 = useStatPanelsFromRegistry(
  ['UPT20013', 'UPT20014', 'UPT20015', 'UPT20016'],
  {
    UPT20013: computed(() => sslSummary.value.total),
    UPT20014: computed(() => sslSummary.value.nearExpiry),
    UPT20015: computed(() => sslSummary.value.minDays),
    UPT20016: computed(() => sslSummary.value.maxDays),
  },
);

// ==================== FETCH ====================

async function fetchMonitors() {
  loading.value = true;
  try {
    // When grouping is enabled, fetch ALL monitors (no pagination)
    // When no grouping, use normal pagination
    const query: ListMonitorsQuery = {
      page: groupingMode.value === "none" ? page.value : 1,
      pageSize: groupingMode.value === "none" ? pageSize.value : 1000, // Fetch all when grouped
      status: filterStatus.value ?? undefined,
      type: filterType.value ?? undefined,
    };

    const result = await uptimeApi.listMonitors(query);

    // Force Vue reactivity by creating a new array reference
    monitors.value = [...result.data];
    total.value = result.total;
    dataVersion.value++; // Increment version to force re-render

    console.log('[fetchMonitors] Loaded monitors:', monitors.value.length, 'Total:', total.value, 'Version:', dataVersion.value);
    console.log('[fetchMonitors] First monitor:', monitors.value[0]);
  } catch (error) {
    message.error("Failed to fetch monitors");
    console.error(error);
  } finally {
    loading.value = false;
  }
}

function handlePageChange(newPage: number) {
  page.value = newPage;
  fetchMonitors();
}

function handlePageSizeChange(newSize: number) {
  pageSize.value = newSize;
  page.value = 1;
  fetchMonitors();
}

function handleSearch() {
  page.value = 1;
  fetchMonitors();
}

function handleResetFilters() {
  searchQuery.value = "";
  filterStatus.value = null;
  filterType.value = null;
  page.value = 1;
  fetchMonitors();
}

const appStore = useAppStore();

onMounted(() => {
  fetchMonitors();
  fetchStatusPages();
  fetchSSLSummary();
});

// Refetch when global time range changes
watch(() => appStore.globalTimeRange, () => {
  fetchMonitors();
  fetchSSLSummary();
}, { deep: true });

// Refetch when grouping mode changes (to get all data for grouped views)
watch(groupingMode, () => {
  page.value = 1;
  fetchMonitors();
});

// Pagination config as computed for proper reactivity
const paginationConfig = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
  itemCount: groupingMode.value === 'none' ? total.value : groupedMonitors.value.length,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100, 200, 500],
  onChange: handlePageChange,
  onUpdatePageSize: handlePageSizeChange,
  prefix: ({ itemCount }: { itemCount: number | undefined }) => `Total: ${itemCount ?? 0}`,
}));

// ==================== COLUMNS ====================

// Helper function for uptime percentage color (Green/Orange/Red/Gray)
const getUptimePercentColor = (pct: number) => {
  if (pct >= 99) return UPTIME_COLORS.up;       // Green
  if (pct >= 90) return UPTIME_COLORS.issues;    // Orange
  return UPTIME_COLORS.down;                     // Red
};

const columns = computed<DataTableColumns<MonitorTreeNode>>(() => [
  {
    title: "NAME",
    key: "name",
    minWidth: 320,
    sorter: "default",
    defaultSortOrder: 'ascend',
    render(row) {
      const isParent = row.level === "domain" || row.level === "subdomain" || row.level === "environment";

      // Parent level - folder icon with name and count
      if (isParent) {
        const upCount = row.children?.filter(c => c.status === "up").length || 0;
        const totalCount = row.children?.length || 0;

        // For environment level, use the defined color; otherwise use status-based color
        const folderColor = row.level === "environment" && row.color
          ? row.color
          : (row.status === "up" ? UPTIME_COLORS.up : row.status === "down" ? UPTIME_COLORS.down : UPTIME_COLORS.issues);

        const folderIcon = row.level === "environment" && row.icon
          ? row.icon
          : "carbon:folder";

        // Single inline-flex container: Folder/Icon → Name → Badge
        // The Naive UI chevron appears before this (standard tree pattern)
        return h(
          "span",
          { style: { display: "inline-flex", alignItems: "center", gap: "8px" } },
          [
            h(Icon, { icon: folderIcon, style: `font-size: 18px; color: ${folderColor}; flex-shrink: 0;` }),
            h("span", { style: { fontWeight: "700", fontSize: "14px" } }, row.name),
            h(
              NTag,
              {
                size: "tiny",
                type: row.status === "up" ? "success" : row.status === "down" ? "error" : "warning",
                round: true,
              },
              { default: () => `${upCount}/${totalCount} up` }
            ),
          ]
        );
      }

      // Endpoint level (leaf) - show name, url, and check interval
      const monitor = row.original;
      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "1px" } },
        [
          h("span", { style: { fontWeight: "600", fontSize: "13px" } }, row.name),
          h(NText, { depth: 3, style: "font-size: 11px" }, { default: () => row.url }),
          h(NText, { depth: 3, style: "font-size: 10px" }, { default: () => `Check every ${monitor?.interval || 60}s` }),
        ]
      );
    },
  },
  {
    title: "STATUS",
    key: "status",
    width: 110,
    align: "center",
    sorter: "default",
    render(row) {
      // Get bullet color based on status: Green=Up, Red=Down, Orange=Issues, Gray=NoData
      const bulletColor = row.status === "up" ? UPTIME_COLORS.up :
        row.status === "down" ? UPTIME_COLORS.down :
          row.status === "degraded" || row.status === "pending" ? UPTIME_COLORS.issues :
            UPTIME_COLORS.noData;

      const statusInfo = MONITOR_STATUS[row.status];

      return h(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" } },
        [
          // Bullet icon
          h("span", {
            style: {
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: bulletColor,
              flexShrink: "0",
            },
          }),
          // Status text
          h(
            NTag,
            {
              type: statusInfo.color as "success" | "warning" | "error" | "info" | "default",
              size: "small",
              round: true,
              bordered: false,
              style: { fontWeight: "600" },
            },
            { default: () => statusInfo.label }
          ),
        ]
      );
    },
  },
  {
    title: "TYPE",
    key: "type",
    width: 100,
    align: "center",
    sorter: "default",
    render(row) {
      if (row.level !== "endpoint") return null;
      const typeInfo = MONITOR_TYPES[row.type];
      // Map type to tag color
      const tagType = row.type === "https" ? "success" :
        row.type === "http" ? "info" :
          row.type === "tcp" ? "warning" :
            row.type === "ping" ? "default" :
              row.type === "dns" ? "info" : "default";
      return h(
        "div",
        { style: { textAlign: "center" } },
        h(
          NTag,
          { type: tagType as "info" | "success" | "warning" | "error" | "default", size: "small", bordered: true },
          { default: () => typeInfo?.label || row.type.toUpperCase() }
        )
      );
    },
  },
  {
    title: "SSL",
    key: "ssl",
    width: 130,
    align: "center",
    sorter: (a, b) => {
      const aDays = sslDaysMap.value.get(a.original?.id ?? "") ?? (a.original?.sslCert?.daysUntilExpiry ?? 9999);
      const bDays = sslDaysMap.value.get(b.original?.id ?? "") ?? (b.original?.sslCert?.daysUntilExpiry ?? 9999);
      return aDays - bDays;
    },
    render(row) {
      if (row.level !== "endpoint") return null;
      const monitor = row.original;
      if (!monitor) return null;

      // Only HTTPS and ssl_certificate monitors carry SSL info
      if (!["https", "ssl_certificate"].includes(monitor.type)) {
        return h("span", { style: { color: "#6b7280", fontSize: "12px" } }, "—");
      }

      // Prefer ClickHouse-sourced days (from sslDaysMap), fall back to sslCert field
      const chDays = sslDaysMap.value.get(monitor.id);
      const days = chDays ?? monitor.sslCert?.daysUntilExpiry;
      const isValid = days === undefined ? (monitor.sslCert?.valid ?? null) : days > 0;

      // No data yet from ClickHouse and no cached cert
      if (days === undefined && isValid === null) {
        return h("div", { style: { textAlign: "center" } },
          h("span", { style: { color: "#9ca3af", fontSize: "11px" } }, "—")
        );
      }

      // Expired or invalid
      if (days !== undefined && days <= 0) {
        return h("div", { style: { textAlign: "center" } },
          h(NTag, { type: "error", size: "small", round: true, bordered: false },
            { default: () => "Expired" }
          )
        );
      }
      if (isValid === false) {
        return h("div", { style: { textAlign: "center" } },
          h(NTag, { type: "error", size: "small", round: true, bordered: false },
            { default: () => "Invalid" }
          )
        );
      }

      const warningDays = monitor.sslExpiryWarningDays ?? 14;
      const color = days === undefined ? "#22c55e"
        : days > 30 ? "#22c55e"
        : days > warningDays ? "#f59e0b"
        : "#ef4444";
      const icon = days === undefined ? "carbon:security"
        : days > 30 ? "carbon:security"
        : days > warningDays ? "carbon:warning"
        : "carbon:warning-filled";

      return h(
        NTooltip,
        { trigger: "hover", placement: "top" },
        {
          trigger: () => h(
            "div",
            { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", cursor: "default" } },
            [
              h("div", { style: { display: "flex", alignItems: "center", gap: "3px" } }, [
                h(Icon, { icon, style: `font-size: 13px; color: ${color}` }),
                h("span", { style: { fontWeight: "600", fontSize: "13px", color } },
                  days !== undefined ? `${days}d` : "Valid"
                ),
              ]),
              h("span", { style: { fontSize: "10px", color: "#9ca3af" } }, "valid"),
            ]
          ),
          default: () => h("div", { style: { lineHeight: "1.6" } }, [
            monitor.sslCert?.issuer
              ? h("div", { style: { fontWeight: "600" } }, monitor.sslCert.issuer)
              : null,
            days !== undefined
              ? h("div", { style: { color } }, `Expires in ${days} days`)
              : h("div", { style: { color: "#22c55e" } }, "Valid"),
            monitor.sslCert?.protocol
              ? h("div", { style: { color: "#9ca3af", fontSize: "11px" } }, monitor.sslCert.protocol)
              : null,
          ]),
        }
      );
    },
  },
  {
    title: "STATUS PAGE",
    key: "statusPage",
    width: 140,
    align: "center",
    render(row) {
      if (row.level !== "endpoint") return null;
      const monitor = row.original;
      if (!monitor) return null;

      const linkedPages = monitorStatusPageMap.value.get(monitor.id) || [];
      if (linkedPages.length === 0) {
        return h("span", { style: { color: "#6b7280", fontSize: "12px" } }, "—");
      }

      // Assign a deterministic color based on status page slug
      const spColors = ["#6366f1", "#8b5cf6", "#06b6d4", "#0ea5e9", "#10b981", "#f59e0b"];
      return h(
        "div",
        { style: { display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "center" } },
        linkedPages.map((sp, idx) =>
          h(
            NTag,
            {
              size: "tiny",
              round: true,
              bordered: false,
              color: {
                color: `${spColors[idx % spColors.length]}20`,
                textColor: spColors[idx % spColors.length],
                borderColor: `${spColors[idx % spColors.length]}40`,
              },
              style: { fontWeight: "600", fontSize: "10px" },
            },
            {
              default: () => sp.title.length > 14 ? sp.title.substring(0, 12) + "…" : sp.title,
            }
          )
        )
      );
    },
  },
  {
    title: "UPTIME (24H)",
    key: "uptime24h",
    width: 220,
    sorter: (a, b) => {
      const aUptime = a.original?.uptimeStats?.uptime24h || a.avgUptime || 0;
      const bUptime = b.original?.uptimeStats?.uptime24h || b.avgUptime || 0;
      return aUptime - bUptime;
    },
    render(row) {
      const isParent = row.level === "domain" || row.level === "subdomain" || row.level === "environment";
      const barCount = 40;

      // Helper: get heartbeat color
      // Green=up/success, Red=down/failure, Orange=degraded/pending/timeout/error, Gray=paused/unknown/noData
      const hbColor = (status: string) =>
        status === "success" || status === "up" ? UPTIME_COLORS.up :
          status === "failure" || status === "down" ? UPTIME_COLORS.down :
            status === "paused" || status === "unknown" ? UPTIME_COLORS.noData :
              UPTIME_COLORS.issues;

      // Helper: render bars + percentage
      const renderBars = (heartbeats: Array<{ status: string }>, uptime: number, hasData: boolean) => {
        // Take the last barCount heartbeats (oldest→newest left→right)
        const bars = heartbeats.slice(-barCount);
        // Pad with grey if fewer heartbeats than barCount
        const padCount = barCount - bars.length;

        return h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "12px" } },
          [
            h("span", {
              style: {
                fontSize: "13px",
                fontWeight: "600",
                color: hasData ? getUptimePercentColor(uptime) : UPTIME_COLORS.noData,
                minWidth: "55px",
              },
            }, hasData ? `${uptime.toFixed(2)}%` : "N/A"),
            h("div", {
              style: {
                display: "flex",
                gap: "1px",
                alignItems: "center",
                height: "20px",
                flex: "1",
              },
            }, [
              // Gray padding bars (no data slots)
              ...Array.from({ length: padCount }, () =>
                h("div", { style: { width: "3px", height: "100%", backgroundColor: UPTIME_COLORS.noData, borderRadius: "1px", opacity: "0.4" } })
              ),
              // Actual heartbeat bars
              ...bars.map((hb) =>
                h("div", { style: { width: "3px", height: "100%", backgroundColor: hbColor(hb.status), borderRadius: "1px" } })
              ),
            ]),
          ]
        );
      };

      if (isParent) {
        // Parent row: average heartbeats across ALL children per time slot
        // Each child has up to barCount heartbeats; for each slot position,
        // compute the proportion of success across children → "success" if majority up
        const children = row.children || [];
        const childHeartbeatArrays = children
          .map(c => (c.original?.heartbeats || []).slice(-barCount) as Array<{ status: string }>)
          .filter(hbs => hbs.length > 0);

        const hasData = childHeartbeatArrays.length > 0 || children.some(c =>
          ["up", "down", "degraded"].includes(c.original?.status || "")
        );

        // Build averaged bars: for each bar position, check if majority of children are "success"
        const maxLen = Math.max(...childHeartbeatArrays.map(a => a.length), 0);
        const avgHeartbeats: Array<{ status: string }> = [];
        for (let i = 0; i < maxLen; i++) {
          let successN = 0;
          let totalN = 0;
          for (const childHbs of childHeartbeatArrays) {
            // Align from the right (newest → oldest padding on left)
            const idx = childHbs.length - maxLen + i;
            if (idx >= 0 && idx < childHbs.length) {
              totalN++;
              if (childHbs[idx].status === "success" || childHbs[idx].status === "up") successN++;
            }
          }
          if (totalN === 0) {
            avgHeartbeats.push({ status: "unknown" });
          } else if (successN === totalN) {
            avgHeartbeats.push({ status: "success" });
          } else if (successN === 0) {
            avgHeartbeats.push({ status: "failure" });
          } else {
            // Partial: some up some down → degraded (orange)
            avgHeartbeats.push({ status: "degraded" });
          }
        }

        // Compute overall uptime% as average across all children's heartbeats
        const allHeartbeats = childHeartbeatArrays.flat();
        const totalSuccess = allHeartbeats.filter(hb => hb.status === "success" || hb.status === "up").length;
        const uptime = allHeartbeats.length > 0
          ? (totalSuccess / allHeartbeats.length) * 100
          : (hasData
            ? children.reduce((acc, c) => {
              const m = c.original;
              return acc + (m?.status === "up" ? 100 : m?.status === "degraded" ? 95 : 0);
            }, 0) / (children.length || 1)
            : 0);

        return renderBars(avgHeartbeats, uptime, hasData);
      }

      // Endpoint row — use actual heartbeats from check history
      const monitor = row.original;
      const heartbeats: Array<{ status: string }> = monitor?.heartbeats || [];
      const hasData = heartbeats.length > 0 || ["up", "down", "degraded"].includes(monitor?.status || "");

      // Compute uptime % from heartbeats
      let uptime = 0;
      if (heartbeats.length > 0) {
        const successCount = heartbeats.filter(hb => hb.status === "success").length;
        uptime = (successCount / heartbeats.length) * 100;
      } else if (monitor?.status === "up") {
        uptime = 100;
      } else if (monitor?.status === "degraded") {
        uptime = 95;
      }

      return renderBars(heartbeats, uptime, hasData);
    },
  },
  {
    title: "RESPONSE",
    key: "lastResponseTime",
    width: 120,
    align: "center",
    sorter: (a, b) => {
      const aTime = a.original?.lastResponseTime || 0;
      const bTime = b.original?.lastResponseTime || 0;
      return aTime - bTime;
    },
    render(row) {
      if (row.level !== "endpoint") return null;
      const monitor = row.original;
      if (!monitor?.lastResponseTime) return h("div", { style: { textAlign: "center" } }, "-");

      const ms = monitor.lastResponseTime;
      let color = "#22c55e"; // green for fast
      if (ms > 500) color = "#f59e0b"; // yellow for medium
      if (ms > 1000) color = "#ef4444"; // red for slow

      return h(
        "div",
        { style: { textAlign: "center" } },
        h("span", { style: { fontWeight: "600", color } }, `${ms}ms`)
      );
    },
  },
  {
    title: "LAST CHECK",
    key: "lastCheckAt",
    width: 160,
    sorter: (a, b) => {
      const aTime = a.original?.lastCheckAt || 0;
      const bTime = b.original?.lastCheckAt || 0;
      return aTime - bTime;
    },
    render(row) {
      if (row.level !== "endpoint") return null;
      const monitor = row.original;
      if (!monitor?.lastCheckAt) return h(NText, { depth: 3 }, { default: () => "Never" });

      // Format as full timestamp like "2025-11-07 01:54:10"
      const date = new Date(monitor.lastCheckAt);
      const formatted = date.toISOString().replace("T", " ").substring(0, 19);
      return h(NText, { depth: 2 }, { default: () => formatted });
    },
  },
  {
    title: "ACTION",
    key: "actions",
    width: 100,
    align: 'center',
    fixed: "right" as const,
    render(row) {
      // Don't show actions for group parent rows
      if (row.level === "domain" || row.level === "subdomain" || row.level === "environment") return null;

      const monitor = row.original;
      if (!monitor) return null;

      const dropdownOptions = [
        {
          label: "Details",
          key: "details",
          icon: () => h(Icon, { icon: "carbon:magnify", style: "font-size: 16px" }),
        },
        {
          label: "Edit",
          key: "edit",
          icon: () => h(Icon, { icon: "carbon:edit", style: "font-size: 16px" }),
        },
        {
          label: monitor.isPaused ? "Resume" : "Pause",
          key: monitor.isPaused ? "resume" : "pause",
          icon: () => h(Icon, { icon: monitor.isPaused ? "carbon:play" : "carbon:pause", style: "font-size: 16px" }),
        },
        { type: "divider", key: "d1" },
        {
          label: "Delete",
          key: "delete",
          icon: () => h(Icon, { icon: "carbon:trash-can", style: "font-size: 16px; color: #ef4444" }),
        },
      ];

      const handleSelect = (key: string) => {
        switch (key) {
          case "details":
            selectMonitor(monitor);
            break;
          case "edit":
            openEditModal(monitor);
            break;
          case "pause":
            handlePause(monitor);
            break;
          case "resume":
            handleResume(monitor);
            break;
          case "delete":
            dialog.warning({
              title: "Delete Monitor",
              content: `Are you sure you want to delete "${monitor.name}"?`,
              positiveText: "Delete",
              negativeText: "Cancel",
              onPositiveClick: () => handleDelete(monitor),
            });
            break;
        }
      };

      return h(
        NDropdown,
        {
          options: dropdownOptions,
          trigger: "click",
          onSelect: handleSelect,
        },
        {
          default: () =>
            h(
              NButton,
              { size: "small", quaternary: true },
              { icon: () => h(Icon, { icon: "carbon:overflow-menu-vertical", style: "font-size: 18px" }) }
            ),
        }
      );
    },
  },
]);

// ==================== SELECTED MONITOR (Detail Panel Drawer) ====================

const selectedMonitor = ref<Monitor | null>(null);
const showDetailDrawer = ref(false);

function selectMonitor(monitor: Monitor) {
  selectedMonitor.value = monitor;
  showDetailDrawer.value = true;
}

function closeDetailPanel() {
  showDetailDrawer.value = false;
  // Delay clearing the monitor to allow drawer close animation
  setTimeout(() => {
    selectedMonitor.value = null;
  }, 300);
}

// ==================== FORM MODAL ====================

const showFormModal = ref(false);
const editingMonitor = ref<Monitor | null>(null);

function openCreateModal() {
  editingMonitor.value = null;
  showFormModal.value = true;
}

function openEditModal(monitor: Monitor) {
  editingMonitor.value = monitor;
  showFormModal.value = true;
}

async function handleFormSave(data: CreateMonitorRequest | UpdateMonitorRequest) {
  try {
    // Validate required fields
    if (!data.name || !data.name.trim()) {
      message.error("Monitor name is required");
      return;
    }
    if (!data.url || !data.url.trim()) {
      message.error("Monitor URL is required");
      return;
    }

    if (editingMonitor.value) {
      // Edit mode
      console.log('[handleFormSave] Updating monitor:', editingMonitor.value.id, data);
      const updated = await uptimeApi.updateMonitor(editingMonitor.value.id, data);
      console.log('[handleFormSave] Update response:', updated);
      message.success("Monitor updated successfully");

      // Update selected monitor if it's the one being edited
      if (selectedMonitor.value?.id === editingMonitor.value.id) {
        console.log('[handleFormSave] Refreshing selected monitor in detail panel');
        const refreshed = await uptimeApi.getMonitor(editingMonitor.value.id);
        selectedMonitor.value = refreshed;
      }
    } else {
      // Create mode
      console.log('[handleFormSave] Creating monitor:', data);
      const created = await uptimeApi.createMonitor(data as CreateMonitorRequest);
      console.log('[handleFormSave] Create response:', created);
      message.success("Monitor created successfully");
    }

    showFormModal.value = false;

    // Refresh the monitors list to get updated data
    console.log('[handleFormSave] Refreshing monitors list...');
    await fetchMonitors();

    // Force Vue to update the DOM
    await nextTick();
    console.log('[handleFormSave] Monitors list refreshed and DOM updated');
  } catch (error: any) {
    const errorMsg = error?.response?.data?.message || error?.message || "Operation failed";
    message.error(editingMonitor.value ? `Failed to update monitor: ${errorMsg}` : `Failed to create monitor: ${errorMsg}`);
    console.error('[handleFormSave] Error:', error);
  }
}

// ==================== ACTIONS ====================

async function handlePause(monitor: Monitor) {
  try {
    await uptimeApi.pauseMonitor(monitor.id);
    message.success("Monitor paused");
    await fetchMonitors();
  } catch (error) {
    message.error("Failed to pause monitor");
    console.error(error);
  }
}

async function handleResume(monitor: Monitor) {
  try {
    await uptimeApi.resumeMonitor(monitor.id);
    message.success("Monitor resumed");
    await fetchMonitors();
  } catch (error) {
    message.error("Failed to resume monitor");
    console.error(error);
  }
}

async function handleDelete(monitor: Monitor) {
  try {
    await uptimeApi.deleteMonitor(monitor.id);
    message.success("Monitor deleted");
    await fetchMonitors();
  } catch (error) {
    message.error("Failed to delete monitor");
    console.error(error);
  }
}

function handleViewLogs() {
  if (selectedMonitor.value) {
    // Navigate to logs page with filter for this monitor
    router.push({
      path: "/logs",
      query: {
        filter: `monitor:${selectedMonitor.value.name}`,
        source: "uptime",
      },
    });
  }
}

function handleExportCSV() {
  const filename = getExportFilename("uptime-monitors");
  exportToCSV(monitors.value as unknown as Record<string, unknown>[], filename);
}

function handleExportJSON() {
  const filename = getExportFilename("uptime-monitors");
  exportToJSON(monitors.value, filename);
}
</script>

<template>
  <div class="uptime-page">
    <div class="uptime-view">
      <!-- Header -->
      <div class="page-header">
        <div class="header-left">
          <h1 class="page-title">
            <Icon
              icon="carbon:activity"
              class="title-icon"
            />
            Uptime Monitoring
          </h1>
          <span class="page-subtitle">Monitor service availability and response times</span>
        </div>
        <div class="header-right">
          <NButton
            type="primary"
            @click="openCreateModal"
          >
            <template #icon>
              <Icon icon="carbon:add" />
            </template>
            Add Monitor
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
        <NGrid
          :cols="4"
          :x-gap="16"
          :y-gap="16"
          style="margin-top: 16px"
        >
          <NGi
            v-for="(config, index) in statCardsRow3"
            :key="`stat-3-${index}`"
          >
            <StatPanel v-bind="config" />
          </NGi>
        </NGrid>
      </div>

      <!-- Uptime & SSL Trend Graphs -->
      <div class="graphs-section">
        <UptimeGraphs
          :monitors="monitors"
          :monitor="selectedMonitor"
        />
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
            style="flex-wrap: wrap"
          >
            <NInput
              v-model:value="searchQuery"
              placeholder="Search monitors..."
              clearable
              size="small"
              class="search-input"
              @keyup.enter="handleSearch"
            >
              <template #prefix>
                <Icon icon="carbon:search" />
              </template>
            </NInput>
            <NSelect
              v-model:value="filterStatus"
              :options="statusOptions"
              placeholder="Status"
              size="small"
              style="width: 140px"
              @update:value="handleSearch"
            />
            <NSelect
              v-model:value="filterType"
              :options="typeOptions"
              placeholder="Type"
              size="small"
              style="width: 130px"
              @update:value="handleSearch"
            />
            <NSpace
              align="center"
              :size="6"
            >
              <Icon
                icon="carbon:tree-view"
                style="color: var(--n-text-color-3); font-size: 16px"
              />
              <NSelect
                v-model:value="groupingMode"
                :options="groupingModeOptions"
                size="small"
                style="width: 165px"
              />
            </NSpace>
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
              @click="fetchMonitors"
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
              icon="carbon:activity"
              class="section-icon"
            />
            <span>Monitors</span>
            <NTag
              :bordered="false"
              size="small"
              type="info"
            >
              {{ monitors.length }} monitors
            </NTag>
            <NTag
              v-if="groupingMode !== 'none'"
              :bordered="false"
              size="small"
              type="default"
            >
              {{ groupedMonitors.length }} {{ groupingMode === 'environment' ? 'environments' : 'domain groups' }}
            </NTag>
          </div>
          <div class="table-actions">
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
          <!-- datatableId: UPT30001 -->
          <NDataTable
            :key="`table-v${dataVersion}`"
            class="uptime-tree-table"
            :columns="columns"
            :data="groupedMonitors"
            :loading="loading"
            :remote="groupingMode === 'none'"
            :pagination="paginationConfig"
            :scroll-x="1100"
            :row-key="(row) => row.id"
            :default-expand-all="true"
            :cascade="false"
            :indent="24"
            striped
            bottom-bordered
            size="medium"
          />
        </div>
      </div>

      <!-- Monitor Form Modal (Create/Edit) -->
      <MonitorFormModal
        v-model:show="showFormModal"
        :monitor="editingMonitor"
        :notification-channels="alertsStore.notificationChannels"
        @save="handleFormSave"
      />
    </div>

    <!-- Detail Panel Drawer -->
    <MonitorDetailPanel
      :show="showDetailDrawer"
      :monitor="selectedMonitor"
      @update:show="(val) => { if (!val) closeDetailPanel(); }"
      @edit="openEditModal"
      @pause="handlePause"
      @resume="handleResume"
      @delete="handleDelete"
      @view-logs="handleViewLogs"
    />
  </div>
</template>

<style scoped lang="scss">
@import '@/styles/tfo-variables.scss';
@import '@/styles/tfo-table-styles.scss';

.uptime-view {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.title-icon {
  font-size: 28px;
  color: var(--primary-color);
}

.page-subtitle {
  color: var(--text-color-3);
  font-size: 14px;
}

.stat-cards-container {
  margin-bottom: 24px;
}

.graphs-section {
  margin-bottom: 24px;
}

// Section layout — matches status-page design
.section {
  border: 1px solid var(--k8s-border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--n-card-color);

  & + .section {
    margin-top: 16px;
  }
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
}

.search-input {
  width: 200px;
}

.section-content {
  padding: 16px;
}

.monitor-name-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.table-summary {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--k8s-border-color);
  font-size: 13px;
  color: var(--n-text-color-3);
}

/* ==================== Tree View Specific Styling ==================== */

.uptime-tree-table {

  /* Parent row (group header) - distinct background color */
  :deep(.n-data-table-tr--expanded > .n-data-table-td) {
    background: rgba(99, 102, 241, 0.12) !important; // Purple-blue tint for group headers
    font-weight: 600 !important;
  }

  /* Parent row collapsed - also use group header background */
  :deep(.n-data-table-tr:has(.n-data-table-expand-trigger) > .n-data-table-td) {
    background: rgba(99, 102, 241, 0.12) !important;
    font-weight: 600 !important;
  }

  /* Child rows - default background */
  :deep(.n-data-table-tr:not(:has(.n-data-table-expand-trigger)) > .n-data-table-td) {
    background: transparent;
  }

  /* Row hover effect - different for parent vs child */
  :deep(.n-data-table-tr:has(.n-data-table-expand-trigger):hover > .n-data-table-td) {
    background: rgba(99, 102, 241, 0.18) !important; // Darker purple for parent hover
  }

  :deep(.n-data-table-tr:not(:has(.n-data-table-expand-trigger)):hover > .n-data-table-td) {
    background: rgba(99, 102, 241, 0.06) !important; // Light purple for child hover
  }
}

/* Dark mode tree lines */
html.dark .uptime-tree-table {

  /* Parent row (group header) - enhanced background in dark mode */
  :deep(.n-data-table-tr--expanded > .n-data-table-td) {
    background: rgba(99, 102, 241, 0.18) !important;
  }

  :deep(.n-data-table-tr:has(.n-data-table-expand-trigger) > .n-data-table-td) {
    background: rgba(99, 102, 241, 0.18) !important;
  }

  /* Parent hover in dark mode */
  :deep(.n-data-table-tr:has(.n-data-table-expand-trigger):hover > .n-data-table-td) {
    background: rgba(99, 102, 241, 0.24) !important;
  }
}

/* Action cell styling */
.action-cell {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}

/* ==================== Split Layout (Table + Detail Panel) ==================== */

.uptime-page {
  display: flex;
  gap: 16px;
  height: 100%;
  transition: all 0.3s ease;
}

.uptime-view {
  flex: 1;
  min-width: 0;
  overflow: auto;
  transition: all 0.3s ease;
}

/* ==================== Responsive ==================== */

@media (max-width: 1024px) {
  .page-header {
    flex-direction: column;
    gap: 12px;
  }

  .header-right {
    width: 100%;
  }

  .header-right :deep(.n-button) {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .uptime-view {
    padding: 16px 12px;
  }

  .page-title {
    font-size: 20px;
    gap: 8px;
  }

  .title-icon {
    font-size: 22px;
  }

  .stat-cards-container :deep(.n-grid) {
    grid-template-columns: repeat(2, 1fr) !important;
  }

  .filters-card :deep(.n-space) {
    flex-direction: column;
    align-items: stretch !important;
  }

  .filters-card :deep(.n-input),
  .filters-card :deep(.n-select) {
    width: 100% !important;
  }
}
</style>