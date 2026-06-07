import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import {
  MonitorType,
  MonitorStatus,
  HttpMethod,
  AuthMethod,
} from "../../../domain/aggregates/Monitor";

@Entity("uptime_monitors")
@Index(["organizationId"])
@Index(["organizationId", "status"])
@Index(["groupId"])
@Index(["isActive"])
@Index(["nextCheckAt"])
export class MonitorEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "text" })
  url: string;

  @Column({ type: "enum", enum: MonitorType, default: MonitorType.HTTP })
  type: MonitorType;

  @Column({ type: "enum", enum: MonitorStatus, default: MonitorStatus.PENDING })
  status: MonitorStatus;

  @Column({ default: 60 })
  interval: number;

  @Column({ default: 30 })
  timeout: number;

  @Column({ default: 3 })
  retries: number;

  @Column({ name: "retry_interval", default: 10 })
  retryInterval: number;

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  @Column({ name: "is_paused", default: false })
  isPaused: boolean;

  // HTTP Config
  @Column({
    name: "http_method",
    type: "enum",
    enum: HttpMethod,
    nullable: true,
  })
  httpMethod: HttpMethod;

  @Column({ name: "http_headers", type: "jsonb", nullable: true })
  httpHeaders: Record<string, string>;

  @Column({ name: "http_body", type: "text", nullable: true })
  httpBody: string;

  @Column({ name: "http_body_encoding", length: 50, nullable: true })
  httpBodyEncoding: string;

  @Column({ name: "follow_redirects", default: true })
  followRedirects: boolean;

  @Column({ name: "max_redirects", default: 5 })
  maxRedirects: number;

  @Column({ name: "accepted_status_codes", type: "jsonb", nullable: true })
  acceptedStatusCodes: number[];

  @Column({ name: "ignore_tls_errors", default: false })
  ignoreTlsErrors: boolean;

  // Keyword Config
  @Column({ length: 500, nullable: true })
  keyword: string;

  @Column({ name: "keyword_invert", default: false })
  keywordInvert: boolean;

  // JSON Query Config
  @Column({ name: "json_path", length: 500, nullable: true })
  jsonPath: string;

  @Column({ name: "json_expected_value", type: "text", nullable: true })
  jsonExpectedValue: string;

  @Column({ name: "json_operator", length: 20, nullable: true })
  jsonOperator: string;

  // Auth Config
  @Column({
    name: "auth_method",
    type: "enum",
    enum: AuthMethod,
    nullable: true,
  })
  authMethod: AuthMethod;

  @Column({ name: "auth_username", length: 255, nullable: true })
  authUsername: string;

  @Column({ name: "auth_password", length: 255, nullable: true })
  authPassword: string;

  @Column({ name: "auth_token", type: "text", nullable: true })
  authToken: string;

  @Column({ name: "api_key_header", length: 100, nullable: true })
  apiKeyHeader: string;

  @Column({ name: "api_key_value", type: "text", nullable: true })
  apiKeyValue: string;

  // Database Config
  @Column({ name: "db_connection_string", type: "text", nullable: true })
  dbConnectionString: string;

  @Column({ name: "db_query", type: "text", nullable: true })
  dbQuery: string;

  @Column({ name: "db_expected_result", type: "text", nullable: true })
  dbExpectedResult: string;

  // DNS Config
  @Column({ name: "dns_resolve_server", length: 255, nullable: true })
  dnsResolveServer: string;

  @Column({ name: "dns_resolve_type", length: 10, nullable: true })
  dnsResolveType: string;

  @Column({ name: "dns_expected_result", type: "text", nullable: true })
  dnsExpectedResult: string;

  // SSL Config
  @Column({ name: "ssl_expiry_warning_days", default: 14 })
  sslExpiryWarningDays: number;

  @Column({ name: "ssl_check_chain", default: true })
  sslCheckChain: boolean;

  /** Last SSL cert info captured from a live check — cached for fast list responses */
  @Column({ name: "last_ssl_info", type: "jsonb", nullable: true })
  lastSslInfo: {
    valid: boolean;
    issuer?: string;
    subject?: string;
    validFrom?: Date;
    validTo?: Date;
    daysUntilExpiry?: number;
    protocol?: string;
    cipher?: string;
  } | null;

  // Notification Config
  @Column({ name: "notification_channels", type: "jsonb", nullable: true })
  notificationChannels: string[];

  @Column({ name: "alert_after_down_count", default: 1 })
  alertAfterDownCount: number;

  @Column({ name: "notification_resend_interval", nullable: true })
  notificationResendInterval: number;

  @Column({ name: "notify_on_recovery", default: true })
  notifyOnRecovery: boolean;

  // Grouping
  @Column({ name: "group_id", type: "uuid", nullable: true })
  groupId: string;

  @Column({ type: "jsonb", default: "[]" })
  tags: string[];

  // Stats (cached)
  @Column({
    name: "uptime_24h",
    type: "decimal",
    precision: 5,
    scale: 2,
    default: 0,
  })
  uptime24h: number;

  @Column({
    name: "uptime_7d",
    type: "decimal",
    precision: 5,
    scale: 2,
    default: 0,
  })
  uptime7d: number;

  @Column({
    name: "uptime_30d",
    type: "decimal",
    precision: 5,
    scale: 2,
    default: 0,
  })
  uptime30d: number;

  @Column({
    name: "uptime_90d",
    type: "decimal",
    precision: 5,
    scale: 2,
    default: 0,
  })
  uptime90d: number;

  @Column({
    name: "avg_response_time_24h",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  avgResponseTime24h: number;

  @Column({
    name: "avg_response_time_7d",
    type: "decimal",
    precision: 10,
    scale: 2,
    default: 0,
  })
  avgResponseTime7d: number;

  @Column({ name: "total_checks", type: "bigint", default: 0 })
  totalChecks: number;

  @Column({ name: "successful_checks", type: "bigint", default: 0 })
  successfulChecks: number;

  @Column({ name: "failed_checks", type: "bigint", default: 0 })
  failedChecks: number;

  // Check tracking
  @Column({ name: "last_check_at", type: "timestamptz", nullable: true })
  lastCheckAt: Date;

  @Column({ name: "last_response_time", nullable: true })
  lastResponseTime: number;

  @Column({ name: "last_status_change", type: "timestamptz", nullable: true })
  lastStatusChange: Date;

  @Column({ name: "consecutive_down_count", default: 0 })
  consecutiveDownCount: number;

  @Column({ name: "consecutive_up_count", default: 0 })
  consecutiveUpCount: number;

  @Column({ name: "next_check_at", type: "timestamptz", nullable: true })
  nextCheckAt: Date;

  // Multi-tenancy
  @Column({ name: "organization_id", type: "uuid" })
  organizationId: string;

  @Column({ name: "workspace_id", type: "uuid", nullable: true })
  workspaceId: string;

  // Metadata
  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt: Date;
}
