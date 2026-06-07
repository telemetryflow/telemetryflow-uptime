import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, ConflictException } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { CreateStatusPageCommand } from "../commands";
import {
  IStatusPageRepository,
  STATUS_PAGE_REPOSITORY,
} from "../../domain/repositories/IStatusPageRepository";
import { StatusPage } from "../../domain/aggregates/StatusPage";

@CommandHandler(CreateStatusPageCommand)
export class CreateStatusPageHandler
  implements ICommandHandler<CreateStatusPageCommand>
{
  constructor(
    @Inject(STATUS_PAGE_REPOSITORY)
    private readonly statusPageRepository: IStatusPageRepository,
  ) {}

  async execute(command: CreateStatusPageCommand): Promise<StatusPage> {
    // Check slug uniqueness
    const slugExists = await this.statusPageRepository.slugExists(command.slug);
    if (slugExists) {
      throw new ConflictException(
        `Status page with slug "${command.slug}" already exists`,
      );
    }

    const statusPage = StatusPage.create({
      id: uuidv4(),
      title: command.title,
      slug: command.slug,
      description: command.description,
      isPublic: command.isPublic ?? true,
      branding: command.branding,
      display: command.display,
      organizationId: command.organizationId,
      createdBy: command.createdBy,
    });

    await this.statusPageRepository.save(statusPage);

    return statusPage;
  }
}
