/**
 * Status Page Aggregate
 * Represents a public status page for displaying service health
 */

import * as crypto from "crypto";

export enum OverallStatus {
  OPERATIONAL = 'operational',
  DEGRADED_PERFORMANCE = 'degraded_performance',
  PARTIAL_OUTAGE = 'partial_outage',
  MAJOR_OUTAGE = 'major_outage',
  MAINTENANCE = 'maintenance',
  UNKNOWN = 'unknown',
}

export interface BrandingConfig {
  logoUrl?: string;
  faviconUrl?: string;
  brandColor?: string;
  customCss?: string;
  headerText?: string;
  footerText?: string;
  supportUrl?: string;
}

export interface DisplayConfig {
  showUptimePercentage: boolean;
  showResponseTime: boolean;
  showIncidentHistory: boolean;
  showMaintenanceSchedule: boolean;
  allowSubscriptions: boolean;
  showLegend: boolean;
  uptimeRanges: ('24h' | '7d' | '30d' | '90d')[];
  historyDays: number;
  theme?: string;
  googleAnalyticsId?: string;
}

export interface CustomDomainConfig {
  domain?: string;
  verified: boolean;
  sslEnabled: boolean;
  verificationToken?: string;
}

export interface StatusPageMonitorConfig {
  monitorId: string;
  displayName?: string;
  description?: string;
  displayOrder: number;
  groupName?: string;
  isVisible: boolean;
}

export interface StatusPageProps {
  id: string;
  title: string;
  slug: string;
  description?: string;
  isPublic: boolean;
  overallStatus: OverallStatus;
  branding: BrandingConfig;
  display: DisplayConfig;
  customDomain?: CustomDomainConfig;
  monitors: StatusPageMonitorConfig[];
  lastStatusCheck?: Date;
  organizationId: string;
  workspaceId?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class StatusPage {
  private props: StatusPageProps;

  private constructor(props: StatusPageProps) {
    this.props = props;
  }

  static create(
    props: Omit<
      StatusPageProps,
      'createdAt' | 'updatedAt' | 'overallStatus' | 'monitors' | 'branding' | 'display'
    > & {
      branding?: Partial<BrandingConfig>;
      display?: Partial<DisplayConfig>;
    },
  ): StatusPage {
    const now = new Date();
    return new StatusPage({
      ...props,
      overallStatus: OverallStatus.UNKNOWN,
      monitors: [],
      branding: {
        brandColor: '#10B981',
        ...props.branding,
      },
      display: {
        showUptimePercentage: true,
        showResponseTime: true,
        showIncidentHistory: true,
        showMaintenanceSchedule: true,
        allowSubscriptions: true,
        showLegend: true,
        uptimeRanges: ['24h', '7d', '30d', '90d'],
        historyDays: 90,
        ...props.display,
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: StatusPageProps): StatusPage {
    return new StatusPage(props);
  }

  // Getters
  get id(): string {
    return this.props.id;
  }

  get title(): string {
    return this.props.title;
  }

  get slug(): string {
    return this.props.slug;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get isPublic(): boolean {
    return this.props.isPublic;
  }

  get overallStatus(): OverallStatus {
    return this.props.overallStatus;
  }

  get branding(): BrandingConfig {
    return { ...this.props.branding };
  }

  get display(): DisplayConfig {
    return { ...this.props.display };
  }

  get customDomain(): CustomDomainConfig | undefined {
    return this.props.customDomain ? { ...this.props.customDomain } : undefined;
  }

  get monitors(): StatusPageMonitorConfig[] {
    return [...this.props.monitors];
  }

  get lastStatusCheck(): Date | undefined {
    return this.props.lastStatusCheck;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get workspaceId(): string | undefined {
    return this.props.workspaceId;
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
  isOperational(): boolean {
    return this.props.overallStatus === OverallStatus.OPERATIONAL;
  }

  hasIncident(): boolean {
    return (
      this.props.overallStatus === OverallStatus.PARTIAL_OUTAGE ||
      this.props.overallStatus === OverallStatus.MAJOR_OUTAGE
    );
  }

  hasDegradedPerformance(): boolean {
    return this.props.overallStatus === OverallStatus.DEGRADED_PERFORMANCE;
  }

  isUnderMaintenance(): boolean {
    return this.props.overallStatus === OverallStatus.MAINTENANCE;
  }

  getPublicUrl(): string {
    if (this.props.customDomain?.domain && this.props.customDomain.verified) {
      return `https://${this.props.customDomain.domain}`;
    }
    return `/status/${this.props.slug}`;
  }

  hasMonitor(monitorId: string): boolean {
    return this.props.monitors.some((m) => m.monitorId === monitorId);
  }

  getVisibleMonitors(): StatusPageMonitorConfig[] {
    return this.props.monitors.filter((m) => m.isVisible).sort((a, b) => a.displayOrder - b.displayOrder);
  }

  getMonitorGroups(): string[] {
    const groups = new Set<string>();
    this.props.monitors.forEach((m) => {
      if (m.groupName) groups.add(m.groupName);
    });
    return Array.from(groups);
  }

  // Mutations
  update(updates: Partial<Pick<StatusPageProps, 'title' | 'description' | 'isPublic'>>): void {
    if (updates.title !== undefined) this.props.title = updates.title;
    if (updates.description !== undefined) this.props.description = updates.description;
    if (updates.isPublic !== undefined) this.props.isPublic = updates.isPublic;
    this.props.updatedAt = new Date();
  }

  updateSlug(slug: string): void {
    this.props.slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    this.props.updatedAt = new Date();
  }

  updateBranding(branding: Partial<BrandingConfig>): void {
    this.props.branding = { ...this.props.branding, ...branding };
    this.props.updatedAt = new Date();
  }

  updateDisplay(display: Partial<DisplayConfig>): void {
    this.props.display = { ...this.props.display, ...display };
    this.props.updatedAt = new Date();
  }

  setCustomDomain(domain: string): void {
    this.props.customDomain = {
      domain,
      verified: false,
      sslEnabled: false,
      verificationToken: this.generateVerificationToken(),
    };
    this.props.updatedAt = new Date();
  }

  verifyCustomDomain(): void {
    if (this.props.customDomain) {
      this.props.customDomain.verified = true;
      this.props.customDomain.sslEnabled = true;
      this.props.updatedAt = new Date();
    }
  }

  removeCustomDomain(): void {
    this.props.customDomain = undefined;
    this.props.updatedAt = new Date();
  }

  updateOverallStatus(status: OverallStatus): void {
    this.props.overallStatus = status;
    this.props.lastStatusCheck = new Date();
    this.props.updatedAt = new Date();
  }

  addMonitor(config: StatusPageMonitorConfig): void {
    if (!this.hasMonitor(config.monitorId)) {
      this.props.monitors.push(config);
      this.props.updatedAt = new Date();
    }
  }

  updateMonitor(monitorId: string, updates: Partial<Omit<StatusPageMonitorConfig, 'monitorId'>>): void {
    const monitor = this.props.monitors.find((m) => m.monitorId === monitorId);
    if (monitor) {
      Object.assign(monitor, updates);
      this.props.updatedAt = new Date();
    }
  }

  removeMonitor(monitorId: string): void {
    const index = this.props.monitors.findIndex((m) => m.monitorId === monitorId);
    if (index > -1) {
      this.props.monitors.splice(index, 1);
      this.props.updatedAt = new Date();
    }
  }

  replaceMonitors(monitors: StatusPageMonitorConfig[]): void {
    this.props.monitors = monitors;
    this.props.updatedAt = new Date();
  }

  reorderMonitors(monitorIds: string[]): void {
    monitorIds.forEach((id, index) => {
      const monitor = this.props.monitors.find((m) => m.monitorId === id);
      if (monitor) {
        monitor.displayOrder = index;
      }
    });
    this.props.updatedAt = new Date();
  }

  makePublic(): void {
    this.props.isPublic = true;
    this.props.updatedAt = new Date();
  }

  makePrivate(): void {
    this.props.isPublic = false;
    this.props.updatedAt = new Date();
  }

  private generateVerificationToken(): string {
    return `tf-verify-${Date.now()}-${crypto.randomBytes(16).toString("hex")}`;
  }

  toJSON(): StatusPageProps {
    return { ...this.props };
  }
}
