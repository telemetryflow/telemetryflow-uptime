import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, Logger, NotFoundException } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { CreateIncidentCommand } from "../commands";
import {
  IStatusPageRepository,
  IIncidentRepository,
  STATUS_PAGE_REPOSITORY,
  INCIDENT_REPOSITORY,
} from "../../domain/repositories/IStatusPageRepository";
import { Incident, IncidentStatus } from "../../domain/aggregates/Incident";
import { ClickHouseService } from "@/shared/clickhouse/clickhouse.service";

@CommandHandler(CreateIncidentCommand)
export class CreateIncidentHandler
  implements ICommandHandler<CreateIncidentCommand>
{
  private readonly logger = new Logger(CreateIncidentHandler.name);

  constructor(
    @Inject(STATUS_PAGE_REPOSITORY)
    private readonly statusPageRepository: IStatusPageRepository,
    @Inject(INCIDENT_REPOSITORY)
    private readonly incidentRepository: IIncidentRepository,
    private readonly clickhouseService: ClickHouseService,
  ) {}

  async execute(command: CreateIncidentCommand): Promise<Incident> {
    // Verify status page exists and belongs to org
    const statusPage = await this.statusPageRepository.findById(
      command.statusPageId,
    );

    if (
      !statusPage ||
      statusPage.organizationId !== command.organizationId
    ) {
      throw new NotFoundException("Status page not found");
    }

    const incident = Incident.create({
      id: uuidv4(),
      statusPageId: command.statusPageId,
      title: command.title,
      impact: command.impact,
      status: command.isScheduledMaintenance
        ? IncidentStatus.SCHEDULED
        : IncidentStatus.INVESTIGATING,
      message: command.message,
      affectedMonitorIds: command.affectedMonitorIds || [],
      isScheduledMaintenance: command.isScheduledMaintenance || false,
      scheduledStartAt: command.scheduledStartAt,
      scheduledEndAt: command.scheduledEndAt,
      organizationId: command.organizationId,
    });

    await this.incidentRepository.save(incident);

    // Dual-write: forward incident creation to unified logs table (non-fatal)
    try {
      const chTs = new Date().toISOString().replace("T", " ").replace("Z", "");
      await this.clickhouseService.insertStatusPageLogsToMainLogs([{
        timestamp: chTs,
        incident_id: incident.id,
        incident_title: incident.title,
        status: incident.status,
        impact: incident.impact,
        message: command.message,
        status_page_id: command.statusPageId,
        organization_id: command.organizationId,
        workspace_id: "",
        tenant_id: "",
      }]);
    } catch {
      // Non-fatal
    }

    return incident;
  }
}
