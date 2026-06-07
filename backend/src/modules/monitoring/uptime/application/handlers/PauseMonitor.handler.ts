import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException } from "@nestjs/common";
import { PauseMonitorCommand } from "../commands";
import {
  IMonitorRepository,
  MONITOR_REPOSITORY,
} from "../../domain/repositories/IUptimeRepository";
import { Monitor } from "../../domain/aggregates/Monitor";

@CommandHandler(PauseMonitorCommand)
export class PauseMonitorHandler
  implements ICommandHandler<PauseMonitorCommand>
{
  constructor(
    @Inject(MONITOR_REPOSITORY)
    private readonly monitorRepository: IMonitorRepository,
  ) {}

  async execute(command: PauseMonitorCommand): Promise<Monitor> {
    const monitor = await this.monitorRepository.findById(command.monitorId);

    if (!monitor || monitor.organizationId !== command.organizationId) {
      throw new NotFoundException("Monitor not found");
    }

    monitor.pause();
    await this.monitorRepository.save(monitor);

    return monitor;
  }
}
