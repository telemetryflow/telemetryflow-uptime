import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StatusPageEntity } from './infrastructure/persistence/entities/StatusPage.entity';
import { IncidentEntity } from './infrastructure/persistence/entities/Incident.entity';
import { SubscriberEntity } from './infrastructure/persistence/entities/Subscriber.entity';
import {
  StatusPageController,
  PublicStatusPageController,
} from './presentation/controllers/StatusPage.controller';
import {
  StatusPageRepository,
  STATUS_PAGE_REPOSITORY,
} from './infrastructure/persistence/StatusPageRepository';
import {
  IncidentRepository,
  INCIDENT_REPOSITORY,
} from './infrastructure/persistence/IncidentRepository';
import {
  SubscriberRepository,
  SUBSCRIBER_REPOSITORY,
} from './infrastructure/persistence/SubscriberRepository';
import { StatusPageCommandHandlers } from './application/handlers';

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([StatusPageEntity, IncidentEntity, SubscriberEntity])],
  controllers: [StatusPageController, PublicStatusPageController],
  providers: [
    // Command Handlers
    ...StatusPageCommandHandlers,
    // Repositories
    {
      provide: STATUS_PAGE_REPOSITORY,
      useClass: StatusPageRepository,
    },
    {
      provide: INCIDENT_REPOSITORY,
      useClass: IncidentRepository,
    },
    {
      provide: SUBSCRIBER_REPOSITORY,
      useClass: SubscriberRepository,
    },
    StatusPageRepository,
    IncidentRepository,
    SubscriberRepository,
  ],
  exports: [
    STATUS_PAGE_REPOSITORY,
    INCIDENT_REPOSITORY,
    SUBSCRIBER_REPOSITORY,
    StatusPageRepository,
    IncidentRepository,
    SubscriberRepository,
  ],
})
export class StatusPageModule {}
