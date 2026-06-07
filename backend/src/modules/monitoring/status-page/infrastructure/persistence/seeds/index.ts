/**
 * Status Page Module Seeds — Index
 *
 * Aggregates all status page seed classes in execution order.
 * Each organization has its own seed file:
 *
 *   01-DevOpsCornerStatusPageSeed.ts  → DEVOPSCORNER: "TelemetryFlow Status" (slug: telemetryflow)
 *                                         Includes incidents and subscribers.
 *   02-TelemetryFlowStatusPageSeed.ts  → TELEMETRYFLOW: "TelemetryFlow Platform Status" (slug: telemetryflow-platform)
 *                                         Includes subscribers only.
 */

import { DataSource } from "typeorm";
export { DevOpsCornerStatusPageSeed } from "./01-DevOpsCorterStatusPageSeed";
export { TelemetryFlowStatusPageSeed } from "./02-TelemetryFlowStatusPageSeed";

import { DevOpsCornerStatusPageSeed } from "./01-DevOpsCorterStatusPageSeed";
import { TelemetryFlowStatusPageSeed } from "./02-TelemetryFlowStatusPageSeed";

export const StatusPageSeeds = [
  DevOpsCornerStatusPageSeed,
  TelemetryFlowStatusPageSeed,
];

export const StatusPageSeedConfig = {
  moduleName: "monitoring-status-page",
  database: "postgres" as const,
  seeds: StatusPageSeeds,
};

export async function runStatusPageSeeds(dataSource: DataSource): Promise<void> {
  console.log("\n========================================");
  console.log("📊 Running Status Page Seeds");
  console.log("========================================\n");

  for (const SeedClass of StatusPageSeeds) {
    const seed = new SeedClass();
    await seed.run(dataSource);
  }

  console.log("\n========================================");
  console.log("✅ Status Page Seeds Complete");
  console.log("========================================\n");
}
