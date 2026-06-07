import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, NotFoundException, BadRequestException } from "@nestjs/common";
import { VerifyCustomDomainCommand } from "../commands";
import {
  IStatusPageRepository,
  STATUS_PAGE_REPOSITORY,
} from "../../domain/repositories/IStatusPageRepository";
import { StatusPage } from "../../domain/aggregates/StatusPage";

@CommandHandler(VerifyCustomDomainCommand)
export class VerifyCustomDomainHandler
  implements ICommandHandler<VerifyCustomDomainCommand>
{
  constructor(
    @Inject(STATUS_PAGE_REPOSITORY)
    private readonly statusPageRepository: IStatusPageRepository,
  ) {}

  async execute(command: VerifyCustomDomainCommand): Promise<StatusPage> {
    const statusPage = await this.statusPageRepository.findById(
      command.statusPageId,
    );

    if (
      !statusPage ||
      statusPage.organizationId !== command.organizationId
    ) {
      throw new NotFoundException("Status page not found");
    }

    if (!statusPage.customDomain) {
      throw new BadRequestException("No custom domain configured");
    }

    statusPage.verifyCustomDomain();

    await this.statusPageRepository.save(statusPage);

    return statusPage;
  }
}
