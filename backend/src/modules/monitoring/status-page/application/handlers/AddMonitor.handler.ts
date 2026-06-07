import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException } from "@nestjs/common";
import { AddMonitorToStatusPageCommand } from "../commands";
import {
  IStatusPageRepository,
  STATUS_PAGE_REPOSITORY,
} from "../../domain/repositories/IStatusPageRepository";
import { StatusPage, StatusPageMonitorConfig } from "../../domain/aggregates/StatusPage";

@CommandHandler(AddMonitorToStatusPageCommand)
export class AddMonitorToStatusPageHandler
  implements ICommandHandler<AddMonitorToStatusPageCommand>
{
  constructor(
    @Inject(STATUS_PAGE_REPOSITORY)
    private readonly statusPageRepository: IStatusPageRepository,
  ) {}

  async execute(command: AddMonitorToStatusPageCommand): Promise<StatusPage> {
    const statusPage = await this.statusPageRepository.findById(
      command.statusPageId,
    );

    if (
      !statusPage ||
      statusPage.organizationId !== command.organizationId
    ) {
      throw new NotFoundException("Status page not found");
    }

    const monitorConfig: StatusPageMonitorConfig = {
      monitorId: command.monitorId,
      displayName: command.displayName,
      description: command.description,
      displayOrder: command.displayOrder ?? statusPage.monitors.length,
      groupName: command.groupName,
      isVisible: command.isVisible ?? true,
    };

    statusPage.addMonitor(monitorConfig);
    await this.statusPageRepository.save(statusPage);

    return statusPage;
  }
}
