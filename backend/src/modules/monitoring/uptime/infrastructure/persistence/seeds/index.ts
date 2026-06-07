export * from "./UptimeMonitorsSeed";
export * from "./clickhouse";

import { UptimeMonitorsSeed } from "./UptimeMonitorsSeed";

export const UptimeSeeds = [UptimeMonitorsSeed];

export const UptimeSeedConfig = {
  moduleName: "monitoring-uptime",
  database: "postgres" as const,
  seeds: UptimeSeeds,
};
