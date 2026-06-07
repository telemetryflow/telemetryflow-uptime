/**
 * Uptime Monitor Aggregate
 * Represents an endpoint or service being monitored for uptime
 */
import { SslInfo } from "./UptimeCheck";

export enum MonitorType {
  HTTP = "http",
  HTTPS = "https",
  TCP = "tcp",
  PING = "ping",
  DNS = "dns",
  UDP = "udp",
  SMTP = "smtp",
  POP3 = "pop3",
  IMAP = "imap",
  KEYWORD = "keyword",
  JSON_QUERY = "json_query",
  GRPC = "grpc",
  DOCKER = "docker",
  POSTGRES = "postgres",
  MYSQL = "mysql",
  MONGODB = "mongodb",
  REDIS = "redis",
  KAFKA = "kafka",
  RABBITMQ = "rabbitmq",
  MQTT = "mqtt",
  WEBSOCKET = "websocket",
  SSL_CERTIFICATE = "ssl_certificate",
  GAME_SERVER = "game_server",
  CUSTOM = "custom",
}

export enum MonitorStatus {
  UP = "up",
  DOWN = "down",
  DEGRADED = "degraded",
  PAUSED = "paused",
  PENDING = "pending",
  UNKNOWN = "unknown",
}

export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  PATCH = "PATCH",
  DELETE = "DELETE",
  HEAD = "HEAD",
  OPTIONS = "OPTIONS",
}

export enum AuthMethod {
  NONE = "none",
  BASIC = "basic",
  BEARER = "bearer",
  API_KEY = "api_key",
  OAUTH2 = "oauth2",
  DIGEST = "digest",
  NTLM = "ntlm",
}

export interface HttpConfig {
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
  bodyEncoding?: string;
  followRedirects?: boolean;
  maxRedirects?: number;
  acceptedStatusCodes?: number[];
  ignoreTlsErrors?: boolean;
}

export interface KeywordConfig {
  keyword: string;
  invert?: boolean; // True = alert when keyword is found
}

export interface JsonQueryConfig {
  jsonPath: string;
  expectedValue: string;
  operator?: "equals" | "contains" | "greater" | "less" | "regex";
}

export interface AuthConfig {
  method: AuthMethod;
  username?: string;
  password?: string;
  token?: string;
  apiKeyHeader?: string;
  apiKeyValue?: string;
}

export interface DatabaseConfig {
  connectionString?: string;
  query?: string;
  expectedResult?: string;
}

export interface DnsConfig {
  resolveServer?: string;
  resolveType?: "A" | "AAAA" | "MX" | "TXT" | "CNAME" | "NS";
  expectedResult?: string;
}

export interface SslConfig {
  expiryDaysWarning?: number;
  checkChain?: boolean;
}

export interface NotificationConfig {
  channels: string[]; // Notification channel IDs
  alertAfterDownCount?: number;
  resendInterval?: number; // minutes
  notifyOnRecovery?: boolean;
}

export interface UptimeStats {
  uptime24h: number;
  uptime7d: number;
  uptime30d: number;
  uptime90d: number;
  avgResponseTime24h: number;
  avgResponseTime7d: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
}

export interface MonitorProps {
  id: string;
  name: string;
  description?: string;
  url: string;
  type: MonitorType;
  status: MonitorStatus;
  interval: number; // seconds
  timeout: number; // seconds
  retries: number;
  retryInterval: number; // seconds
  isActive: boolean;
  isPaused: boolean;

  // Type-specific configs
  httpConfig?: HttpConfig;
  keywordConfig?: KeywordConfig;
  jsonQueryConfig?: JsonQueryConfig;
  authConfig?: AuthConfig;
  databaseConfig?: DatabaseConfig;
  dnsConfig?: DnsConfig;
  sslConfig?: SslConfig;

  // Notification
  notificationConfig?: NotificationConfig;

  // Grouping
  groupId?: string;
  tags: string[];

  // Stats
  uptimeStats?: UptimeStats;
  lastCheckAt?: Date;
  nextCheckAt?: Date;
  lastResponseTime?: number;
  lastStatusChange?: Date;
  consecutiveDownCount: number;
  consecutiveUpCount: number;
  lastSslInfo?: SslInfo;

  // Multi-tenancy
  organizationId: string;
  workspaceId?: string;

  // Metadata
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class Monitor {
  private props: MonitorProps;

  private constructor(props: MonitorProps) {
    this.props = props;
  }

  // Factory method
  static create(
    props: Omit<
      MonitorProps,
      | "createdAt"
      | "updatedAt"
      | "status"
      | "consecutiveDownCount"
      | "consecutiveUpCount"
      | "isPaused"
      | "nextCheckAt"
    >,
  ): Monitor {
    const now = new Date();
    return new Monitor({
      ...props,
      status: MonitorStatus.PENDING,
      isPaused: false,
      consecutiveDownCount: 0,
      consecutiveUpCount: 0,
      nextCheckAt: now, // Immediately due for first check
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: MonitorProps): Monitor {
    return new Monitor(props);
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

  get url(): string {
    return this.props.url;
  }

  get type(): MonitorType {
    return this.props.type;
  }

  get status(): MonitorStatus {
    return this.props.status;
  }

  get interval(): number {
    return this.props.interval;
  }

  get timeout(): number {
    return this.props.timeout;
  }

  get retries(): number {
    return this.props.retries;
  }

  get retryInterval(): number {
    return this.props.retryInterval;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get isPaused(): boolean {
    return this.props.isPaused;
  }

  get httpConfig(): HttpConfig | undefined {
    return this.props.httpConfig;
  }

  get keywordConfig(): KeywordConfig | undefined {
    return this.props.keywordConfig;
  }

  get jsonQueryConfig(): JsonQueryConfig | undefined {
    return this.props.jsonQueryConfig;
  }

  get authConfig(): AuthConfig | undefined {
    return this.props.authConfig;
  }

  get databaseConfig(): DatabaseConfig | undefined {
    return this.props.databaseConfig;
  }

  get dnsConfig(): DnsConfig | undefined {
    return this.props.dnsConfig;
  }

  get sslConfig(): SslConfig | undefined {
    return this.props.sslConfig;
  }

  get notificationConfig(): NotificationConfig | undefined {
    return this.props.notificationConfig;
  }

  get groupId(): string | undefined {
    return this.props.groupId;
  }

  get tags(): string[] {
    return [...this.props.tags];
  }

  get uptimeStats(): UptimeStats | undefined {
    return this.props.uptimeStats;
  }

  get lastCheckAt(): Date | undefined {
    return this.props.lastCheckAt;
  }

  get nextCheckAt(): Date | undefined {
    return this.props.nextCheckAt;
  }

  get lastResponseTime(): number | undefined {
    return this.props.lastResponseTime;
  }

  get lastStatusChange(): Date | undefined {
    return this.props.lastStatusChange;
  }

  get consecutiveDownCount(): number {
    return this.props.consecutiveDownCount;
  }

  get consecutiveUpCount(): number {
    return this.props.consecutiveUpCount;
  }

  get lastSslInfo(): SslInfo | undefined {
    return this.props.lastSslInfo;
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
  isUp(): boolean {
    return this.props.status === MonitorStatus.UP;
  }

  isDown(): boolean {
    return this.props.status === MonitorStatus.DOWN;
  }

  isDegraded(): boolean {
    return this.props.status === MonitorStatus.DEGRADED;
  }

  shouldCheck(): boolean {
    return this.props.isActive && !this.props.isPaused;
  }

  getUptimePercentage(period: "24h" | "7d" | "30d" | "90d" = "24h"): number {
    if (!this.props.uptimeStats) return 0;

    switch (period) {
      case "24h":
        return this.props.uptimeStats.uptime24h;
      case "7d":
        return this.props.uptimeStats.uptime7d;
      case "30d":
        return this.props.uptimeStats.uptime30d;
      case "90d":
        return this.props.uptimeStats.uptime90d;
      default:
        return 0;
    }
  }

  shouldNotify(): boolean {
    if (!this.props.notificationConfig) return false;
    const alertThreshold =
      this.props.notificationConfig.alertAfterDownCount || 1;
    return this.props.consecutiveDownCount >= alertThreshold;
  }

  // Mutations
  update(
    updates: Partial<
      Pick<
        MonitorProps,
        | "name"
        | "description"
        | "url"
        | "type"
        | "interval"
        | "timeout"
        | "retries"
        | "retryInterval"
      >
    >,
  ): void {
    if (updates.name !== undefined) this.props.name = updates.name;
    if (updates.description !== undefined)
      this.props.description = updates.description;
    if (updates.url !== undefined) this.props.url = updates.url;
    if (updates.type !== undefined) this.props.type = updates.type;
    if (updates.interval !== undefined) this.props.interval = updates.interval;
    if (updates.timeout !== undefined) this.props.timeout = updates.timeout;
    if (updates.retries !== undefined) this.props.retries = updates.retries;
    if (updates.retryInterval !== undefined)
      this.props.retryInterval = updates.retryInterval;
    this.props.updatedAt = new Date();
  }

  updateHttpConfig(config: HttpConfig): void {
    this.props.httpConfig = config;
    this.props.updatedAt = new Date();
  }

  updateAuthConfig(config: AuthConfig): void {
    this.props.authConfig = config;
    this.props.updatedAt = new Date();
  }

  updateNotificationConfig(config: NotificationConfig): void {
    this.props.notificationConfig = config;
    this.props.updatedAt = new Date();
  }

  pause(): void {
    this.props.isPaused = true;
    this.props.status = MonitorStatus.PAUSED;
    this.props.nextCheckAt = undefined;
    this.props.updatedAt = new Date();
  }

  resume(): void {
    this.props.isPaused = false;
    this.props.status = MonitorStatus.PENDING;
    this.props.nextCheckAt = new Date(); // Immediately due after resume
    this.props.updatedAt = new Date();
  }

  activate(): void {
    this.props.isActive = true;
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }

  recordCheckResult(
    isUp: boolean,
    responseTime: number,
    message?: string,
  ): void {
    const previousStatus = this.props.status;
    const now = new Date();

    this.props.lastCheckAt = now;
    this.props.lastResponseTime = responseTime;

    if (isUp) {
      this.props.consecutiveUpCount++;
      this.props.consecutiveDownCount = 0;

      // Determine if UP or DEGRADED based on response time threshold
      if (responseTime > this.props.timeout * 1000 * 0.8) {
        this.props.status = MonitorStatus.DEGRADED;
      } else {
        this.props.status = MonitorStatus.UP;
      }
    } else {
      this.props.consecutiveDownCount++;
      this.props.consecutiveUpCount = 0;
      this.props.status = MonitorStatus.DOWN;
    }

    if (previousStatus !== this.props.status) {
      this.props.lastStatusChange = now;
    }

    // Schedule next check
    this.props.nextCheckAt = new Date(
      now.getTime() + this.props.interval * 1000,
    );
    this.props.updatedAt = now;
  }

  updateUptimeStats(stats: UptimeStats): void {
    this.props.uptimeStats = stats;
    this.props.updatedAt = new Date();
  }

  setGroup(groupId: string | undefined): void {
    this.props.groupId = groupId;
    this.props.updatedAt = new Date();
  }

  updateTags(tags: string[]): void {
    this.props.tags = tags;
    this.props.updatedAt = new Date();
  }

  updateSslConfig(config: SslConfig): void {
    this.props.sslConfig = config;
    this.props.updatedAt = new Date();
  }

  updateLastSslInfo(sslInfo: SslInfo | undefined): void {
    this.props.lastSslInfo = sslInfo;
    this.props.updatedAt = new Date();
  }

  updateMetadata(metadata: Record<string, unknown>): void {
    this.props.metadata = metadata;
    this.props.updatedAt = new Date();
  }

  toJSON(): MonitorProps {
    return { ...this.props };
  }
}
