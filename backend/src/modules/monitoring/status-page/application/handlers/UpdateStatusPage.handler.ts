import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException } from "@nestjs/common";
import { UpdateStatusPageCommand } from "../commands";
import {
  IStatusPageRepository,
  STATUS_PAGE_REPOSITORY,
} from "../../domain/repositories/IStatusPageRepository";
import { StatusPage } from "../../domain/aggregates/StatusPage";

@CommandHandler(UpdateStatusPageCommand)
export class UpdateStatusPageHandler
  implements ICommandHandler<UpdateStatusPageCommand>
{
  constructor(
    @Inject(STATUS_PAGE_REPOSITORY)
    private readonly statusPageRepository: IStatusPageRepository,
  ) {}

  async execute(command: UpdateStatusPageCommand): Promise<StatusPage> {
    const statusPage = await this.statusPageRepository.findById(
      command.statusPageId,
    );

    if (
      !statusPage ||
      statusPage.organizationId !== command.organizationId
    ) {
      throw new NotFoundException("Status page not found");
    }

    // Update basic fields
    statusPage.update({
      title: command.title,
      description: command.description,
      isPublic: command.isPublic,
    });

    // Update slug if provided
    if (command.slug) {
      statusPage.updateSlug(command.slug);
    }

    // Update branding if provided
    if (command.branding) {
      statusPage.updateBranding(command.branding);
    }

    // Update display if provided
    if (command.display) {
      statusPage.updateDisplay(command.display);
    }

    // Replace monitors if provided
    if (command.monitors !== undefined) {
      statusPage.replaceMonitors(command.monitors);
    }

    await this.statusPageRepository.save(statusPage);

    return statusPage;
  }
}
