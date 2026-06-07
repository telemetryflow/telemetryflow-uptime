import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { Inject, Logger, NotFoundException } from "@nestjs/common";
import {
  UpdateIncidentCommand,
  AddIncidentUpdateCommand,
  ResolveIncidentCommand,
} from "../commands";
import {
  IIncidentRepository,
  INCIDENT_REPOSITORY,
} from "../../domain/repositories/IStatusPageRepository";
import { Incident } from "../../domain/aggregates/Incident";
import { ClickHouseService } from "@/shared/clickhouse/clickhouse.service";

@CommandHandler(UpdateIncidentCommand)
export class UpdateIncidentHandler
  implements ICommandHandler<UpdateIncidentCommand>
{
  private readonly logger = new Logger(UpdateIncidentHandler.name);

  constructor(
    @Inject(INCIDENT_REPOSITORY)
    private readonly incidentRepository: IIncidentRepository,
    private readonly clickhouseService: ClickHouseService,
  ) {}

  async execute(command: UpdateIncidentCommand): Promise<Incident> {
    const incident = await this.incidentRepository.findById(
      command.incidentId,
    );

    if (!incident || incident.organizationId !== command.organizationId) {
      throw new NotFoundException("Incident not found");
    }

    incident.update({
      title: command.title,
      impact: command.impact,
      message: command.message,
    });

    await this.incidentRepository.save(incident);

    // Dual-write: forward incident update to unified logs table (non-fatal)
    try {
      const chTs = new Date().toISOString().replace("T", " ").replace("Z", "");
      await this.clickhouseService.insertStatusPageLogsToMainLogs([{
        timestamp: chTs,
        incident_id: incident.id,
        incident_title: incident.title,
        status: incident.status,
        impact: incident.impact,
        message: command.message,
        status_page_id: incident.statusPageId,
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

@CommandHandler(AddIncidentUpdateCommand)
export class AddIncidentUpdateHandler
  implements ICommandHandler<AddIncidentUpdateCommand>
{
  private readonly logger = new Logger(AddIncidentUpdateHandler.name);

  constructor(
    @Inject(INCIDENT_REPOSITORY)
    private readonly incidentRepository: IIncidentRepository,
    private readonly clickhouseService: ClickHouseService,
  ) {}

  async execute(command: AddIncidentUpdateCommand): Promise<Incident> {
    const incident = await this.incidentRepository.findById(
      command.incidentId,
    );

    if (!incident || incident.organizationId !== command.organizationId) {
      throw new NotFoundException("Incident not found");
    }

    incident.updateStatus(command.status, command.message);

    await this.incidentRepository.save(incident);

    // Dual-write: forward status update to unified logs table (non-fatal)
    try {
      const chTs = new Date().toISOString().replace("T", " ").replace("Z", "");
      await this.clickhouseService.insertStatusPageLogsToMainLogs([{
        timestamp: chTs,
        incident_id: incident.id,
        incident_title: incident.title,
        status: command.status,
        impact: incident.impact,
        message: command.message,
        status_page_id: incident.statusPageId,
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

@CommandHandler(ResolveIncidentCommand)
export class ResolveIncidentHandler
  implements ICommandHandler<ResolveIncidentCommand>
{
  private readonly logger = new Logger(ResolveIncidentHandler.name);

  constructor(
    @Inject(INCIDENT_REPOSITORY)
    private readonly incidentRepository: IIncidentRepository,
    private readonly clickhouseService: ClickHouseService,
  ) {}

  async execute(command: ResolveIncidentCommand): Promise<Incident> {
    const incident = await this.incidentRepository.findById(
      command.incidentId,
    );

    if (!incident || incident.organizationId !== command.organizationId) {
      throw new NotFoundException("Incident not found");
    }

    incident.resolve(command.message);

    await this.incidentRepository.save(incident);

    // Dual-write: forward incident resolution to unified logs table (non-fatal)
    try {
      const chTs = new Date().toISOString().replace("T", " ").replace("Z", "");
      await this.clickhouseService.insertStatusPageLogsToMainLogs([{
        timestamp: chTs,
        incident_id: incident.id,
        incident_title: incident.title,
        status: "resolved",
        impact: incident.impact,
        message: command.message,
        status_page_id: incident.statusPageId,
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
