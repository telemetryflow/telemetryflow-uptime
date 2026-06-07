import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { CreateMonitorCommand } from "../commands";
import {
  IMonitorRepository,
  MONITOR_REPOSITORY,
} from "../../domain/repositories/IUptimeRepository";
import {
  Monitor,
  MonitorType,
  HttpMethod,
  HttpConfig,
} from "../../domain/aggregates/Monitor";

@CommandHandler(CreateMonitorCommand)
export class CreateMonitorHandler
  implements ICommandHandler<CreateMonitorCommand>
{
  constructor(
    @Inject(MONITOR_REPOSITORY)
    private readonly monitorRepository: IMonitorRepository,
  ) {}

  async execute(command: CreateMonitorCommand): Promise<Monitor> {
    console.log("=== CREATE MONITOR HANDLER ===");
    console.log("Command name:", command.name);
    console.log("Command name type:", typeof command.name);
    console.log("Command url:", command.url);
    console.log("Command organizationId:", command.organizationId);
    
    const httpConfig: HttpConfig | undefined = command.httpConfig
      ? {
          method:
            (command.httpConfig.method as HttpMethod) || HttpMethod.GET,
          headers: command.httpConfig.headers,
          body: command.httpConfig.body,
          acceptedStatusCodes: command.httpConfig.acceptedStatusCodes,
          maxRedirects: command.httpConfig.maxRedirects,
          ignoreTlsErrors: command.httpConfig.ignoreTlsErrors,
        }
      : command.type === MonitorType.HTTP || command.type === MonitorType.HTTPS
        ? { method: HttpMethod.GET }
        : undefined;

    const monitorProps = {
      id: uuidv4(),
      name: command.name,
      url: command.url,
      type: command.type || MonitorType.HTTP,
      interval: command.interval ?? 60,
      timeout: command.timeout ?? 30,
      retries: command.retries ?? 3,
      retryInterval: 10,
      isActive: true,
      description: command.description,
      httpConfig,
      sslConfig: command.sslConfig
        ? { expiryDaysWarning: command.sslConfig.expiryDaysWarning }
        : undefined,
      notificationConfig: command.notificationChannels?.length
        ? {
            channels: command.notificationChannels,
            alertAfterDownCount: 1,
            notifyOnRecovery: true,
          }
        : undefined,
      tags: command.tags || [],
      groupId: command.groupId,
      organizationId: command.organizationId,
      metadata: command.metadata,
    };
    
    console.log("Monitor props before create:", JSON.stringify(monitorProps, null, 2));

    const monitor = Monitor.create(monitorProps);
    
    console.log("Monitor after create - name:", monitor.name);
    console.log("Monitor after create - toJSON:", JSON.stringify(monitor.toJSON(), null, 2));

    await this.monitorRepository.save(monitor);
    
    console.log("Monitor saved successfully");
    console.log("=== END HANDLER ===");

    return monitor;
  }
}
