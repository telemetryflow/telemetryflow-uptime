import { MigrationInterface } from 'typeorm';
import { CreateUptimeTables1719000000001 } from './1719000000001-CreateUptimeTables';
import { CreateUptimeChecksTable1719000000002 } from './1719000000002-CreateUptimeChecksTable';
import { AddLastSslInfoToMonitors1719000000003 } from './1719000000003-AddLastSslInfoToMonitors';

export const UptimeMigrations: (new () => MigrationInterface)[] = [
  CreateUptimeTables1719000000001,
  CreateUptimeChecksTable1719000000002,
  AddLastSslInfoToMonitors1719000000003,
];

export {
  CreateUptimeTables1719000000001,
  CreateUptimeChecksTable1719000000002,
  AddLastSslInfoToMonitors1719000000003,
};
