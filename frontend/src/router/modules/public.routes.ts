import type { RouteRecordRaw } from "vue-router";

export const publicRoutes: RouteRecordRaw[] = [
  {
    path: "/status/:slug",
    name: "PublicStatusPage",
    component: () => import("@/views/monitoring/status-page/public.vue"),
    meta: { title: "Status Page", requiresAuth: false },
  },
];
