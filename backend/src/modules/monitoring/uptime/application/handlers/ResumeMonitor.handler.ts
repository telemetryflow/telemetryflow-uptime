import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException } from "@nestjs/common";
import { ResumeMonitorCommand } from "../commands";
import {
  IMonitorRepository,
  MONITOR_REPOSITORY,
} from "../../domain/repositories/IUptimeRepository";
import { Monitor } from "../../domain/aggregates/Monitor";

@CommandHandler(ResumeMonitorCommand)
export class ResumeMonitorHandler
  implements ICommandHandler<ResumeMonitorCommand>
{
  constructor(
    @Inject(MONITOR_REPOSITORY)
    private readonly monitorRepository: IMonitorRepository,
  ) {}

  async execute(command: ResumeMonitorCommand): Promise<Monitor> {
    const monitor = await this.monitorRepository.findById(command.monitorId);

    if (!monitor || monitor.organizationId !== command.organizationId) {
      throw new NotFoundException("Monitor not found");
    }

    monitor.resume();
    await this.monitorRepository.save(monitor);

    return monitor;
  }
}
