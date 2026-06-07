import { MonitorType, HttpMethod } from "../../domain/aggregates/Monitor";

export class CreateMonitorCommand {
  constructor(
    public readonly organizationId: string,
    public readonly name: string,
    public readonly url: string,
    public readonly type: MonitorType = MonitorType.HTTP,
    public readonly description?: string,
    public readonly interval?: number,
    public readonly timeout?: number,
    public readonly retries?: number,
    public readonly httpConfig?: {
      method?: HttpMethod;
      headers?: Record<string, string>;
      body?: string;
      acceptedStatusCodes?: number[];
      maxRedirects?: number;
      ignoreTlsErrors?: boolean;
    },
    public readonly notificationChannels?: string[],
    public readonly tags?: string[],
    public readonly groupId?: string,
    public readonly sslConfig?: {
      expiryDaysWarning?: number;
    },
    public readonly metadata?: Record<string, unknown>,
  ) {}
}
