import { StatusPage, OverallStatus } from '../aggregates/StatusPage';
import { Incident, IncidentStatus, IncidentImpact } from '../aggregates/Incident';
import { Subscriber, NotificationType } from '../aggregates/Subscriber';

/**
 * Status Page Repository Interface
 */
export interface IStatusPageRepository {
  save(statusPage: StatusPage): Promise<void>;
  findById(id: string): Promise<StatusPage | null>;
  findBySlug(slug: string): Promise<StatusPage | null>;
  findByOrganization(organizationId: string): Promise<StatusPage[]>;
  findByWorkspace(workspaceId: string): Promise<StatusPage[]>;
  findPublic(): Promise<StatusPage[]>;
  findByCustomDomain(domain: string): Promise<StatusPage | null>;
  delete(id: string): Promise<void>;
  slugExists(slug: string, excludeId?: string): Promise<boolean>;
}

export const STATUS_PAGE_REPOSITORY = Symbol('STATUS_PAGE_REPOSITORY');

/**
 * Incident Repository Interface
 */
export interface IIncidentRepository {
  save(incident: Incident): Promise<void>;
  findById(id: string): Promise<Incident | null>;
  findByStatusPage(
    statusPageId: string,
    options?: { status?: IncidentStatus; impact?: IncidentImpact; limit?: number },
  ): Promise<Incident[]>;
  findActive(statusPageId?: string): Promise<Incident[]>;
  findScheduled(statusPageId?: string): Promise<Incident[]>;
  findByMonitor(monitorId: string): Promise<Incident[]>;
  findRecent(statusPageId: string, days: number): Promise<Incident[]>;
  delete(id: string): Promise<void>;
}

export const INCIDENT_REPOSITORY = Symbol('INCIDENT_REPOSITORY');

/**
 * Subscriber Repository Interface
 */
export interface ISubscriberRepository {
  save(subscriber: Subscriber): Promise<void>;
  findById(id: string): Promise<Subscriber | null>;
  findByEmail(email: string, statusPageId: string): Promise<Subscriber | null>;
  findByStatusPage(statusPageId: string, confirmedOnly?: boolean): Promise<Subscriber[]>;
  findByConfirmationToken(token: string): Promise<Subscriber | null>;
  findByUnsubscribeToken(token: string): Promise<Subscriber | null>;
  findForNotification(
    statusPageId: string,
    notificationType: 'incident' | 'maintenance',
    monitorId?: string,
  ): Promise<Subscriber[]>;
  delete(id: string): Promise<void>;
  deleteByEmail(email: string, statusPageId: string): Promise<void>;
  count(statusPageId: string, confirmedOnly?: boolean): Promise<number>;
}

export const SUBSCRIBER_REPOSITORY = Symbol('SUBSCRIBER_REPOSITORY');
