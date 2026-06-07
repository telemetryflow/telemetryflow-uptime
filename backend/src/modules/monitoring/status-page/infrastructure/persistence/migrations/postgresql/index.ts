import { MigrationInterface } from 'typeorm';
import { CreateStatusPageTables1720000000001 } from './1720000000001-CreateStatusPageTables';
import { AddWebhookSubscription1720000000002 } from './1720000000002-AddWebhookSubscription';
import { AddMissingDisplayColumns1720000000003 } from './1720000000003-AddMissingDisplayColumns';

export const StatusPageMigrations: (new () => MigrationInterface)[] = [
  CreateStatusPageTables1720000000001,
  AddWebhookSubscription1720000000002,
  AddMissingDisplayColumns1720000000003,
];

export { CreateStatusPageTables1720000000001 };
export { AddWebhookSubscription1720000000002 };
export { AddMissingDisplayColumns1720000000003 };
