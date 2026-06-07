export * from "./QueryUptime.handler";
export * from "./QueryStatusPage.handler";

import {
  QueryUptimeMonitorsHandler,
  GetUptimeMonitorByIdHandler,
  GetUptimeMonitorStatsHandler,
  GetUptimeMonitorChecksHandler,
  GetUptimeMonitorDailyStatsHandler,
  GetUptimeMonitorHourlyStatsHandler,
  GetUptimeMonitorSSLTrendHandler,
  GetUptimeSSLSummaryHandler,
} from "./QueryUptime.handler";
import {
  QueryStatusPagesHandler,
  GetStatusPageByIdHandler,
  QueryIncidentsHandler,
  GetIncidentByIdHandler,
} from "./QueryStatusPage.handler";

export const MonitoringQueryHandlers = [
  QueryUptimeMonitorsHandler,
  GetUptimeMonitorByIdHandler,
  GetUptimeMonitorStatsHandler,
  GetUptimeMonitorChecksHandler,
  GetUptimeMonitorDailyStatsHandler,
  GetUptimeMonitorHourlyStatsHandler,
  GetUptimeMonitorSSLTrendHandler,
  GetUptimeSSLSummaryHandler,
  QueryStatusPagesHandler,
  GetStatusPageByIdHandler,
  QueryIncidentsHandler,
  GetIncidentByIdHandler,
];
