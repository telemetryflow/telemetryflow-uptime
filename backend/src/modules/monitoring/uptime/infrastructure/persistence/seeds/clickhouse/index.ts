import type { ClickHouseSeed } from "@/database/shared/interfaces";
// import { SeedUptimeChecks1719000000020 } from "./1719000000020-seed-uptime-checks";

// Disabled: Real uptime check data comes from the uptime checker daemon.
// Enable only for demo environments that need pre-populated historical bars.
export const UptimeClickHouseSeeds: (new () => ClickHouseSeed)[] = [
  // SeedUptimeChecks1719000000020,
];
