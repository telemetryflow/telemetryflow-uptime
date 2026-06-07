import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { OverallStatus } from '../../../domain/aggregates/StatusPage';

@Entity('status_pages')
@Index(['slug'], { unique: true })
@Index(['organizationId'])
@Index(['isPublic'])
@Index(['customDomain'])
export class StatusPageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ length: 100, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'is_public', default: true })
  isPublic: boolean;

  @Column({ name: 'overall_status', type: 'enum', enum: OverallStatus, default: OverallStatus.UNKNOWN })
  overallStatus: OverallStatus;

  // Branding
  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl: string;

  @Column({ name: 'favicon_url', type: 'text', nullable: true })
  faviconUrl: string;

  @Column({ name: 'brand_color', length: 20, default: '#10B981' })
  brandColor: string;

  @Column({ name: 'custom_css', type: 'text', nullable: true })
  customCss: string;

  @Column({ name: 'header_text', type: 'text', nullable: true })
  headerText: string;

  @Column({ name: 'footer_text', type: 'text', nullable: true })
  footerText: string;

  @Column({ name: 'support_url', type: 'text', nullable: true })
  supportUrl: string;

  // Display settings
  @Column({ name: 'show_uptime_percentage', default: true })
  showUptimePercentage: boolean;

  @Column({ name: 'show_response_time', default: true })
  showResponseTime: boolean;

  @Column({ name: 'show_incident_history', default: true })
  showIncidentHistory: boolean;

  @Column({ name: 'show_maintenance_schedule', default: true })
  showMaintenanceSchedule: boolean;

  @Column({ name: 'allow_subscriptions', default: true })
  allowSubscriptions: boolean;

  @Column({ name: 'show_legend', default: true })
  showLegend: boolean;

  @Column({ name: 'uptime_ranges', type: 'jsonb', default: '["24h", "7d", "30d", "90d"]' })
  uptimeRanges: string[];

  @Column({ name: 'history_days', default: 90 })
  historyDays: number;

  @Column({ name: 'theme', length: 20, default: 'light' })
  theme: string;

  @Column({ name: 'google_analytics_id', length: 50, nullable: true })
  googleAnalyticsId: string;

  // Custom domain
  @Column({ name: 'custom_domain', length: 255, nullable: true })
  customDomain: string;

  @Column({ name: 'custom_domain_verified', default: false })
  customDomainVerified: boolean;

  @Column({ name: 'custom_domain_ssl', default: false })
  customDomainSsl: boolean;

  @Column({ name: 'custom_domain_verification_token', length: 255, nullable: true })
  customDomainVerificationToken: string;

  // Monitors
  @Column({ type: 'jsonb', default: '[]' })
  monitors: Array<{
    monitorId: string;
    displayName?: string;
    description?: string;
    displayOrder: number;
    groupName?: string;
    isVisible: boolean;
  }>;

  @Column({ name: 'last_status_check', type: 'timestamptz', nullable: true })
  lastStatusCheck: Date;

  // Multi-tenancy
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'workspace_id', type: 'uuid', nullable: true })
  workspaceId: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string;

  // Metadata
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date;
}
