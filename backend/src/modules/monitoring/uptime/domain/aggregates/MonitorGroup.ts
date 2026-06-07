/**
 * Monitor Group Aggregate
 * Groups monitors together for organization and status page display
 */

export interface MonitorGroupProps {
  id: string;
  name: string;
  description?: string;
  displayOrder: number;
  isExpanded: boolean;
  monitorIds: string[];
  organizationId: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class MonitorGroup {
  private props: MonitorGroupProps;

  private constructor(props: MonitorGroupProps) {
    this.props = props;
  }

  static create(
    props: Omit<MonitorGroupProps, 'createdAt' | 'updatedAt' | 'monitorIds' | 'displayOrder' | 'isExpanded'>,
  ): MonitorGroup {
    const now = new Date();
    return new MonitorGroup({
      ...props,
      monitorIds: [],
      displayOrder: 0,
      isExpanded: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: MonitorGroupProps): MonitorGroup {
    return new MonitorGroup(props);
  }

  // Getters
  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get displayOrder(): number {
    return this.props.displayOrder;
  }

  get isExpanded(): boolean {
    return this.props.isExpanded;
  }

  get monitorIds(): string[] {
    return [...this.props.monitorIds];
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get workspaceId(): string | undefined {
    return this.props.workspaceId;
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
  hasMonitor(monitorId: string): boolean {
    return this.props.monitorIds.includes(monitorId);
  }

  getMonitorCount(): number {
    return this.props.monitorIds.length;
  }

  // Mutations
  update(updates: Partial<Pick<MonitorGroupProps, 'name' | 'description'>>): void {
    if (updates.name !== undefined) this.props.name = updates.name;
    if (updates.description !== undefined) this.props.description = updates.description;
    this.props.updatedAt = new Date();
  }

  setDisplayOrder(order: number): void {
    this.props.displayOrder = order;
    this.props.updatedAt = new Date();
  }

  setExpanded(expanded: boolean): void {
    this.props.isExpanded = expanded;
    this.props.updatedAt = new Date();
  }

  addMonitor(monitorId: string): void {
    if (!this.props.monitorIds.includes(monitorId)) {
      this.props.monitorIds.push(monitorId);
      this.props.updatedAt = new Date();
    }
  }

  removeMonitor(monitorId: string): void {
    const index = this.props.monitorIds.indexOf(monitorId);
    if (index > -1) {
      this.props.monitorIds.splice(index, 1);
      this.props.updatedAt = new Date();
    }
  }

  reorderMonitors(monitorIds: string[]): void {
    this.props.monitorIds = monitorIds.filter((id) => this.props.monitorIds.includes(id));
    this.props.updatedAt = new Date();
  }

  toJSON(): MonitorGroupProps {
    return { ...this.props };
  }
}
