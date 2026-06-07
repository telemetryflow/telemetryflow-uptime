import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { AlertingModule } from "@/modules/alerting/alerting.module";

import { MonitorEntity } from "./infrastructure/persistence/entities/Monitor.entity";
import { MonitorGroupEntity } from "./infrastructure/persistence/entities/MonitorGroup.entity";
import { UptimeCheckEntity } from "./infrastructure/persistence/entities/UptimeCheck.entity";
import { MonitorController } from "./presentation/controllers/Monitor.controller";
import {
  MonitorRepository,
  MONITOR_REPOSITORY,
} from "./infrastructure/persistence/MonitorRepository";
import {
  MonitorGroupRepository,
  MONITOR_GROUP_REPOSITORY,
} from "./infrastructure/persistence/MonitorGroupRepository";
import {
  UptimeCheckRepository,
  UPTIME_CHECK_REPOSITORY,
} from "./infrastructure/persistence/UptimeCheckRepository";
import {
  UptimeCheckClickHouseRepository,
  UPTIME_CHECK_CLICKHOUSE_REPOSITORY,
} from "./infrastructure/persistence/UptimeCheckClickHouseRepository";

// Application - Command Handlers
import { CommandHandlers } from "./application/handlers";

// Infrastructure - Schedulers
import { UptimeCheckerScheduler } from "./infrastructure/schedulers/UptimeChecker.scheduler";

@Module({
  imports: [
    CqrsModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      MonitorEntity,
      MonitorGroupEntity,
      UptimeCheckEntity,
    ]),
    AlertingModule,
  ],
  controllers: [MonitorController],
  providers: [
    // PostgreSQL Repositories
    {
      provide: MONITOR_REPOSITORY,
      useClass: MonitorRepository,
    },
    {
      provide: MONITOR_GROUP_REPOSITORY,
      useClass: MonitorGroupRepository,
    },
    {
      provide: UPTIME_CHECK_REPOSITORY,
      useClass: UptimeCheckRepository,
    },
    MonitorRepository,
    MonitorGroupRepository,
    UptimeCheckRepository,
    // ClickHouse Repository (time-series analytics)
    {
      provide: UPTIME_CHECK_CLICKHOUSE_REPOSITORY,
      useClass: UptimeCheckClickHouseRepository,
    },
    UptimeCheckClickHouseRepository,
    // Command Handlers
    ...CommandHandlers,
    // Schedulers
    UptimeCheckerScheduler,
  ],
  exports: [
    MONITOR_REPOSITORY,
    MONITOR_GROUP_REPOSITORY,
    UPTIME_CHECK_REPOSITORY,
    UPTIME_CHECK_CLICKHOUSE_REPOSITORY,
    MonitorRepository,
    MonitorGroupRepository,
    UptimeCheckRepository,
    UptimeCheckClickHouseRepository,
  ],
})
export class UptimeModule {}
