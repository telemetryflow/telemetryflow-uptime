import { Subscriber, SubscriptionType } from '../../domain/aggregates/Subscriber';
import { SubscriberEntity } from './entities/Subscriber.entity';

export class SubscriberMapper {
  static toDomain(entity: SubscriberEntity): Subscriber {
    return Subscriber.reconstitute({
      id: entity.id,
      statusPageId: entity.statusPageId,
      email: entity.email,
      webhookUrl: entity.webhookUrl,
      subscriptionType: entity.subscriptionType || SubscriptionType.EMAIL,
      isConfirmed: entity.isConfirmed,
      confirmationToken: entity.confirmationToken,
      unsubscribeToken: entity.unsubscribeToken,
      notificationType: entity.notificationType,
      monitorIds: entity.monitorIds,
      confirmedAt: entity.confirmedAt,
      lastNotifiedAt: entity.lastNotifiedAt,
      organizationId: entity.organizationId,
      metadata: entity.metadata,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toEntity(subscriber: Subscriber): Partial<SubscriberEntity> {
    const props = subscriber.toJSON();

    return {
      id: props.id,
      statusPageId: props.statusPageId,
      email: props.email,
      webhookUrl: props.webhookUrl,
      subscriptionType: props.subscriptionType,
      isConfirmed: props.isConfirmed,
      confirmationToken: props.confirmationToken,
      unsubscribeToken: props.unsubscribeToken,
      notificationType: props.notificationType,
      monitorIds: props.monitorIds,
      confirmedAt: props.confirmedAt,
      lastNotifiedAt: props.lastNotifiedAt,
      organizationId: props.organizationId,
      metadata: props.metadata,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
  }

  static toResponse(subscriber: Subscriber): Record<string, any> {
    return {
      id: subscriber.id,
      status_page_id: subscriber.statusPageId,
      email: subscriber.email,
      webhook_url: subscriber.webhookUrl,
      subscription_type: subscriber.subscriptionType,
      is_confirmed: subscriber.isConfirmed,
      notification_type: subscriber.notificationType,
      monitor_ids: subscriber.monitorIds,
      confirmed_at: subscriber.confirmedAt?.toISOString() ?? null,
      last_notified_at: subscriber.lastNotifiedAt?.toISOString() ?? null,
      organization_id: subscriber.organizationId,
      created_at: subscriber.createdAt.toISOString(),
      updated_at: subscriber.updatedAt.toISOString(),
    };
  }
}
