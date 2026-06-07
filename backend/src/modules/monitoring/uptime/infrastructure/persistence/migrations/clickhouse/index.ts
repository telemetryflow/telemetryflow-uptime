/**
 * Uptime Monitoring ClickHouse Migrations Index
 */

import { CreateUptimeChecksTable1719000000010 } from "./1719000000010-CreateUptimeChecksTable";
import { CreateUptimeChecksViews1719000000011 } from "./1719000000011-CreateUptimeChecksViews";
import { AddUptimeChecksIntervalViews1719000000012 } from "./1719000000012-AddUptimeChecksIntervalViews";
import { AddPercentileColumns1719000000013 } from "./1719000000013-AddPercentileColumns";
import { AddSslDaysToViews1719000000014 } from "./1719000000014-AddSslDaysToViews";

export {
  CreateUptimeChecksTable1719000000010,
  CreateUptimeChecksViews1719000000011,
  AddUptimeChecksIntervalViews1719000000012,
  AddPercentileColumns1719000000013,
  AddSslDaysToViews1719000000014,
};

/** Named array export for migration runner discovery */
export const UptimeClickHouseMigrations = [
  CreateUptimeChecksTable1719000000010,
  CreateUptimeChecksViews1719000000011,
  AddUptimeChecksIntervalViews1719000000012,
  AddPercentileColumns1719000000013,
  AddSslDaysToViews1719000000014,
];
