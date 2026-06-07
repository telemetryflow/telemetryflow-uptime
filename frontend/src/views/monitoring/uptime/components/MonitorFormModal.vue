<script setup lang="ts">
/**
 * Monitor Form Modal - Vertical Tabs Style
 * TASK-09: Create/Edit monitor form with vertical tabs layout
 * Based on NotificationChannels.vue pattern
 */

import { ref, computed, watch } from "vue";
import { Icon } from "@iconify/vue";
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NButton,
  NDivider,
  NTag,
  NCheckbox,
  useMessage,
} from "naive-ui";
import type { FormInst } from "naive-ui";
import type {
  MonitorType,
  HttpMethod,
  Monitor,
  CreateMonitorRequest,
  UpdateMonitorRequest,
} from "@/types/uptime";
import { MONITOR_TYPES } from "@/types/uptime";
import TagBadge from "@/components/common/TagBadge.vue";
import { getChannelIcon } from "@/utils";
import { brandDefaults } from "@/config";
import uptimeApi from "@/api/uptime";

// Authentication method types
type AuthMethod = "none" | "basic" | "bearer" | "api_key" | "digest" | "ntlm" | "oauth2";

const props = defineProps<{
  show: boolean;
  monitor?: Monitor | null;
  notificationChannels?: Array<{ id: string; name: string; type: string; enabled: boolean }>;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "save", data: CreateMonitorRequest | UpdateMonitorRequest): void;
}>();

const message = useMessage();
const formRef = ref<FormInst | null>(null);

// ==================== FORM TABS ====================

type FormTab = "general" | "notifications" | "http" | "advanced";

const activeTab = ref<FormTab>("general");

const formTabs: { label: string; value: FormTab; icon: string }[] = [
  { label: "General", value: "general", icon: "carbon:settings" },
  { label: "Notifications", value: "notifications", icon: "carbon:notification" },
  { label: "HTTP Options", value: "http", icon: "carbon:http" },
  { label: "Advanced", value: "advanced", icon: "carbon:settings-adjust" },
];

const tabDescriptions: Record<FormTab, string> = {
  general: "Basic monitor settings including type, URL, and check intervals",
  notifications: "Configure which notification channels receive alerts",
  http: "HTTP-specific settings like method, headers, and body",
  advanced: "SSL certificate monitoring, redirects, and status codes",
};

// ==================== MONITOR TYPE OPTIONS ====================

const flatTypeOptions = computed(() => {
  const types: MonitorType[] = ["http", "https", "tcp", "ping", "dns", "udp", "smtp", "pop3", "imap", "postgres", "mysql", "mongodb", "redis", "kafka", "rabbitmq", "mqtt", "grpc", "websocket", "ssl_certificate", "docker", "keyword", "json_query", "custom"];
  return types.map(t => ({ label: MONITOR_TYPES[t].label, value: t }));
});

// ==================== FORM DATA ====================

const form = ref<{
  // General
  name: string;
  type: MonitorType;
  url: string;
  description: string;
  interval: number;
  timeout: number;
  retries: number;
  tags: string[];

  // Notifications
  notificationChannelIds: string[];

  // HTTP Options
  httpMethod: HttpMethod;
  httpBodyEncoding: "json" | "xml" | "form" | "raw";
  httpBody: string;
  httpHeaders: string;

  // Authentication
  authMethod: AuthMethod;
  authUsername: string;
  authPassword: string;
  authBearerToken: string;
  authApiKeyHeader: string;
  authApiKeyValue: string;
  authApiKeyLocation: "header" | "query";
  authOAuth2TokenUrl: string;
  authOAuth2ClientId: string;
  authOAuth2ClientSecret: string;
  authOAuth2Scope: string;

  // Advanced
  sslCertExpiryNotify: number;
  ignoreTlsErrors: boolean;
  maxRedirects: number;
  acceptedStatusCodes: string[];
  upsideDown: boolean;
  environment: string;
}>({
  name: "",
  type: "https",
  url: "",
  description: "",
  interval: 60,
  timeout: 30,
  retries: 3,
  tags: [],
  notificationChannelIds: [],
  httpMethod: "GET",
  httpBodyEncoding: "json",
  httpBody: "",
  httpHeaders: "",
  // Authentication defaults
  authMethod: "none",
  authUsername: "",
  authPassword: "",
  authBearerToken: "",
  authApiKeyHeader: "X-API-Key",
  authApiKeyValue: "",
  authApiKeyLocation: "header",
  authOAuth2TokenUrl: "",
  authOAuth2ClientId: "",
  authOAuth2ClientSecret: "",
  authOAuth2Scope: "",
  // Advanced
  sslCertExpiryNotify: 30,
  ignoreTlsErrors: false,
  maxRedirects: 5,
  acceptedStatusCodes: ["200-299"],
  upsideDown: false,
  environment: "",
});

const httpMethodOptions = [
  { label: "GET", value: "GET" },
  { label: "POST", value: "POST" },
  { label: "PUT", value: "PUT" },
  { label: "PATCH", value: "PATCH" },
  { label: "DELETE", value: "DELETE" },
  { label: "HEAD", value: "HEAD" },
  { label: "OPTIONS", value: "OPTIONS" },
];

const environmentOptions = [
  { label: "None", value: "" },
  { label: "Production", value: "production" },
  { label: "Staging", value: "staging" },
  { label: "Development", value: "development" },
  { label: "Internal", value: "internal" },
];

// Collapse individual status codes into ranges: [200,201,202,203,204,301,302] → ["200-204","301","302"]
function collapseStatusCodes(codes: number[]): string[] {
  if (!codes || codes.length === 0) return [];
  const sorted = [...new Set(codes)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? String(start) : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? String(start) : `${start}-${end}`);
  return ranges;
}

// Helper to extract environment from tags
function getEnvironmentFromTags(tags: string[]): string {
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase();
    if (lowerTag === "production" || lowerTag === "prod") return "production";
    if (lowerTag === "staging" || lowerTag === "stage") return "staging";
    if (lowerTag === "development" || lowerTag === "dev") return "development";
    if (lowerTag === "internal") return "internal";
  }
  return "";
}

const bodyEncodingOptions = [
  { label: "JSON", value: "json" },
  { label: "XML", value: "xml" },
  { label: "Form Data", value: "form" },
  { label: "Raw", value: "raw" },
];

const intervalOptions = [
  { label: "10 seconds", value: 10 },
  { label: "20 seconds", value: 20 },
  { label: "30 seconds", value: 30 },
  { label: "60 seconds (1 min)", value: 60 },
  { label: "120 seconds (2 min)", value: 120 },
  { label: "180 seconds (3 min)", value: 180 },
  { label: "300 seconds (5 min)", value: 300 },
  { label: "600 seconds (10 min)", value: 600 },
  { label: "1800 seconds (30 min)", value: 1800 },
  { label: "3600 seconds (1 hour)", value: 3600 },
];

const authMethodOptions = [
  { label: "None", value: "none" },
  { label: "Basic Authentication", value: "basic" },
  { label: "Bearer Token", value: "bearer" },
  { label: "API Key", value: "api_key" },
  { label: "Digest Authentication", value: "digest" },
  { label: "NTLM", value: "ntlm" },
  { label: "OAuth 2.0", value: "oauth2" },
];

const apiKeyLocationOptions = [
  { label: "Header", value: "header" },
  { label: "Query Parameter", value: "query" },
];

// Status code options — grouped: ranges first, then individual codes
const statusCodeOptions = [
  // Range categories
  { type: "group", label: "Ranges", key: "ranges", children: [
    { label: "200-299 (2xx Success)", value: "200-299" },
    { label: "300-399 (3xx Redirects)", value: "300-399" },
    { label: "400-499 (4xx Client Errors)", value: "400-499" },
    { label: "500-599 (5xx Server Errors)", value: "500-599" },
  ]},
  // Individual 2xx
  { type: "group", label: "2xx Success", key: "2xx", children: [
    { label: "200 OK", value: "200" },
    { label: "201 Created", value: "201" },
    { label: "202 Accepted", value: "202" },
    { label: "204 No Content", value: "204" },
  ]},
  // Individual 3xx
  { type: "group", label: "3xx Redirects", key: "3xx", children: [
    { label: "301 Moved Permanently", value: "301" },
    { label: "302 Found", value: "302" },
    { label: "304 Not Modified", value: "304" },
    { label: "307 Temporary Redirect", value: "307" },
    { label: "308 Permanent Redirect", value: "308" },
  ]},
  // Individual 4xx
  { type: "group", label: "4xx Client Errors", key: "4xx", children: [
    { label: "400 Bad Request", value: "400" },
    { label: "401 Unauthorized", value: "401" },
    { label: "403 Forbidden", value: "403" },
    { label: "404 Not Found", value: "404" },
    { label: "429 Too Many Requests", value: "429" },
  ]},
  // Individual 5xx
  { type: "group", label: "5xx Server Errors", key: "5xx", children: [
    { label: "500 Internal Server Error", value: "500" },
    { label: "502 Bad Gateway", value: "502" },
    { label: "503 Service Unavailable", value: "503" },
    { label: "504 Gateway Timeout", value: "504" },
  ]},
] as any;

// ==================== VALIDATION ====================

const formRules = {
  name: [{ required: true, message: "Name is required", trigger: "blur" }],
  url: [{ required: true, message: "URL is required", trigger: "blur" }],
};

// ==================== WATCH FOR EDIT MODE ====================

const isEditMode = computed(() => !!props.monitor);
const modalTitle = computed(() => isEditMode.value ? "Edit Monitor" : "Add New Monitor");

watch(() => props.show, (newVal) => {
  if (newVal) {
    activeTab.value = "general";
    if (props.monitor) {
      // Edit mode - populate form
      form.value = {
        name: props.monitor.name,
        type: props.monitor.type,
        url: props.monitor.url,
        description: props.monitor.description || "",
        interval: props.monitor.interval,
        timeout: props.monitor.timeout,
        retries: props.monitor.retries,
        tags: [...props.monitor.tags],
        notificationChannelIds: [...(props.monitor.notificationChannels || [])],
        httpMethod: props.monitor.httpMethod || "GET",
        httpBodyEncoding: "json",
        httpBody: props.monitor.httpBody || "",
        httpHeaders: props.monitor.httpHeaders ? JSON.stringify(props.monitor.httpHeaders, null, 2) : "",
        // Authentication - preserve existing if available
        authMethod: (props.monitor as any).authMethod || "none",
        authUsername: (props.monitor as any).authUsername || "",
        authPassword: "",
        authBearerToken: "",
        authApiKeyHeader: (props.monitor as any).authApiKeyHeader || "X-API-Key",
        authApiKeyValue: "",
        authApiKeyLocation: (props.monitor as any).authApiKeyLocation || "header",
        authOAuth2TokenUrl: (props.monitor as any).authOAuth2TokenUrl || "",
        authOAuth2ClientId: (props.monitor as any).authOAuth2ClientId || "",
        authOAuth2ClientSecret: "",
        authOAuth2Scope: (props.monitor as any).authOAuth2Scope || "",
        // Advanced
        sslCertExpiryNotify: props.monitor.sslExpiryWarningDays ?? 30,
        ignoreTlsErrors: props.monitor.ignoreTlsErrors ?? false,
        maxRedirects: props.monitor.maxRedirects ?? 5,
        acceptedStatusCodes: props.monitor.acceptedStatusCodes?.length
          ? collapseStatusCodes(props.monitor.acceptedStatusCodes)
          : ["200-299"],
        upsideDown: props.monitor.upsideDown ?? false,
        environment: getEnvironmentFromTags(props.monitor.tags),
      };
    } else {
      // Create mode - reset form
      form.value = {
        name: "",
        type: "https",
        url: "",
        description: "",
        interval: 60,
        timeout: 30,
        retries: 3,
        tags: [],
        notificationChannelIds: [],
        httpMethod: "GET",
        httpBodyEncoding: "json",
        httpBody: "",
        httpHeaders: "",
        // Authentication defaults
        authMethod: "none",
        authUsername: "",
        authPassword: "",
        authBearerToken: "",
        authApiKeyHeader: "X-API-Key",
        authApiKeyValue: "",
        authApiKeyLocation: "header",
        authOAuth2TokenUrl: "",
        authOAuth2ClientId: "",
        authOAuth2ClientSecret: "",
        authOAuth2Scope: "",
        // Advanced
        sslCertExpiryNotify: 30,
        ignoreTlsErrors: false,
        maxRedirects: 5,
        acceptedStatusCodes: ["200-299"],
        upsideDown: false,
        environment: "",
      };
    }
  }
});

// ==================== ACTIONS ====================

function closeModal() {
  emit("update:show", false);
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    message.warning("Please fill in all required fields");
    activeTab.value = "general";
    return;
  }

  // Additional validation
  if (!form.value.name || !form.value.name.trim()) {
    message.error("Monitor name is required");
    activeTab.value = "general";
    return;
  }
  if (!form.value.url || !form.value.url.trim()) {
    message.error("Monitor URL is required");
    activeTab.value = "general";
    return;
  }

  // Parse headers
  let headers: Record<string, string> | undefined;
  if (form.value.httpHeaders.trim()) {
    try {
      headers = JSON.parse(form.value.httpHeaders);
    } catch {
      message.warning("Invalid JSON format for headers");
      activeTab.value = "http";
      return;
    }
  }

  // Parse accepted status codes from array
  let acceptedStatusCodes: number[] | undefined;
  if (form.value.acceptedStatusCodes.length > 0) {
    const codes: number[] = [];
    for (const part of form.value.acceptedStatusCodes) {
      if (part.includes("-")) {
        const [start, end] = part.split("-").map(n => parseInt(n.trim()));
        for (let i = start; i <= end; i++) {
          codes.push(i);
        }
      } else {
        codes.push(parseInt(part));
      }
    }
    acceptedStatusCodes = codes;
  }

  // Build tags array including environment
  const tags = [...form.value.tags];
  // Remove any existing environment tags
  const envTags = ["production", "prod", "staging", "stage", "development", "dev", "internal"];
  const filteredTags = tags.filter(t => !envTags.includes(t.toLowerCase()));
  // Add selected environment tag
  if (form.value.environment) {
    filteredTags.unshift(form.value.environment);
  }

  const data: CreateMonitorRequest | UpdateMonitorRequest = {
    name: form.value.name.trim(),
    url: form.value.url.trim(),
    type: form.value.type,
    description: form.value.description?.trim() || undefined,
    interval: form.value.interval,
    timeout: form.value.timeout,
    retries: form.value.retries,
    tags: filteredTags,
    httpConfig: (form.value.type === "http" || form.value.type === "https") ? {
      method: form.value.httpMethod,
      headers,
      body: form.value.httpBody || undefined,
      acceptedStatusCodes,
      maxRedirects: form.value.maxRedirects,
      ignoreTlsErrors: form.value.ignoreTlsErrors,
    } : undefined,
    sslConfig: { expiryDaysWarning: form.value.sslCertExpiryNotify },
    metadata: { upsideDown: form.value.upsideDown },
    notificationChannels: form.value.notificationChannelIds.length > 0 ? form.value.notificationChannelIds : undefined,
  };

  emit("save", data);
}

// ==================== TEST CHECK ====================

const isTesting = ref(false);
const testResult = ref<{
  status: "success" | "failure" | "timeout";
  statusCode?: number;
  responseTime: number;
  message?: string;
  error?: string;
} | null>(null);

async function handleTest() {
  if (!form.value.url?.trim()) {
    message.warning("Please enter a URL to test");
    activeTab.value = "general";
    return;
  }

  isTesting.value = true;
  testResult.value = null;

  try {
    // Parse headers for the test payload
    let headers: Record<string, string> | undefined;
    if (form.value.httpHeaders?.trim()) {
      try {
        headers = JSON.parse(form.value.httpHeaders);
      } catch {
        // ignore invalid headers for test
      }
    }

    const result = await uptimeApi.testMonitor({
      url: form.value.url.trim(),
      type: form.value.type,
      timeout: form.value.timeout,
      http_config: (form.value.type === "http" || form.value.type === "https")
        ? {
            method: form.value.httpMethod as any,
            headers,
            body: form.value.httpBody || undefined,
            ignore_tls_errors: form.value.ignoreTlsErrors,
          }
        : undefined,
    });

    testResult.value = result as any;

    if (result.status === "success") {
      message.success(`✓ Reachable — ${result.responseTime}ms${result.statusCode ? ` (HTTP ${result.statusCode})` : ""}`);
    } else {
      message.error(`✗ Failed — ${result.error || result.message || "Unreachable"}`);
    }
  } catch (err: any) {
    message.error(`Test failed: ${err?.message || "Unknown error"}`);
  } finally {
    isTesting.value = false;
  }
}

// Show HTTP tab only for HTTP/HTTPS types
const showHttpTab = computed(() => form.value.type === "http" || form.value.type === "https");

// Tag input state
const newTagValue = ref("");

function addTag() {
  const tag = newTagValue.value.trim();
  if (tag && !form.value.tags.includes(tag)) {
    form.value.tags.push(tag);
  }
  newTagValue.value = "";
}


// ==================== CHANNEL ICON & COLOR ====================

type ChannelType = "email" | "slack" | "discord" | "msteams" | "zoom" | "telegram" | "webhook" | "pagerduty" | "opsgenie";

function getChannelColor(type: string): { color: string; bg: string } {
  const colors: Record<ChannelType, { color: string; bg: string }> = {
    email: { color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" },
    slack: { color: "#e01e5a", bg: "rgba(224, 30, 90, 0.1)" },
    discord: { color: "#5865f2", bg: "rgba(88, 101, 242, 0.1)" },
    msteams: { color: "#6264a7", bg: "rgba(98, 100, 167, 0.1)" },
    zoom: { color: "#2d8cff", bg: "rgba(45, 140, 255, 0.1)" },
    telegram: { color: "#26a5e4", bg: "rgba(38, 165, 228, 0.1)" },
    webhook: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)" },
    pagerduty: { color: "#06ac38", bg: "rgba(6, 172, 56, 0.1)" },
    opsgenie: { color: "#2684ff", bg: "rgba(38, 132, 255, 0.1)" },
  };
  return colors[type as ChannelType] || { color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)" };
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="modalTitle"
    :style="{ maxWidth: '860px', width: '95vw' }"
    @update:show="$emit('update:show', $event)"
  >
    <div class="monitor-form-content">
      <!-- Left Side: Vertical Tabs -->
      <div class="form-tabs">
        <div
          v-for="tab in formTabs"
          :key="tab.value"
          class="form-tab-item"
          :class="{
            active: activeTab === tab.value,
            disabled: tab.value === 'http' && !showHttpTab,
          }"
          @click="tab.value !== 'http' || showHttpTab ? (activeTab = tab.value) : null"
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
                label="Monitor Type"
                path="type"
              >
                <NSelect
                  v-model:value="form.type"
                  :options="flatTypeOptions"
                  placeholder="Select monitor type"
                />
              </NFormItem>

              <NFormItem
                label="Friendly Name"
                path="name"
              >
                <NInput
                  v-model:value="form.name"
                  placeholder="My API Monitor"
                />
              </NFormItem>

              <NFormItem
                label="URL / Host"
                path="url"
              >
                <NInput
                  v-model:value="form.url"
                  :placeholder="brandDefaults.exampleUrl('api', '/health')"
                />
              </NFormItem>

              <NFormItem label="Description (Optional)">
                <NInput
                  v-model:value="form.description"
                  type="textarea"
                  placeholder="Brief description of this monitor"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                />
              </NFormItem>

              <NDivider style="margin: 12px 0">
                Check Settings
              </NDivider>

              <div class="form-row">
                <NFormItem label="Heartbeat Interval">
                  <NSelect
                    v-model:value="form.interval"
                    :options="intervalOptions"
                    style="width: 100%"
                  />
                </NFormItem>
                <NFormItem label="Request Timeout">
                  <NInputNumber
                    v-model:value="form.timeout"
                    :min="5"
                    :max="300"
                    style="width: 100%"
                  >
                    <template #suffix>
                      sec
                    </template>
                  </NInputNumber>
                </NFormItem>
              </div>

              <div class="form-row">
                <NFormItem label="Retries">
                  <NInputNumber
                    v-model:value="form.retries"
                    :min="0"
                    :max="10"
                    style="width: 100%"
                  />
                </NFormItem>
                <NFormItem label="Resend if Status Changed">
                  <div class="switch-align">
                    <NSwitch />
                  </div>
                </NFormItem>
              </div>

              <NFormItem label="Tags">
                <div class="tags-input-wrapper">
                  <div class="tags-display">
                    <NTag
                      v-for="(tag, index) in form.tags"
                      :key="`${tag}-${index}`"
                      closable
                      :bordered="false"
                      size="medium"
                      class="tag-item"
                      @close="form.tags.splice(index, 1)"
                    >
                      {{ tag }}
                    </NTag>
                    <NInput
                      v-model:value="newTagValue"
                      size="small"
                      placeholder="Enter tag and press Enter"
                      class="tag-input-inline"
                      @keyup.enter="addTag"
                    />
                  </div>
                </div>
              </NFormItem>
            </template>

            <!-- Notifications Tab -->
            <template v-if="activeTab === 'notifications'">
              <div
                v-if="!notificationChannels?.length"
                class="empty-notifications"
              >
                <Icon
                  icon="carbon:notification-off"
                  class="empty-icon"
                />
                <p>No notification channels configured</p>
                <p class="hint">
                  Go to Settings > Notification Channels to add channels
                </p>
              </div>

              <div
                v-else
                class="notification-channels-list"
              >
                <p class="section-hint">
                  Select channels to receive alerts when this monitor changes status
                </p>
                <div
                  v-for="channel in notificationChannels"
                  :key="channel.id"
                  class="notification-channel-item"
                >
                  <div class="channel-info">
                    <NCheckbox
                      :checked="form.notificationChannelIds.includes(channel.id)"
                      @update:checked="(checked) => {
                        if (checked) {
                          form.notificationChannelIds.push(channel.id);
                        } else {
                          form.notificationChannelIds = form.notificationChannelIds.filter(id => id !== channel.id);
                        }
                      }"
                    />
                    <Icon
                      :icon="getChannelIcon(channel.type)"
                      :style="{ color: getChannelColor(channel.type).color, fontSize: '18px', flexShrink: 0 }"
                    />
                    <span class="channel-name">{{ channel.name }}</span>
                    <NTag
                      size="small"
                      :bordered="false"
                      :style="{
                        backgroundColor: getChannelColor(channel.type).bg,
                        color: getChannelColor(channel.type).color,
                      }"
                    >
                      {{ channel.type.toUpperCase() }}
                    </NTag>
                  </div>
                  <NSwitch
                    :value="channel.enabled"
                    disabled
                    size="small"
                  />
                </div>
              </div>
            </template>

            <!-- HTTP Options Tab -->
            <template v-if="activeTab === 'http'">
              <NFormItem label="HTTP Method">
                <NSelect
                  v-model:value="form.httpMethod"
                  :options="httpMethodOptions"
                />
              </NFormItem>

              <div class="form-row">
                <NFormItem label="Body Encoding">
                  <NSelect
                    v-model:value="form.httpBodyEncoding"
                    :options="bodyEncodingOptions"
                  />
                </NFormItem>
              </div>

              <NFormItem label="Body">
                <NInput
                  v-model:value="form.httpBody"
                  type="textarea"
                  placeholder="Example:
{
  &quot;key&quot;: &quot;value&quot;
}"
                  :autosize="{ minRows: 4, maxRows: 6 }"
                  style="font-family: monospace"
                />
              </NFormItem>

              <NFormItem label="Headers">
                <NInput
                  v-model:value="form.httpHeaders"
                  type="textarea"
                  placeholder="Example:
{
  &quot;HeaderName&quot;: &quot;HeaderValue&quot;
}"
                  :autosize="{ minRows: 4, maxRows: 6 }"
                  style="font-family: monospace"
                />
              </NFormItem>

              <NDivider style="margin: 16px 0">
                Authentication
              </NDivider>

              <NFormItem label="Method">
                <NSelect
                  v-model:value="form.authMethod"
                  :options="authMethodOptions"
                />
              </NFormItem>

              <!-- Basic Auth -->
              <template
                v-if="form.authMethod === 'basic' || form.authMethod === 'digest' || form.authMethod === 'ntlm'"
              >
                <NFormItem label="Username">
                  <NInput
                    v-model:value="form.authUsername"
                    placeholder="Enter username"
                  />
                </NFormItem>
                <NFormItem label="Password">
                  <NInput
                    v-model:value="form.authPassword"
                    type="password"
                    show-password-on="click"
                    placeholder="Enter password"
                  />
                </NFormItem>
              </template>

              <!-- Bearer Token -->
              <template v-if="form.authMethod === 'bearer'">
                <NFormItem label="Token">
                  <NInput
                    v-model:value="form.authBearerToken"
                    type="password"
                    show-password-on="click"
                    placeholder="Enter bearer token"
                  />
                  <template #feedback>
                    <span class="form-hint">The token will be sent as: Authorization: Bearer &lt;token&gt;</span>
                  </template>
                </NFormItem>
              </template>

              <!-- API Key -->
              <template v-if="form.authMethod === 'api_key'">
                <div class="form-row">
                  <NFormItem label="Key Name">
                    <NInput
                      v-model:value="form.authApiKeyHeader"
                      placeholder="X-API-Key"
                    />
                  </NFormItem>
                  <NFormItem label="Location">
                    <NSelect
                      v-model:value="form.authApiKeyLocation"
                      :options="apiKeyLocationOptions"
                    />
                  </NFormItem>
                </div>
                <NFormItem label="Key Value">
                  <NInput
                    v-model:value="form.authApiKeyValue"
                    type="password"
                    show-password-on="click"
                    placeholder="Enter API key value"
                  />
                </NFormItem>
              </template>

              <!-- OAuth 2.0 -->
              <template v-if="form.authMethod === 'oauth2'">
                <NFormItem label="Token URL">
                  <NInput
                    v-model:value="form.authOAuth2TokenUrl"
                    :placeholder="brandDefaults.exampleUrl('auth', '/oauth/token')"
                  />
                </NFormItem>
                <div class="form-row">
                  <NFormItem label="Client ID">
                    <NInput
                      v-model:value="form.authOAuth2ClientId"
                      placeholder="client_id"
                    />
                  </NFormItem>
                  <NFormItem label="Client Secret">
                    <NInput
                      v-model:value="form.authOAuth2ClientSecret"
                      type="password"
                      show-password-on="click"
                      placeholder="client_secret"
                    />
                  </NFormItem>
                </div>
                <NFormItem label="Scope (Optional)">
                  <NInput
                    v-model:value="form.authOAuth2Scope"
                    placeholder="read write"
                  />
                  <template #feedback>
                    <span class="form-hint">Space-separated list of scopes</span>
                  </template>
                </NFormItem>
              </template>
            </template>

            <!-- Advanced Tab -->
            <template v-if="activeTab === 'advanced'">
              <NDivider style="margin: 0 0 16px">
                Certificate Monitoring
              </NDivider>

              <NFormItem label="Certificate Expiry Notification">
                <NInputNumber
                  v-model:value="form.sslCertExpiryNotify"
                  :min="0"
                  :max="365"
                  style="width: 100%"
                >
                  <template #suffix>
                    days before expiry
                  </template>
                </NInputNumber>
              </NFormItem>

              <NFormItem label="Ignore TLS/SSL Errors">
                <NSwitch v-model:value="form.ignoreTlsErrors" />
                <template #feedback>
                  <span class="form-hint">Enable this to skip certificate validation (not recommended for
                    production)</span>
                </template>
              </NFormItem>

              <NDivider style="margin: 16px 0">
                HTTP Options
              </NDivider>

              <NFormItem label="Max Redirects">
                <NInputNumber
                  v-model:value="form.maxRedirects"
                  :min="0"
                  :max="20"
                  style="width: 100%"
                />
              </NFormItem>

              <NFormItem label="Accepted Status Codes">
                <NSelect
                  v-model:value="form.acceptedStatusCodes"
                  :options="statusCodeOptions"
                  multiple
                  filterable
                  placeholder="Pick Accepted Status Codes..."
                />
                <template #feedback>
                  <span class="form-hint">Select ranges (200-299, 300-399) or individual codes (200, 301)</span>
                </template>
              </NFormItem>

              <NDivider style="margin: 16px 0">
                Special Options
              </NDivider>

              <NFormItem label="Upside Down Mode">
                <NSwitch v-model:value="form.upsideDown" />
                <template #feedback>
                  <span class="form-hint">Treat DOWN as UP and UP as DOWN (useful for maintenance mode detection)</span>
                </template>
              </NFormItem>

              <NDivider style="margin: 16px 0">
                Organization
              </NDivider>

              <NFormItem label="Environment">
                <NSelect
                  v-model:value="form.environment"
                  :options="environmentOptions"
                  placeholder="Select environment"
                />
                <template #feedback>
                  <span class="form-hint">Assign this monitor to an environment group for better organization</span>
                </template>
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
          type="warning"
          ghost
          :loading="isTesting"
          :disabled="!form.url?.trim()"
          class="test-btn"
          @click="handleTest"
        >
          <template #icon>
            <Icon icon="carbon:play-filled-alt" />
          </template>
          Test
        </NButton>
        <NButton
          type="primary"
          :disabled="!isEditMode && !form.name.trim()"
          @click="handleSave"
        >
          <template #icon>
            <Icon icon="carbon:save" />
          </template>
          {{ isEditMode ? "Save Changes" : "Create Monitor" }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.monitor-form-content {
  display: flex;
  gap: 16px;
  max-height: calc(75vh - 120px);
  overflow: hidden;
}

.form-tabs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 180px;
  max-width: 180px;
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

  &:hover:not(.disabled) {
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

  &.disabled {
    opacity: 0.4;
    cursor: not-allowed;
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

  :deep(.n-input) {

    .n-input__input-el,
    .n-input__placeholder {
      font-size: 14px;
    }

    .n-input__textarea-el,
    .n-input__textarea-mirror {
      line-height: 1.5;
      font-size: 14px;
    }
  }
}

.form-row {
  display: flex;
  gap: 12px;

  > :deep(.n-form-item) {
    flex: 1;
    min-width: 0;
  }
}

.form-hint {
  font-size: 11px;
  color: var(--n-text-color-3);
  margin-top: 4px;
  padding-left: 2px;
}

.empty-notifications {
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

.notification-channels-list {
  .section-hint {
    margin: 0 0 12px 0;
    font-size: 12px;
    color: var(--n-text-color-3);
  }
}

.notification-channel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--n-color);
  border: 1px solid var(--n-border-color);
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }

  .channel-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .channel-name {
    font-size: 14px;
    font-weight: 500;
  }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding-top: 15px;
  border-top: 1px solid var(--n-border-color);

  :deep(.n-button) {
    width: 160px;
    height: 36px !important;
    line-height: 34px;
    padding: 0 !important;
    box-sizing: border-box;
  }
}

.switch-align {
  height: 34px;
  display: flex;
  align-items: center;
}

// Tags input styling
.tags-input-wrapper {
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  padding: 8px 12px;
  background: var(--n-input-color);
  transition: border-color 0.2s ease;

  &:focus-within {
    border-color: var(--n-primary-color);
  }

  :root.dark & {
    background: rgba(30, 41, 59, 0.5);
  }
}

.tags-display {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.tag-item {
  position: relative;
  padding-right: 24px !important;
  cursor: default;
  background: rgba($primary-color, 0.08) !important;
  color: $primary-color !important;
  font-weight: 500;

  :deep(.n-tag__close) {
    color: $primary-color !important;
    opacity: 0.6;

    &:hover {
      opacity: 1;
    }
  }

  :root.dark & {
    background: rgba($primary-color, 0.15) !important;
    color: lighten($primary-color, 15%) !important;

    :deep(.n-tag__close) {
      color: lighten($primary-color, 15%) !important;
    }
  }
}

.tag-input-inline {
  flex: 1;
  min-width: 150px;
  border: none !important;

  :deep(.n-input__border),
  :deep(.n-input__state-border) {
    display: none !important;
  }

  :deep(.n-input-wrapper) {
    padding: 0 !important;
  }

  :deep(.n-input__input-el) {
    padding: 6px 8px !important;
    font-size: 13px !important;
  }

  :deep(.n-input__placeholder) {
    font-size: 13px !important;
    padding-left: 8px !important;
    color: $gray-400 !important;
  }
}

// Responsive
@media (max-width: 768px) {
  .monitor-form-content {
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

  .form-row {
    flex-direction: column;
    gap: 0;
  }

  .modal-footer {
    flex-direction: column-reverse;

    :deep(.n-button) {
      width: 100%;
    }
  }
}
</style>

<style lang="scss">
// Dark mode fixes (unscoped)
:root.dark {
  .monitor-form-content {
    .form-content {

      .n-input,
      .n-input-number {
        --n-color: rgba(255, 255, 255, 0.08) !important;
        --n-color-focus: rgba(255, 255, 255, 0.12) !important;
        background-color: rgba(255, 255, 255, 0.08) !important;
      }

      .n-input:focus-within,
      .n-input-number:focus-within {
        background-color: rgba(255, 255, 255, 0.12) !important;
      }
    }
  }
}
</style>