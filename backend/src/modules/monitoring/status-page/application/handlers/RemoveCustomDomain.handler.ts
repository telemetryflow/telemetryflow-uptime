import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException } from "@nestjs/common";
import { RemoveCustomDomainCommand } from "../commands";
import {
  IStatusPageRepository,
  STATUS_PAGE_REPOSITORY,
} from "../../domain/repositories/IStatusPageRepository";

@CommandHandler(RemoveCustomDomainCommand)
export class RemoveCustomDomainHandler
  implements ICommandHandler<RemoveCustomDomainCommand>
{
  constructor(
    @Inject(STATUS_PAGE_REPOSITORY)
    private readonly statusPageRepository: IStatusPageRepository,
  ) {}

  async execute(command: RemoveCustomDomainCommand): Promise<void> {
    const statusPage = await this.statusPageRepository.findById(
      command.statusPageId,
    );

    if (
      !statusPage ||
      statusPage.organizationId !== command.organizationId
    ) {
      throw new NotFoundException("Status page not found");
    }

    statusPage.removeCustomDomain();

    await this.statusPageRepository.save(statusPage);
  }
}
