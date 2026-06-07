import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, ArrayContains } from 'typeorm';
import { Subscriber, NotificationType } from '../../domain/aggregates/Subscriber';
import {
  ISubscriberRepository,
  SUBSCRIBER_REPOSITORY,
} from '../../domain/repositories/IStatusPageRepository';
import { SubscriberEntity } from './entities/Subscriber.entity';
import { SubscriberMapper } from './SubscriberMapper';

@Injectable()
export class SubscriberRepository implements ISubscriberRepository {
  constructor(
    @InjectRepository(SubscriberEntity)
    private readonly repository: Repository<SubscriberEntity>,
  ) {}

  async save(subscriber: Subscriber): Promise<void> {
    const entity = SubscriberMapper.toEntity(subscriber);
    await this.repository.save(entity);
  }

  async findById(id: string): Promise<Subscriber | null> {
    const entity = await this.repository.findOne({
      where: { id },
    });

    if (!entity) return null;
    return SubscriberMapper.toDomain(entity);
  }

  async findByEmail(email: string, statusPageId: string): Promise<Subscriber | null> {
    const entity = await this.repository.findOne({
      where: { email: email.toLowerCase(), statusPageId },
    });

    if (!entity) return null;
    return SubscriberMapper.toDomain(entity);
  }

  async findByStatusPage(statusPageId: string, confirmedOnly?: boolean): Promise<Subscriber[]> {
    const where: Record<string, unknown> = { statusPageId };
    if (confirmedOnly) {
      where.isConfirmed = true;
    }

    const entities = await this.repository.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return entities.map((e) => SubscriberMapper.toDomain(e));
  }

  async findByConfirmationToken(token: string): Promise<Subscriber | null> {
    const entity = await this.repository.findOne({
      where: { confirmationToken: token },
    });

    if (!entity) return null;
    return SubscriberMapper.toDomain(entity);
  }

  async findByUnsubscribeToken(token: string): Promise<Subscriber | null> {
    const entity = await this.repository.findOne({
      where: { unsubscribeToken: token },
    });

    if (!entity) return null;
    return SubscriberMapper.toDomain(entity);
  }

  async findForNotification(
    statusPageId: string,
    notificationType: 'incident' | 'maintenance',
    monitorId?: string,
  ): Promise<Subscriber[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('subscriber')
      .where('subscriber.status_page_id = :statusPageId', { statusPageId })
      .andWhere('subscriber.is_confirmed = :confirmed', { confirmed: true });

    // Filter by notification type preference
    if (notificationType === 'incident') {
      queryBuilder.andWhere(
        '(subscriber.notification_type = :all OR subscriber.notification_type = :incidentsOnly)',
        {
          all: NotificationType.ALL,
          incidentsOnly: NotificationType.INCIDENTS_ONLY,
        },
      );
    } else {
      queryBuilder.andWhere(
        '(subscriber.notification_type = :all OR subscriber.notification_type = :maintenanceOnly)',
        {
          all: NotificationType.ALL,
          maintenanceOnly: NotificationType.MAINTENANCE_ONLY,
        },
      );
    }

    // If monitorId is provided, filter subscribers who are subscribed to that monitor
    // or who are subscribed to all monitors (null/empty monitorIds)
    if (monitorId) {
      queryBuilder.andWhere(
        '(subscriber.monitor_ids IS NULL OR :monitorId = ANY(subscriber.monitor_ids))',
        { monitorId },
      );
    }

    const entities = await queryBuilder.getMany();
    return entities.map((e) => SubscriberMapper.toDomain(e));
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete({ id });
  }

  async deleteByEmail(email: string, statusPageId: string): Promise<void> {
    await this.repository.delete({ email: email.toLowerCase(), statusPageId });
  }

  async count(statusPageId: string, confirmedOnly?: boolean): Promise<number> {
    const where: Record<string, unknown> = { statusPageId };
    if (confirmedOnly) {
      where.isConfirmed = true;
    }

    return this.repository.count({ where });
  }
}

export { SUBSCRIBER_REPOSITORY };
