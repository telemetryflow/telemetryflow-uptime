import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException } from "@nestjs/common";
import { SetCustomDomainCommand } from "../commands";
import {
  IStatusPageRepository,
  STATUS_PAGE_REPOSITORY,
} from "../../domain/repositories/IStatusPageRepository";
import { StatusPage } from "../../domain/aggregates/StatusPage";

@CommandHandler(SetCustomDomainCommand)
export class SetCustomDomainHandler
  implements ICommandHandler<SetCustomDomainCommand>
{
  constructor(
    @Inject(STATUS_PAGE_REPOSITORY)
    private readonly statusPageRepository: IStatusPageRepository,
  ) {}

  async execute(command: SetCustomDomainCommand): Promise<StatusPage> {
    const statusPage = await this.statusPageRepository.findById(
      command.statusPageId,
    );

    if (
      !statusPage ||
      statusPage.organizationId !== command.organizationId
    ) {
      throw new NotFoundException("Status page not found");
    }

    statusPage.setCustomDomain(command.domain);

    await this.statusPageRepository.save(statusPage);

    return statusPage;
  }
}
