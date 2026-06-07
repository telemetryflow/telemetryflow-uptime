import { Monitor, MonitorStatus, MonitorType } from '../aggregates/Monitor';
import { MonitorGroup } from '../aggregates/MonitorGroup';
import { UptimeCheck, CheckStatus } from '../aggregates/UptimeCheck';

/**
 * Monitor Repository Interface
 */
export interface IMonitorRepository {
  save(monitor: Monitor): Promise<void>;
  findById(id: string): Promise<Monitor | null>;
  findByOrganization(organizationId: string): Promise<Monitor[]>;
  findByWorkspace(workspaceId: string): Promise<Monitor[]>;
  findByGroup(groupId: string): Promise<Monitor[]>;
  findByStatus(status: MonitorStatus, organizationId?: string): Promise<Monitor[]>;
  findByType(type: MonitorType, organizationId?: string): Promise<Monitor[]>;
  findActive(organizationId?: string): Promise<Monitor[]>;
  findDueForCheck(): Promise<Monitor[]>;
  delete(id: string): Promise<void>;
  count(organizationId?: string): Promise<number>;
}

export const MONITOR_REPOSITORY = Symbol('MONITOR_REPOSITORY');

/**
 * Monitor Group Repository Interface
 */
export interface IMonitorGroupRepository {
  save(group: MonitorGroup): Promise<void>;
  findById(id: string): Promise<MonitorGroup | null>;
  findByOrganization(organizationId: string): Promise<MonitorGroup[]>;
  findByWorkspace(workspaceId: string): Promise<MonitorGroup[]>;
  delete(id: string): Promise<void>;
}

export const MONITOR_GROUP_REPOSITORY = Symbol('MONITOR_GROUP_REPOSITORY');

/**
 * Uptime Check Repository Interface
 */
export interface IUptimeCheckRepository {
  save(check: UptimeCheck): Promise<void>;
  saveBatch(checks: UptimeCheck[]): Promise<void>;
  findById(id: string): Promise<UptimeCheck | null>;
  findByMonitor(
    monitorId: string,
    options?: { from?: Date; to?: Date; limit?: number; status?: CheckStatus },
  ): Promise<UptimeCheck[]>;
  findLatestByMonitor(monitorId: string): Promise<UptimeCheck | null>;
  getUptimePercentage(monitorId: string, from: Date, to: Date): Promise<number>;
  getAverageResponseTime(monitorId: string, from: Date, to: Date): Promise<number>;
  getCheckCount(monitorId: string, from: Date, to: Date, status?: CheckStatus): Promise<number>;
  deleteOlderThan(date: Date): Promise<number>;
}

export const UPTIME_CHECK_REPOSITORY = Symbol('UPTIME_CHECK_REPOSITORY');
