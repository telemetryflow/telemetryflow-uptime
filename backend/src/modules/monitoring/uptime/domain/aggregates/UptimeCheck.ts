/**
 * Uptime Check Value Object
 * Represents a single check result for a monitor
 */

export enum CheckStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  TIMEOUT = 'timeout',
  ERROR = 'error',
}

export interface CheckTiming {
  dnsLookup?: number;
  tcpConnection?: number;
  tlsHandshake?: number;
  firstByte?: number;
  contentTransfer?: number;
  total: number;
}

export interface SslInfo {
  valid: boolean;
  issuer?: string;
  subject?: string;
  validFrom?: Date;
  validTo?: Date;
  daysUntilExpiry?: number;
  protocol?: string;
  cipher?: string;
}

export interface UptimeCheckProps {
  id: string;
  monitorId: string;
  status: CheckStatus;
  statusCode?: number;
  responseTime: number; // milliseconds
  timing?: CheckTiming;
  message?: string;
  error?: string;
  sslInfo?: SslInfo;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  ipAddress?: string;
  region?: string;
  checkedAt: Date;
}

export class UptimeCheck {
  private props: UptimeCheckProps;

  private constructor(props: UptimeCheckProps) {
    this.props = props;
  }

  static create(props: UptimeCheckProps): UptimeCheck {
    return new UptimeCheck(props);
  }

  static reconstitute(props: UptimeCheckProps): UptimeCheck {
    return new UptimeCheck(props);
  }

  // Getters
  get id(): string {
    return this.props.id;
  }

  get monitorId(): string {
    return this.props.monitorId;
  }

  get status(): CheckStatus {
    return this.props.status;
  }

  get statusCode(): number | undefined {
    return this.props.statusCode;
  }

  get responseTime(): number {
    return this.props.responseTime;
  }

  get timing(): CheckTiming | undefined {
    return this.props.timing;
  }

  get message(): string | undefined {
    return this.props.message;
  }

  get error(): string | undefined {
    return this.props.error;
  }

  get sslInfo(): SslInfo | undefined {
    return this.props.sslInfo;
  }

  get responseBody(): string | undefined {
    return this.props.responseBody;
  }

  get responseHeaders(): Record<string, string> | undefined {
    return this.props.responseHeaders;
  }

  get ipAddress(): string | undefined {
    return this.props.ipAddress;
  }

  get region(): string | undefined {
    return this.props.region;
  }

  get checkedAt(): Date {
    return this.props.checkedAt;
  }

  // Business methods
  isSuccess(): boolean {
    return this.props.status === CheckStatus.SUCCESS;
  }

  isFailure(): boolean {
    return (
      this.props.status === CheckStatus.FAILURE ||
      this.props.status === CheckStatus.TIMEOUT ||
      this.props.status === CheckStatus.ERROR
    );
  }

  hasSslWarning(warningDays: number = 14): boolean {
    if (!this.props.sslInfo) return false;
    if (!this.props.sslInfo.valid) return true;
    if (this.props.sslInfo.daysUntilExpiry !== undefined) {
      return this.props.sslInfo.daysUntilExpiry <= warningDays;
    }
    return false;
  }

  toJSON(): UptimeCheckProps {
    return { ...this.props };
  }
}
