/**
 * Incident Aggregate
 * Represents an incident on the status page
 */

export enum IncidentImpact {
  NONE = 'none',
  MINOR = 'minor',
  MAJOR = 'major',
  CRITICAL = 'critical',
}

export enum IncidentStatus {
  INVESTIGATING = 'investigating',
  IDENTIFIED = 'identified',
  MONITORING = 'monitoring',
  RESOLVED = 'resolved',
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export interface IncidentUpdate {
  id: string;
  status: IncidentStatus;
  message: string;
  createdBy?: string;
  createdAt: Date;
}

export interface IncidentProps {
  id: string;
  statusPageId: string;
  title: string;
  impact: IncidentImpact;
  status: IncidentStatus;
  message?: string;
  affectedMonitorIds: string[];
  updates: IncidentUpdate[];
  isScheduledMaintenance: boolean;
  scheduledStartAt?: Date;
  scheduledEndAt?: Date;
  startedAt: Date;
  resolvedAt?: Date;
  organizationId: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class Incident {
  private props: IncidentProps;

  private constructor(props: IncidentProps) {
    this.props = props;
  }

  static create(
    props: Omit<IncidentProps, 'createdAt' | 'updatedAt' | 'updates' | 'startedAt'> & {
      startedAt?: Date;
    },
  ): Incident {
    const now = new Date();
    return new Incident({
      ...props,
      updates: [],
      startedAt: props.startedAt || now,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: IncidentProps): Incident {
    return new Incident(props);
  }

  // Getters
  get id(): string {
    return this.props.id;
  }

  get statusPageId(): string {
    return this.props.statusPageId;
  }

  get title(): string {
    return this.props.title;
  }

  get impact(): IncidentImpact {
    return this.props.impact;
  }

  get status(): IncidentStatus {
    return this.props.status;
  }

  get message(): string | undefined {
    return this.props.message;
  }

  get affectedMonitorIds(): string[] {
    return [...this.props.affectedMonitorIds];
  }

  get updates(): IncidentUpdate[] {
    return [...this.props.updates];
  }

  get isScheduledMaintenance(): boolean {
    return this.props.isScheduledMaintenance;
  }

  get scheduledStartAt(): Date | undefined {
    return this.props.scheduledStartAt;
  }

  get scheduledEndAt(): Date | undefined {
    return this.props.scheduledEndAt;
  }

  get startedAt(): Date {
    return this.props.startedAt;
  }

  get resolvedAt(): Date | undefined {
    return this.props.resolvedAt;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get createdBy(): string | undefined {
    return this.props.createdBy;
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
  isActive(): boolean {
    return (
      this.props.status !== IncidentStatus.RESOLVED && this.props.status !== IncidentStatus.COMPLETED
    );
  }

  isResolved(): boolean {
    return (
      this.props.status === IncidentStatus.RESOLVED || this.props.status === IncidentStatus.COMPLETED
    );
  }

  isMaintenance(): boolean {
    return this.props.isScheduledMaintenance;
  }

  getDuration(): number {
    const end = this.props.resolvedAt || new Date();
    return end.getTime() - this.props.startedAt.getTime();
  }

  getDurationMinutes(): number {
    return Math.round(this.getDuration() / 60000);
  }

  getLatestUpdate(): IncidentUpdate | undefined {
    return this.props.updates[this.props.updates.length - 1];
  }

  affectsMonitor(monitorId: string): boolean {
    return this.props.affectedMonitorIds.includes(monitorId);
  }

  // Mutations
  update(updates: Partial<Pick<IncidentProps, 'title' | 'impact' | 'message'>>): void {
    if (updates.title !== undefined) this.props.title = updates.title;
    if (updates.impact !== undefined) this.props.impact = updates.impact;
    if (updates.message !== undefined) this.props.message = updates.message;
    this.props.updatedAt = new Date();
  }

  updateStatus(status: IncidentStatus, message: string, createdBy?: string): void {
    this.props.status = status;
    this.props.updates.push({
      id: `${this.props.id}-${this.props.updates.length + 1}`,
      status,
      message,
      createdBy,
      createdAt: new Date(),
    });

    if (status === IncidentStatus.RESOLVED || status === IncidentStatus.COMPLETED) {
      this.props.resolvedAt = new Date();
    }

    this.props.updatedAt = new Date();
  }

  addAffectedMonitor(monitorId: string): void {
    if (!this.props.affectedMonitorIds.includes(monitorId)) {
      this.props.affectedMonitorIds.push(monitorId);
      this.props.updatedAt = new Date();
    }
  }

  removeAffectedMonitor(monitorId: string): void {
    const index = this.props.affectedMonitorIds.indexOf(monitorId);
    if (index > -1) {
      this.props.affectedMonitorIds.splice(index, 1);
      this.props.updatedAt = new Date();
    }
  }

  setSchedule(startAt: Date, endAt: Date): void {
    this.props.scheduledStartAt = startAt;
    this.props.scheduledEndAt = endAt;
    this.props.isScheduledMaintenance = true;
    this.props.status = IncidentStatus.SCHEDULED;
    this.props.updatedAt = new Date();
  }

  startMaintenance(): void {
    if (this.props.isScheduledMaintenance) {
      this.props.status = IncidentStatus.IN_PROGRESS;
      this.props.startedAt = new Date();
      this.props.updatedAt = new Date();
    }
  }

  resolve(message?: string, createdBy?: string): void {
    const finalStatus = this.props.isScheduledMaintenance
      ? IncidentStatus.COMPLETED
      : IncidentStatus.RESOLVED;

    this.updateStatus(finalStatus, message || 'Issue has been resolved.', createdBy);
  }

  toJSON(): IncidentProps {
    return { ...this.props };
  }
}
