import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { NotificationType, SubscriptionType } from '../../../domain/aggregates/Subscriber';

@Entity('status_page_subscribers')
@Index(['statusPageId'])
@Index(['confirmationToken'])
@Index(['unsubscribeToken'])
@Index(['isConfirmed'])
@Index(['subscriptionType'])
export class SubscriberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'status_page_id', type: 'uuid' })
  statusPageId: string;

  @Column({ length: 255, nullable: true })
  email: string;

  @Column({ name: 'webhook_url', length: 2048, nullable: true })
  webhookUrl: string;

  @Column({ name: 'subscription_type', type: 'enum', enum: SubscriptionType, default: SubscriptionType.EMAIL })
  subscriptionType: SubscriptionType;

  @Column({ name: 'is_confirmed', default: false })
  isConfirmed: boolean;

  @Column({ name: 'confirmation_token', length: 255, nullable: true })
  confirmationToken: string;

  @Column({ name: 'unsubscribe_token', length: 255 })
  unsubscribeToken: string;

  @Column({ name: 'notification_type', type: 'enum', enum: NotificationType, default: NotificationType.ALL })
  notificationType: NotificationType;

  @Column({ name: 'monitor_ids', type: 'jsonb', nullable: true })
  monitorIds: string[];

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date;

  @Column({ name: 'last_notified_at', type: 'timestamptz', nullable: true })
  lastNotifiedAt: Date;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
