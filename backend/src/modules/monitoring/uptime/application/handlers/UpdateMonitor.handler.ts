import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException } from "@nestjs/common";
import { UpdateMonitorCommand } from "../commands";
import {
  IMonitorRepository,
  MONITOR_REPOSITORY,
} from "../../domain/repositories/IUptimeRepository";
import { Monitor, HttpConfig, HttpMethod } from "../../domain/aggregates/Monitor";

@CommandHandler(UpdateMonitorCommand)
export class UpdateMonitorHandler
  implements ICommandHandler<UpdateMonitorCommand>
{
  constructor(
    @Inject(MONITOR_REPOSITORY)
    private readonly monitorRepository: IMonitorRepository,
  ) {}

  async execute(command: UpdateMonitorCommand): Promise<Monitor> {
    const monitor = await this.monitorRepository.findById(command.monitorId);

    if (!monitor || monitor.organizationId !== command.organizationId) {
      throw new NotFoundException("Monitor not found");
    }

    monitor.update({
      name: command.name,
      url: command.url,
      type: command.type,
      description: command.description,
      interval: command.interval,
      timeout: command.timeout,
      retries: command.retries,
    });

    if (command.httpConfig) {
      const httpConfig: HttpConfig = {
        method:
          (command.httpConfig.method as HttpMethod) ||
          monitor.httpConfig?.method ||
          HttpMethod.GET,
        headers: command.httpConfig.headers ?? monitor.httpConfig?.headers,
        body: command.httpConfig.body ?? monitor.httpConfig?.body,
        acceptedStatusCodes:
          command.httpConfig.acceptedStatusCodes ??
          monitor.httpConfig?.acceptedStatusCodes,
        maxRedirects:
          command.httpConfig.maxRedirects ??
          monitor.httpConfig?.maxRedirects,
        ignoreTlsErrors:
          command.httpConfig.ignoreTlsErrors ??
          monitor.httpConfig?.ignoreTlsErrors,
      };
      monitor.updateHttpConfig(httpConfig);
    }

    if (command.sslConfig) {
      monitor.updateSslConfig({
        expiryDaysWarning: command.sslConfig.expiryDaysWarning,
        checkChain: monitor.sslConfig?.checkChain,
      });
    }

    if (command.metadata !== undefined) {
      monitor.updateMetadata(command.metadata);
    }

    if (command.notificationChannels !== undefined) {
      monitor.updateNotificationConfig({
        channels: command.notificationChannels,
        alertAfterDownCount:
          monitor.notificationConfig?.alertAfterDownCount ?? 1,
        notifyOnRecovery: monitor.notificationConfig?.notifyOnRecovery ?? true,
      });
    }

    if (command.tags !== undefined) {
      monitor.updateTags(command.tags);
    }

    if (command.groupId !== undefined) {
      monitor.setGroup(command.groupId || undefined);
    }

    await this.monitorRepository.save(monitor);

    return monitor;
  }
}
