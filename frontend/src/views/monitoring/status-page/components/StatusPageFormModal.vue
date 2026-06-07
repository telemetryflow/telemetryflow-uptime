<script setup lang="ts">
/**
 * Status Page Form Modal - Vertical Tabs Style
 * TASK-10: Create/Edit status page form with vertical tabs layout
 * Based on MonitorFormModal pattern
 */

import { ref, computed, watch } from "vue";
import { Icon } from "@iconify/vue";
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NSwitch,
  NButton,
  NDivider,
  NTag,
  NColorPicker,
  NPopconfirm,
  NText,
  useMessage,
} from "naive-ui";
import type { FormInst } from "naive-ui";
import type {
  StatusPage,
  CreateStatusPageRequest,
  UpdateStatusPageRequest,
  StatusPageMonitor,
} from "@/types/statuspage";
import type { Monitor } from "@/types/uptime";
import { uptimeApi } from "@/api/uptime";
import { whiteLabelConfig, brandDefaults } from "@/config/whitelabel";

const props = defineProps<{
  show: boolean;
  statusPage?: StatusPage | null;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "save", data: CreateStatusPageRequest | UpdateStatusPageRequest): void;
}>();

const message = useMessage();
const formRef = ref<FormInst | null>(null);

// ==================== FORM TABS ====================

type FormTab = "general" | "monitors" | "branding" | "display";

const activeTab = ref<FormTab>("general");

const formTabs: { label: string; value: FormTab; icon: string }[] = [
  { label: "General", value: "general", icon: "carbon:settings" },
  { label: "Monitors", value: "monitors", icon: "carbon:activity" },
  { label: "Branding", value: "branding", icon: "carbon:color-palette" },
  { label: "Display", value: "display", icon: "carbon:magnify" },
];

const tabDescriptions: Record<FormTab, string> = {
  general: "Basic settings like title, slug, description, and visibility",
  monitors: "Select and organize monitors to display on the status page",
  branding: "Customize the look with colors, logo, and custom CSS",
  display: "Configure what information is shown to visitors",
};

// ==================== MONITORS DATA ====================

const allMonitors = ref<Monitor[]>([]);
const monitorsLoading = ref(false);

interface MonitorGroup {
  id: string;
  name: string;
  monitors: StatusPageMonitor[];
}

const monitorGroups = ref<MonitorGroup[]>([]);

async function fetchMonitors() {
  monitorsLoading.value = true;
  try {
    const result = await uptimeApi.listMonitors({ pageSize: 1000 });
    allMonitors.value = result.data;
  } catch (error) {
    console.error("Failed to fetch monitors:", error);
  } finally {
    monitorsLoading.value = false;
  }
}

// Monitors that are NOT yet added
const availableMonitors = computed(() => {
  const addedMonitorIds = new Set<string>();
  monitorGroups.value.forEach((group) => {
    group.monitors.forEach((m) => addedMonitorIds.add(m.monitorId));
  });
  return allMonitors.value.filter((m) => !addedMonitorIds.has(m.id));
});

const monitorOptions = computed(() => {
  return availableMonitors.value.map((m) => ({
    label: m.name,
    value: m.id,
    status: m.status,
  }));
});

function getMonitorById(monitorId: string): Monitor | undefined {
  return allMonitors.value.find((m) => m.id === monitorId);
}

function addGroup() {
  monitorGroups.value.push({
    id: `group-${Date.now()}`,
    name: `Group ${monitorGroups.value.length + 1}`,
    monitors: [],
  });
}

function removeGroup(groupId: string) {
  const index = monitorGroups.value.findIndex((g) => g.id === groupId);
  if (index !== -1) {
    monitorGroups.value.splice(index, 1);
  }
}

function addMonitorToGroup(groupId: string, monitorId: string) {
  const group = monitorGroups.value.find((g) => g.id === groupId);
  const monitor = allMonitors.value.find((m) => m.id === monitorId);

  if (group && monitor) {
    group.monitors.push({
      monitorId: monitor.id,
      displayName: monitor.name,
      displayOrder: group.monitors.length + 1,
      isVisible: true,
    });
  }
}

function removeMonitorFromGroup(groupId: string, monitorId: string) {
  const group = monitorGroups.value.find((g) => g.id === groupId);
  if (group) {
    const index = group.monitors.findIndex((m) => m.monitorId === monitorId);
    if (index !== -1) {
      group.monitors.splice(index, 1);
    }
  }
}

// ==================== FORM DATA ====================

const form = ref<{
  // General
  title: string;
  slug: string;
  description: string;
  isPublic: boolean;

  // Branding
  brandColor: string;
  headerText: string;
  footerText: string;
  logoUrl: string;
  faviconUrl: string;
  supportUrl: string;
  customCss: string;

  // Display
  showUptimePercentage: boolean;
  showResponseTime: boolean;
  showIncidentHistory: boolean;
  showMaintenanceSchedule: boolean;
  allowSubscriptions: boolean;
  showLegend: boolean;
  historyDays: number;
  theme: "light" | "dark" | "auto";
  googleAnalyticsId: string;
}>({
  title: "",
  slug: "",
  description: "",
  isPublic: true,

  brandColor: "#10B981",
  headerText: "System Status",
  footerText: brandDefaults.poweredBy,
  logoUrl: "",
  faviconUrl: "",
  supportUrl: "",
  customCss: "",

  showUptimePercentage: true,
  showResponseTime: true,
  showIncidentHistory: true,
  showMaintenanceSchedule: true,
  allowSubscriptions: true,
  showLegend: true,
  historyDays: 90,
  theme: "light",
  googleAnalyticsId: "",
});

// ==================== VALIDATION ====================

const formRules = {
  title: [
    { required: true, message: "Title is required", trigger: "blur" },
    { min: 2, max: 100, message: "Title must be 2-100 characters", trigger: "blur" },
  ],
  slug: [
    { required: true, message: "Slug is required", trigger: "blur" },
    {
      pattern: /^[a-z0-9-]+$/,
      message: "Slug can only contain lowercase letters, numbers, and hyphens",
      trigger: "blur",
    },
  ],
};

// ==================== COMPUTED ====================

const isEditMode = computed(() => !!props.statusPage);
const modalTitle = computed(() => (isEditMode.value ? "Edit Status Page" : "Create Status Page"));

// ==================== WATCH FOR EDIT MODE ====================

watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      activeTab.value = "general";
      fetchMonitors();

      if (props.statusPage) {
        // Edit mode - populate form
        form.value = {
          title: props.statusPage.title,
          slug: props.statusPage.slug,
          description: props.statusPage.description || "",
          isPublic: props.statusPage.isPublic,

          brandColor: props.statusPage.branding.brandColor || "#10B981",
          headerText: props.statusPage.branding.headerText || "System Status",
          footerText: props.statusPage.branding.footerText || brandDefaults.poweredBy,
          logoUrl: props.statusPage.branding.logoUrl || "",
          faviconUrl: props.statusPage.branding.faviconUrl || "",
          supportUrl: props.statusPage.branding.supportUrl || "",
          customCss: props.statusPage.branding.customCss || "",

          showUptimePercentage: props.statusPage.display.showUptimePercentage,
          showResponseTime: props.statusPage.display.showResponseTime,
          showIncidentHistory: props.statusPage.display.showIncidentHistory,
          showMaintenanceSchedule: props.statusPage.display.showMaintenanceSchedule,
          allowSubscriptions: props.statusPage.display.allowSubscriptions,
          showLegend: props.statusPage.display.showLegend,
          historyDays: props.statusPage.display.historyDays,
          theme: "light",
          googleAnalyticsId: "",
        };

        // Load monitor groups
        loadMonitorGroups(props.statusPage);
      } else {
        // Create mode - reset form
        form.value = {
          title: "",
          slug: "",
          description: "",
          isPublic: true,

          brandColor: "#10B981",
          headerText: "System Status",
          footerText: brandDefaults.poweredBy,
          logoUrl: "",
          faviconUrl: "",
          supportUrl: "",
          customCss: "",

          showUptimePercentage: true,
          showResponseTime: true,
          showIncidentHistory: true,
          showMaintenanceSchedule: true,
          allowSubscriptions: true,
          showLegend: true,
          historyDays: 90,
          theme: "light",
          googleAnalyticsId: "",
        };

        // Initialize with one default group
        monitorGroups.value = [
          {
            id: "group-default",
            name: "Services",
            monitors: [],
          },
        ];
      }
    }
  }
);

function loadMonitorGroups(page: StatusPage) {
  const groupMap = new Map<string, StatusPageMonitor[]>();

  page.monitors.forEach((m) => {
    const groupName = m.groupName || "Default";
    if (!groupMap.has(groupName)) {
      groupMap.set(groupName, []);
    }
    groupMap.get(groupName)!.push(m);
  });

  monitorGroups.value = Array.from(groupMap.entries()).map(([name, monitors], idx) => ({
    id: `group-${idx}`,
    name,
    monitors,
  }));

  if (monitorGroups.value.length === 0) {
    monitorGroups.value.push({
      id: "group-default",
      name: "Services",
      monitors: [],
    });
  }
}

// ==================== ACTIONS ====================

function closeModal() {
  emit("update:show", false);
}

function generateSlug() {
  form.value.slug = form.value.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    message.warning("Please fill in all required fields");
    activeTab.value = "general";
    return;
  }

  // Build monitors list with group names
  const monitors: StatusPageMonitor[] = [];
  monitorGroups.value.forEach((group) => {
    group.monitors.forEach((m) => {
      monitors.push({
        ...m,
        groupName: group.name,
        displayOrder: monitors.length + 1,
      });
    });
  });

  const data: CreateStatusPageRequest | UpdateStatusPageRequest = {
    title: form.value.title,
    slug: form.value.slug,
    description: form.value.description || undefined,
    isPublic: form.value.isPublic,
    branding: {
      brandColor: form.value.brandColor,
      headerText: form.value.headerText,
      footerText: form.value.footerText,
      logoUrl: form.value.logoUrl || undefined,
      faviconUrl: form.value.faviconUrl || undefined,
      supportUrl: form.value.supportUrl || undefined,
      customCss: form.value.customCss || undefined,
    },
    display: {
      showUptimePercentage: form.value.showUptimePercentage,
      showResponseTime: form.value.showResponseTime,
      showIncidentHistory: form.value.showIncidentHistory,
      showMaintenanceSchedule: form.value.showMaintenanceSchedule,
      allowSubscriptions: form.value.allowSubscriptions,
      showLegend: form.value.showLegend,
      historyDays: form.value.historyDays,
      uptimeRanges: [24, 7, 30, 90],
      theme: form.value.theme,
      googleAnalyticsId: form.value.googleAnalyticsId || undefined,
    },
    monitors,
  };

  emit("save", data);
}

const themeOptions = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "Auto (System)", value: "auto" },
];

const historyDaysOptions = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
  { label: "180 days", value: 180 },
  { label: "365 days", value: 365 },
];
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="modalTitle"
    :style="{ maxWidth: '900px', width: '95vw' }"
    @update:show="$emit('update:show', $event)"
  >
    <div class="status-page-form-content">
      <!-- Left Side: Vertical Tabs -->
      <div class="form-tabs">
        <div
          v-for="tab in formTabs"
          :key="tab.value"
          class="form-tab-item"
          :class="{ active: activeTab === tab.value }"
          @click="activeTab = tab.value"
        >
          <Icon
            :icon="tab.icon"
            class="tab-icon"
          />
          <span class="tab-label">{{ tab.label }}</span>
        </div>
        <div class="tab-description">
          <p>{{ tabDescriptions[activeTab] }}</p>
        </div>
      </div>

      <!-- Right Side: Form Content -->
      <div class="form-content">
        <div class="form-box">
          <NForm
            ref="formRef"
            :model="form"
            :rules="formRules"
            label-placement="top"
          >
            <!-- General Tab -->
            <template v-if="activeTab === 'general'">
              <NFormItem
                label="Title"
                path="title"
              >
                <NInput
                  v-model:value="form.title"
                  placeholder="My Service Status"
                  @blur="!isEditMode && generateSlug()"
                />
              </NFormItem>

              <NFormItem
                label="Slug"
                path="slug"
              >
                <NInput
                  v-model:value="form.slug"
                  placeholder="my-service-status"
                >
                  <template #prefix>
                    /status/
                  </template>
                </NInput>
              </NFormItem>

              <NFormItem label="Description (Optional)">
                <NInput
                  v-model:value="form.description"
                  type="textarea"
                  placeholder="Brief description of this status page"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                />
              </NFormItem>

              <NDivider style="margin: 12px 0">
                Visibility
              </NDivider>

              <NFormItem label="Public Access">
                <div class="switch-row">
                  <NSwitch v-model:value="form.isPublic" />
                  <NText :depth="form.isPublic ? 1 : 3">
                    {{ form.isPublic ? "Anyone can view this status page" : "Only authenticated users can view" }}
                  </NText>
                </div>
              </NFormItem>
            </template>

            <!-- Monitors Tab -->
            <template v-if="activeTab === 'monitors'">
              <div class="monitors-section">
                <div class="monitors-header">
                  <NButton
                    size="small"
                    @click="addGroup"
                  >
                    <template #icon>
                      <Icon icon="carbon:add" />
                    </template>
                    Add Group
                  </NButton>
                </div>

                <!-- Monitor Groups -->
                <div class="monitor-groups-list">
                  <div
                    v-for="group in monitorGroups"
                    :key="group.id"
                    class="monitor-group-item"
                  >
                    <div class="group-header">
                      <NInput
                        v-model:value="group.name"
                        size="small"
                        placeholder="Group name"
                        class="group-name-input"
                      />
                      <NPopconfirm @positive-click="removeGroup(group.id)">
                        <template #trigger>
                          <NButton
                            text
                            type="error"
                            size="tiny"
                          >
                            <Icon icon="carbon:trash-can" />
                          </NButton>
                        </template>
                        Remove this group and all its monitors?
                      </NPopconfirm>
                    </div>

                    <!-- Monitors in group -->
                    <div class="group-monitors">
                      <div
                        v-for="spm in group.monitors"
                        :key="spm.monitorId"
                        class="monitor-item"
                      >
                        <div class="monitor-info">
                          <NTag
                            v-if="monitorsLoading"
                            type="default"
                            size="small"
                            :bordered="false"
                          >
                            ...
                          </NTag>
                          <NTag
                            v-else
                            :type="getMonitorById(spm.monitorId)?.status === 'up' ? 'success' : getMonitorById(spm.monitorId)?.status === 'down' ? 'error' : getMonitorById(spm.monitorId) ? 'warning' : 'default'"
                            size="small"
                            :bordered="false"
                          >
                            {{ getMonitorById(spm.monitorId)?.status?.toUpperCase() || (getMonitorById(spm.monitorId) ? 'PENDING' : 'REMOVED') }}
                          </NTag>
                          <span class="monitor-name">
                            {{ spm.displayName || getMonitorById(spm.monitorId)?.name || spm.monitorId }}
                          </span>
                        </div>
                        <NButton
                          text
                          type="error"
                          size="tiny"
                          @click="removeMonitorFromGroup(group.id, spm.monitorId)"
                        >
                          <Icon icon="carbon:close" />
                        </NButton>
                      </div>

                      <!-- Add monitor to group -->
                      <NSelect
                        placeholder="Add a monitor..."
                        :options="monitorOptions"
                        :loading="monitorsLoading"
                        filterable
                        clearable
                        size="small"
                        class="add-monitor-select"
                        @update:value="(id) => { if (id) addMonitorToGroup(group.id, id); }"
                      >
                        <template #empty>
                          <div class="select-empty">
                            All monitors have been added
                          </div>
                        </template>
                      </NSelect>
                    </div>
                  </div>
                </div>

                <div
                  v-if="monitorGroups.length === 0"
                  class="empty-monitors"
                >
                  <Icon
                    icon="carbon:activity"
                    class="empty-icon"
                  />
                  <p>No monitor groups configured</p>
                  <p class="hint">
                    Click "Add Group" to create a group and add monitors
                  </p>
                </div>
              </div>
            </template>

            <!-- Branding Tab -->
            <template v-if="activeTab === 'branding'">
              <NFormItem label="Brand Color">
                <div class="color-picker-row">
                  <NColorPicker
                    v-model:value="form.brandColor"
                    :show-alpha="false"
                  />
                  <NInput
                    v-model:value="form.brandColor"
                    class="color-hex-input"
                  />
                </div>
              </NFormItem>

              <NFormItem label="Header Text">
                <NInput
                  v-model:value="form.headerText"
                  placeholder="System Status"
                />
              </NFormItem>

              <NFormItem label="Footer Text">
                <NInput
                  v-model:value="form.footerText"
                  type="textarea"
                  :placeholder="brandDefaults.poweredBy"
                  :autosize="{ minRows: 2, maxRows: 3 }"
                />
                <template #feedback>
                  <span class="form-hint">Markdown supported</span>
                </template>
              </NFormItem>

              <NDivider style="margin: 12px 0">
                Assets
              </NDivider>

              <NFormItem label="Logo URL (Optional)">
                <NInput
                  v-model:value="form.logoUrl"
                  :placeholder="'https://' + brandDefaults.domain + '/logo.png'"
                />
              </NFormItem>

              <NFormItem label="Favicon URL (Optional)">
                <NInput
                  v-model:value="form.faviconUrl"
                  :placeholder="'https://' + brandDefaults.domain + '/favicon.ico'"
                />
              </NFormItem>

              <NFormItem label="Support URL (Optional)">
                <NInput
                  v-model:value="form.supportUrl"
                  :placeholder="whiteLabelConfig.links.support || ''"
                />
              </NFormItem>

              <NDivider style="margin: 12px 0">
                Custom Styling
              </NDivider>

              <NFormItem label="Custom CSS (Optional)">
                <NInput
                  v-model:value="form.customCss"
                  type="textarea"
                  placeholder="/* Custom CSS */"
                  :autosize="{ minRows: 4, maxRows: 8 }"
                  class="code-input"
                />
              </NFormItem>
            </template>

            <!-- Display Tab -->
            <template v-if="activeTab === 'display'">
              <NFormItem label="Theme">
                <NSelect
                  v-model:value="form.theme"
                  :options="themeOptions"
                />
              </NFormItem>

              <NFormItem label="History Days">
                <NSelect
                  v-model:value="form.historyDays"
                  :options="historyDaysOptions"
                />
                <template #feedback>
                  <span class="form-hint">Number of days to show in uptime history</span>
                </template>
              </NFormItem>

              <NDivider style="margin: 12px 0">
                Visible Elements
              </NDivider>

              <div class="toggle-options">
                <div class="toggle-option">
                  <NSwitch v-model:value="form.showUptimePercentage" />
                  <div class="toggle-label">
                    <span class="toggle-title">Show Uptime Percentage</span>
                    <span class="toggle-desc">Display uptime % for each monitor</span>
                  </div>
                </div>

                <div class="toggle-option">
                  <NSwitch v-model:value="form.showResponseTime" />
                  <div class="toggle-label">
                    <span class="toggle-title">Show Response Time</span>
                    <span class="toggle-desc">Display average response time</span>
                  </div>
                </div>

                <div class="toggle-option">
                  <NSwitch v-model:value="form.showIncidentHistory" />
                  <div class="toggle-label">
                    <span class="toggle-title">Show Incident History</span>
                    <span class="toggle-desc">Display past incidents timeline</span>
                  </div>
                </div>

                <div class="toggle-option">
                  <NSwitch v-model:value="form.showMaintenanceSchedule" />
                  <div class="toggle-label">
                    <span class="toggle-title">Show Maintenance Schedule</span>
                    <span class="toggle-desc">Display upcoming maintenance</span>
                  </div>
                </div>

                <div class="toggle-option">
                  <NSwitch v-model:value="form.allowSubscriptions" />
                  <div class="toggle-label">
                    <span class="toggle-title">Allow Subscriptions</span>
                    <span class="toggle-desc">Let visitors subscribe to updates</span>
                  </div>
                </div>

                <div class="toggle-option">
                  <NSwitch v-model:value="form.showLegend" />
                  <div class="toggle-label">
                    <span class="toggle-title">Show Legend</span>
                    <span class="toggle-desc">Display status color legend</span>
                  </div>
                </div>
              </div>

              <NDivider style="margin: 16px 0">
                Analytics
              </NDivider>

              <NFormItem label="Google Analytics ID (Optional)">
                <NInput
                  v-model:value="form.googleAnalyticsId"
                  placeholder="G-XXXXXXXXXX"
                />
              </NFormItem>
            </template>
          </NForm>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer tfo-modal-footer">
        <NButton
          type="primary"
          ghost
          @click="closeModal"
        >
          <template #icon>
            <Icon icon="carbon:close" />
          </template>
          Cancel
        </NButton>
        <NButton
          type="primary"
          @click="handleSave"
        >
          <template #icon>
            <Icon icon="carbon:save" />
          </template>
          {{ isEditMode ? "Save Changes" : "Create Status Page" }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
.status-page-form-content {
  display: flex;
  gap: 16px;
  max-height: calc(75vh - 120px);
  overflow: hidden;
}

.form-tabs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
  max-width: 160px;
  border-right: 1px solid var(--n-border-color);
  padding-right: 16px;
}

.form-tab-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--n-text-color-3);

  &:hover {
    background: rgba(99, 102, 241, 0.08);
    color: var(--n-text-color);
  }

  &.active {
    background: rgba(99, 102, 241, 0.15);
    color: var(--n-primary-color);

    .tab-icon {
      color: var(--n-primary-color);
    }
  }

  .tab-icon {
    font-size: 18px;
    transition: color 0.2s ease;
  }

  .tab-label {
    white-space: nowrap;
  }
}

.tab-description {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--n-border-color);

  p {
    margin: 0;
    font-size: 0.75rem;
    color: var(--n-text-color-3);
    line-height: 1.5;
  }
}

.form-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;

  .form-box {
    min-width: 300px;
    background: var(--n-action-color);
    border: 1px solid var(--n-border-color);
    border-radius: 8px;
    padding: 16px;
  }

  :deep(.n-form-item) {
    margin-bottom: 12px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(.n-form-item-label) {
    font-weight: 500;
    font-size: 13px;
    margin-bottom: 4px;
  }
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.form-hint {
  font-size: 11px;
  color: var(--n-text-color-3);
  margin-top: 4px;
}

.code-input {
  :deep(textarea) {
    font-family: "SF Mono", Monaco, monospace;
    font-size: 12px;
  }
}

.color-picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 250px;
  min-width: 180px;

  .color-hex-input {
    width: 180px;
  }
}

// ==================== MONITORS SECTION ====================

.monitors-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.monitors-header {
  display: flex;
  justify-content: flex-end;
}

.monitor-groups-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.monitor-group-item {
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.02);
  border-bottom: 1px solid var(--n-border-color);

  :root.dark & {
    background: rgba(255, 255, 255, 0.02);
  }
}

.group-name-input {
  flex: 1;
  max-width: 200px;

  :deep(.n-input__input-el) {
    font-weight: 600;
  }
}

.group-monitors {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.monitor-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--n-color);
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
}

.monitor-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.monitor-name {
  font-size: 13px;
  font-weight: 500;
}

.add-monitor-select {
  margin-top: 4px;
}

.select-empty {
  padding: 12px;
  text-align: center;
  color: var(--n-text-color-3);
  font-size: 12px;
}

.empty-monitors {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;

  .empty-icon {
    font-size: 48px;
    color: var(--n-text-color-3);
    opacity: 0.5;
    margin-bottom: 12px;
  }

  p {
    margin: 0;
    color: var(--n-text-color-2);
    font-size: 14px;

    &.hint {
      font-size: 12px;
      color: var(--n-text-color-3);
      margin-top: 4px;
    }
  }
}

// ==================== DISPLAY TAB ====================

.toggle-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toggle-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  background: var(--n-color);
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
}

.toggle-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-title {
  font-size: 13px;
  font-weight: 500;
}

.toggle-desc {
  font-size: 11px;
  color: var(--n-text-color-3);
}

// ==================== FOOTER ====================

.modal-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding-top: 15px;
  border-top: 1px solid var(--n-border-color);

  :deep(.n-button) {
    width: 180px;
    height: 36px !important;
    line-height: 34px;
    padding: 0 !important;
    box-sizing: border-box;
  }
}

// ==================== RESPONSIVE ====================

@media (max-width: 768px) {
  .status-page-form-content {
    flex-direction: column;
    max-height: calc(80vh - 120px);
  }

  .form-tabs {
    flex-direction: row;
    flex-wrap: wrap;
    max-width: 100%;
    min-width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--n-border-color);
    padding-right: 0;
    padding-bottom: 12px;
    gap: 8px;
  }

  .form-tab-item {
    padding: 8px 12px;
    flex: 1;
    justify-content: center;
    min-width: calc(50% - 4px);

    .tab-label {
      font-size: 12px;
    }

    .tab-icon {
      font-size: 16px;
    }
  }

  .tab-description {
    display: none;
  }

  .form-content {
    .form-box {
      padding: 12px;
    }
  }

  .modal-footer {
    flex-direction: column-reverse;

    :deep(.n-button) {
      width: 100%;
    }
  }
}
</style>