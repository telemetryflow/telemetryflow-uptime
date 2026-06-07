import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException } from "@nestjs/common";
import { DeleteMonitorCommand } from "../commands";
import {
  IMonitorRepository,
  MONITOR_REPOSITORY,
} from "../../domain/repositories/IUptimeRepository";

@CommandHandler(DeleteMonitorCommand)
export class DeleteMonitorHandler
  implements ICommandHandler<DeleteMonitorCommand>
{
  constructor(
    @Inject(MONITOR_REPOSITORY)
    private readonly monitorRepository: IMonitorRepository,
  ) {}

  async execute(command: DeleteMonitorCommand): Promise<void> {
    const monitor = await this.monitorRepository.findById(command.monitorId);

    if (!monitor || monitor.organizationId !== command.organizationId) {
      throw new NotFoundException("Monitor not found");
    }

    await this.monitorRepository.delete(command.monitorId);
  }
}
