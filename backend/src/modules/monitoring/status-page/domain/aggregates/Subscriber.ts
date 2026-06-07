/**
 * Subscriber Aggregate
 * Represents a subscriber to status page notifications (email or webhook)
 */

import * as crypto from "crypto";

export enum NotificationType {
  ALL = 'all',
  INCIDENTS_ONLY = 'incidents_only',
  MAINTENANCE_ONLY = 'maintenance_only',
}

export enum SubscriptionType {
  EMAIL = 'email',
  WEBHOOK = 'webhook',
}

export interface SubscriberProps {
  id: string;
  statusPageId: string;
  email?: string;
  webhookUrl?: string;
  subscriptionType: SubscriptionType;
  isConfirmed: boolean;
  confirmationToken?: string;
  unsubscribeToken: string;
  notificationType: NotificationType;
  monitorIds?: string[]; // null = all monitors
  confirmedAt?: Date;
  lastNotifiedAt?: Date;
  organizationId: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class Subscriber {
  private props: SubscriberProps;

  private constructor(props: SubscriberProps) {
    this.props = props;
  }

  static createEmail(
    props: Omit<
      SubscriberProps,
      'createdAt' | 'updatedAt' | 'isConfirmed' | 'confirmationToken' | 'unsubscribeToken' | 'subscriptionType' | 'webhookUrl'
    >,
  ): Subscriber {
    const now = new Date();
    return new Subscriber({
      ...props,
      subscriptionType: SubscriptionType.EMAIL,
      isConfirmed: false,
      confirmationToken: Subscriber.generateToken(),
      unsubscribeToken: Subscriber.generateToken(),
      createdAt: now,
      updatedAt: now,
    });
  }

  static createWebhook(
    props: Omit<
      SubscriberProps,
      'createdAt' | 'updatedAt' | 'isConfirmed' | 'confirmationToken' | 'unsubscribeToken' | 'subscriptionType' | 'email'
    > & { webhookUrl: string },
  ): Subscriber {
    const now = new Date();
    return new Subscriber({
      ...props,
      subscriptionType: SubscriptionType.WEBHOOK,
      // Webhook subscriptions are auto-confirmed (no email verification needed)
      isConfirmed: true,
      confirmedAt: now,
      unsubscribeToken: Subscriber.generateToken(),
      createdAt: now,
      updatedAt: now,
    });
  }

  /** @deprecated Use createEmail or createWebhook instead */
  static create(
    props: Omit<
      SubscriberProps,
      'createdAt' | 'updatedAt' | 'isConfirmed' | 'confirmationToken' | 'unsubscribeToken'
    >,
  ): Subscriber {
    const now = new Date();
    return new Subscriber({
      ...props,
      subscriptionType: props.subscriptionType || SubscriptionType.EMAIL,
      isConfirmed: false,
      confirmationToken: Subscriber.generateToken(),
      unsubscribeToken: Subscriber.generateToken(),
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: SubscriberProps): Subscriber {
    return new Subscriber(props);
  }

  private static generateToken(): string {
    return `${Date.now()}-${crypto.randomBytes(16).toString("hex")}`;
  }

  // Getters
  get id(): string {
    return this.props.id;
  }

  get statusPageId(): string {
    return this.props.statusPageId;
  }

  get email(): string | undefined {
    return this.props.email;
  }

  get webhookUrl(): string | undefined {
    return this.props.webhookUrl;
  }

  get subscriptionType(): SubscriptionType {
    return this.props.subscriptionType;
  }

  get isConfirmed(): boolean {
    return this.props.isConfirmed;
  }

  get confirmationToken(): string | undefined {
    return this.props.confirmationToken;
  }

  get unsubscribeToken(): string {
    return this.props.unsubscribeToken;
  }

  get notificationType(): NotificationType {
    return this.props.notificationType;
  }

  get monitorIds(): string[] | undefined {
    return this.props.monitorIds ? [...this.props.monitorIds] : undefined;
  }

  get confirmedAt(): Date | undefined {
    return this.props.confirmedAt;
  }

  get lastNotifiedAt(): Date | undefined {
    return this.props.lastNotifiedAt;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get metadata(): Record<string, unknown> | undefined {
    return this.props.metadata;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  // Business methods
  canReceiveNotification(): boolean {
    return this.props.isConfirmed;
  }

  shouldNotifyForIncident(): boolean {
    return (
      this.props.notificationType === NotificationType.ALL ||
      this.props.notificationType === NotificationType.INCIDENTS_ONLY
    );
  }

  shouldNotifyForMaintenance(): boolean {
    return (
      this.props.notificationType === NotificationType.ALL ||
      this.props.notificationType === NotificationType.MAINTENANCE_ONLY
    );
  }

  shouldNotifyForMonitor(monitorId: string): boolean {
    if (!this.props.monitorIds) return true; // Subscribe to all
    return this.props.monitorIds.includes(monitorId);
  }

  getConfirmationUrl(baseUrl: string): string {
    return `${baseUrl}/status-page/confirm-subscription?token=${this.props.confirmationToken}`;
  }

  getUnsubscribeUrl(baseUrl: string): string {
    return `${baseUrl}/status-page/unsubscribe?token=${this.props.unsubscribeToken}`;
  }

  // Mutations
  confirm(): void {
    this.props.isConfirmed = true;
    this.props.confirmedAt = new Date();
    this.props.confirmationToken = undefined;
    this.props.updatedAt = new Date();
  }

  updateNotificationType(type: NotificationType): void {
    this.props.notificationType = type;
    this.props.updatedAt = new Date();
  }

  updateMonitorSubscriptions(monitorIds: string[] | undefined): void {
    this.props.monitorIds = monitorIds;
    this.props.updatedAt = new Date();
  }

  recordNotification(): void {
    this.props.lastNotifiedAt = new Date();
    this.props.updatedAt = new Date();
  }

  regenerateConfirmationToken(): void {
    this.props.confirmationToken = Subscriber.generateToken();
    this.props.updatedAt = new Date();
  }

  toJSON(): SubscriberProps {
    return { ...this.props };
  }
}
