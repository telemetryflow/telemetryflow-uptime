import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException } from "@nestjs/common";
import { RemoveMonitorFromStatusPageCommand } from "../commands";
import {
  IStatusPageRepository,
  STATUS_PAGE_REPOSITORY,
} from "../../domain/repositories/IStatusPageRepository";

@CommandHandler(RemoveMonitorFromStatusPageCommand)
export class RemoveMonitorFromStatusPageHandler
  implements ICommandHandler<RemoveMonitorFromStatusPageCommand>
{
  constructor(
    @Inject(STATUS_PAGE_REPOSITORY)
    private readonly statusPageRepository: IStatusPageRepository,
  ) {}

  async execute(command: RemoveMonitorFromStatusPageCommand): Promise<void> {
    const statusPage = await this.statusPageRepository.findById(
      command.statusPageId,
    );

    if (
      !statusPage ||
      statusPage.organizationId !== command.organizationId
    ) {
      throw new NotFoundException("Status page not found");
    }

    statusPage.removeMonitor(command.monitorId);
    await this.statusPageRepository.save(statusPage);
  }
}
