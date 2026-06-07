<script setup lang="ts">
import { computed, ref, watch } from "vue";
import VChart from "vue-echarts";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  MarkLineComponent,
} from "echarts/components";
import type { EChartsOption } from "echarts";
import dayjs from "dayjs";
import { Icon } from "@iconify/vue";
import { useAppStore } from "@/store";
import {
  chartColors,
  chartLayout,
  createTooltipConfig,
  getTooltipColors,
  getTooltipSize,
} from "@/config/theme";
import type { UptimeCheck } from "@/types/uptime";

use([
  CanvasRenderer,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  MarkLineComponent,
]);

const props = withDefaults(
  defineProps<{
    checks: UptimeCheck[];
    height?: number;
    showPercentiles?: boolean;
  }>(),
  {
    height: 300,
    showPercentiles: false,
  },
);

const appStore = useAppStore();
const chartRef = ref<InstanceType<typeof VChart>>();

// Check if there's any data
const hasNoData = computed(() => {
  return !props.checks || props.checks.length === 0;
});

// Screen reader text alternative for chart
const chartAriaLabel = computed(() => {
  if (hasNoData.value) {
    return "Response time chart: No data available";
  }
  const checkCount = props.checks.length;
  const avgResponseTime = Math.round(
    props.checks.reduce((sum, c) => sum + c.responseTime, 0) / checkCount,
  );
  return `Response time chart showing ${checkCount} checks with average response time of ${avgResponseTime} milliseconds`;
});

const screenReaderText = computed(() => {
  if (hasNoData.value) {
    return "No check data available for the response time chart.";
  }

  const checkCount = props.checks.length;
  const responseTimes = props.checks.map((c) => c.responseTime);
  const avgResponseTime = Math.round(
    responseTimes.reduce((sum, rt) => sum + rt, 0) / checkCount,
  );
  const minResponseTime = Math.min(...responseTimes);
  const maxResponseTime = Math.max(...responseTimes);

  let text = `Response time chart displaying ${checkCount} checks. `;
  text += `Average response time: ${avgResponseTime} milliseconds. `;
  text += `Minimum: ${minResponseTime} milliseconds. `;
  text += `Maximum: ${maxResponseTime} milliseconds.`;

  if (props.showPercentiles && percentiles.value) {
    text += ` Percentiles: P50 is ${percentiles.value.p50} milliseconds, `;
    text += `P90 is ${percentiles.value.p90} milliseconds, `;
    text += `P99 is ${percentiles.value.p99} milliseconds.`;
  }

  return text;
});

// Prepare chart data - sort by time and map to [timestamp, responseTime] format
const chartData = computed(() => {
  if (hasNoData.value) return [];

  // Sort checks by time (oldest first)
  const sortedChecks = [...props.checks].sort(
    (a, b) => a.checkedAt - b.checkedAt,
  );

  return sortedChecks.map((check) => ({
    value: [check.checkedAt, check.responseTime],
    status: check.status,
    itemStyle: {
      color: getStatusColor(check.status),
    },
  }));
});

// Calculate percentiles if enabled
const percentiles = computed(() => {
  if (!props.showPercentiles || hasNoData.value) return null;

  // Only use successful checks for percentile calculation
  const successfulChecks = props.checks.filter((c) => c.status === "success");
  if (successfulChecks.length === 0) return null;

  const responseTimes = successfulChecks
    .map((c) => c.responseTime)
    .sort((a, b) => a - b);

  const getPercentile = (arr: number[], p: number) => {
    const index = Math.ceil(arr.length * p) - 1;
    return arr[Math.max(0, index)];
  };

  return {
    p50: getPercentile(responseTimes, 0.5),
    p75: getPercentile(responseTimes, 0.75),
    p90: getPercentile(responseTimes, 0.9),
    p95: getPercentile(responseTimes, 0.95),
    p99: getPercentile(responseTimes, 0.99),
  };
});

// Get color based on check status
function getStatusColor(status: string): string {
  switch (status) {
    case "success":
      return "#22c55e"; // green
    case "failure":
      return "#ef4444"; // red
    case "timeout":
      return "#f59e0b"; // yellow/orange
    case "error":
      return "#ef4444"; // red
    default:
      return "#9ca3af"; // gray
  }
}

// Build percentile mark lines
const percentileMarkLines = computed(() => {
  if (!percentiles.value) return [];

  return [
    {
      name: "P50",
      yAxis: percentiles.value.p50,
      lineStyle: {
        color: appStore.isDarkMode ? "#60a5fa" : "#3b82f6",
        type: "dashed" as const,
        width: 1,
      },
      label: {
        formatter: "P50: {c}ms",
        position: "end" as const,
        color: appStore.isDarkMode ? "#60a5fa" : "#3b82f6",
      },
    },
    {
      name: "P90",
      yAxis: percentiles.value.p90,
      lineStyle: {
        color: appStore.isDarkMode ? "#fbbf24" : "#f59e0b",
        type: "dashed" as const,
        width: 1,
      },
      label: {
        formatter: "P90: {c}ms",
        position: "end" as const,
        color: appStore.isDarkMode ? "#fbbf24" : "#f59e0b",
      },
    },
    {
      name: "P99",
      yAxis: percentiles.value.p99,
      lineStyle: {
        color: appStore.isDarkMode ? "#f87171" : "#ef4444",
        type: "dashed" as const,
        width: 1,
      },
      label: {
        formatter: "P99: {c}ms",
        position: "end" as const,
        color: appStore.isDarkMode ? "#f87171" : "#ef4444",
      },
    },
  ];
});

const option = computed<EChartsOption>(() => ({
  backgroundColor: "transparent",
  tooltip: {
    trigger: "axis",
    ...createTooltipConfig(appStore.isDarkMode, "small"),
    axisPointer: {
      type: "line",
      lineStyle: {
        color: appStore.isDarkMode ? "#475569" : "#cbd5e1",
        width: 1,
        type: "solid",
      },
    },
    formatter: (params: any) => {
      if (!Array.isArray(params) || params.length === 0) return "";

      const param = params[0];
      const zone = appStore.chartTimezone;
      const time = zone === 'UTC' ? dayjs.utc(param.value[0]).format("YYYY-MM-DD HH:mm:ss") : dayjs(param.value[0]).tz(zone).format("YYYY-MM-DD HH:mm:ss");
      const responseTime = param.value[1];

      // Find the check to get status
      const check = props.checks.find((c) => c.checkedAt === param.value[0]);
      const status = check?.status || "unknown";
      const statusColor = getStatusColor(status);

      const { labelColor, valueColor, borderColor } = getTooltipColors(
        appStore.isDarkMode,
      );
      const sizeConfig = getTooltipSize("small");

      let html = `<table style="border-collapse: collapse; min-width: ${sizeConfig.minWidth}px;">`;

      // Time header
      html += `<tr style="border-bottom: 1px solid ${borderColor};">
        <td colspan="2" style="padding: ${sizeConfig.cellPadding}px 0; color: ${labelColor}; font-size: ${sizeConfig.labelFontSize}px; font-weight: 600;">Time:</td>
        <td style="padding: ${sizeConfig.cellPadding}px 0 ${sizeConfig.cellPadding}px 5px; color: ${valueColor}; font-size: ${sizeConfig.valueFontSize}px; font-weight: ${sizeConfig.valueFontWeight || 500}; text-align: right;">${time}</td>
      </tr>`;

      // Response time
      html += `<tr style="border-bottom: 1px solid ${borderColor};">
        <td style="padding: ${sizeConfig.cellPadding}px 0; width: 12px;">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: ${statusColor};"></span>
        </td>
        <td style="padding: ${sizeConfig.cellPadding}px 5px; color: ${labelColor}; font-size: ${sizeConfig.labelFontSize}px;">Response Time:</td>
        <td style="padding: ${sizeConfig.cellPadding}px 0 ${sizeConfig.cellPadding}px 5px; color: ${valueColor}; font-size: ${sizeConfig.valueFontSize}px; font-weight: ${sizeConfig.valueFontWeight || 500}; text-align: right;">${responseTime}ms</td>
      </tr>`;

      // Status
      html += `<tr>
        <td colspan="2" style="padding: ${sizeConfig.cellPadding}px 0; color: ${labelColor}; font-size: ${sizeConfig.labelFontSize}px;">Status:</td>
        <td style="padding: ${sizeConfig.cellPadding}px 0 ${sizeConfig.cellPadding}px 5px; color: ${valueColor}; font-size: ${sizeConfig.valueFontSize}px; font-weight: ${sizeConfig.valueFontWeight || 500}; text-align: right; text-transform: capitalize;">${status}</td>
      </tr>`;

      html += `</table>`;
      return html;
    },
  },
  grid: {
    left: chartLayout.grid.timeSeries.left,
    right: chartLayout.grid.timeSeries.right,
    top: 20,
    bottom: 50,
  },
  xAxis: {
    type: "time",
    axisLine: {
      lineStyle: {
        color: appStore.isDarkMode ? "#334155" : "#e5e7eb",
      },
    },
    axisTick: {
      lineStyle: {
        color: appStore.isDarkMode ? "#475569" : "#d1d5db",
      },
    },
    axisLabel: {
      color: appStore.isDarkMode ? "#9ca3af" : "#6b7280",
      fontSize: 11,
      margin: 8,
      formatter: (value: number) => {
        const zone = appStore.chartTimezone;
        return zone === 'UTC' ? dayjs.utc(value).format("HH:mm") : dayjs.utc(value).tz(zone).format("HH:mm");
      },
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: appStore.isDarkMode ? "#334155" : "#e5e7eb",
      },
    },
  },
  yAxis: {
    type: "value",
    name: "Response Time (ms)",
    nameTextStyle: {
      color: appStore.isDarkMode ? "#9ca3af" : "#6b7280",
      fontSize: 11,
    },
    axisLine: {
      show: false,
    },
    axisLabel: {
      color: appStore.isDarkMode ? "#9ca3af" : "#6b7280",
      fontSize: 11,
      margin: 8,
      formatter: (value: number) => {
        if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
        return `${value}ms`;
      },
    },
    splitLine: {
      lineStyle: {
        color: appStore.isDarkMode ? "#334155" : "#e5e7eb",
      },
    },
  },
  series: [
    {
      name: "Response Time",
      type: "line",
      data: chartData.value,
      smooth: true,
      showSymbol: true,
      symbolSize: 6,
      lineStyle: {
        width: 2,
      },
      areaStyle: {
        opacity: 0.2,
      },
      markLine: props.showPercentiles
        ? {
            silent: true,
            symbol: "none",
            data: percentileMarkLines.value,
          }
        : undefined,
    },
  ],
}));

watch(
  () => appStore.isDarkMode,
  () => {
    chartRef.value?.resize();
  },
);

defineExpose({
  resize: () => chartRef.value?.resize(),
  getChartInstance: () => chartRef.value?.chart,
});
</script>

<template>
  <div
    class="response-time-chart-wrapper"
    role="img"
    :aria-label="chartAriaLabel"
  >
    <v-chart
      ref="chartRef"
      :key="`${appStore.isDarkMode ? 'dark' : 'light'}-${appStore.chartTimezone}`"
      :option="option"
      :style="{ height: `${height}px` }"
      autoresize
      aria-hidden="true"
    />
    <!-- No data overlay -->
    <div
      v-if="hasNoData"
      class="no-data-overlay"
    >
      <Icon
        icon="carbon:chart-line"
        :width="32"
        :height="32"
        class="no-data-icon"
        aria-hidden="true"
      />
      <span class="no-data-text">No check data available</span>
    </div>
    <!-- Screen reader text alternative -->
    <div
      class="sr-only"
      role="status"
      aria-live="polite"
    >
      {{ screenReaderText }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.response-time-chart-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.no-data-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--n-text-color-3, #9ca3af);
  pointer-events: none;
  z-index: 10;
}

.no-data-icon {
  opacity: 0.5;
}

.no-data-text {
  font-size: 0.875rem;
  font-weight: 500;
  opacity: 0.7;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
