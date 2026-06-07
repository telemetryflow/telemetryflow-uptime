import type { RouteRecordRaw } from "vue-router";

export const monitoringRoutes: RouteRecordRaw[] = [
  {
    path: "monitoring/uptime",
    name: "UptimeMonitoring",
    component: () => import("@/views/monitoring/uptime/index.vue"),
    meta: {
      title: "Uptime",
      icon: "carbon:activity",
      requiresAuth: true,
      requiredPermissions: ["monitoring:uptime:read"],
      breadcrumbs: [
        { label: "Monitoring" },
        { label: "Uptime", path: "/monitoring/uptime" },
      ],
    },
  },
  {
    path: "monitoring/uptime/list",
    name: "UptimeMonitorDetail",
    component: () => import("@/views/monitoring/uptime/components/MonitorList.vue"),
    meta: {
      title: "Uptime Details",
      icon: "carbon:activity",
      requiresAuth: true,
      breadcrumbs: [
        { label: "Monitoring" },
        { label: "Uptime", path: "/monitoring/uptime" },
        { label: "Details", path: "" },
      ],
    },
  },
  {
    path: "monitoring/status-page",
    name: "StatusPage",
    component: () => import("@/views/monitoring/status-page/index.vue"),
    meta: {
      title: "Status Pages",
      icon: "carbon:dashboard",
      requiresAuth: true,
      breadcrumbs: [
        { label: "Monitoring" },
        { label: "Status Pages", path: "/monitoring/status-page" },
      ],
    },
  },
];
