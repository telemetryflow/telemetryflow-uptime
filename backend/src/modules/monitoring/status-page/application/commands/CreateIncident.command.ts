import { IncidentImpact } from "../../domain/aggregates/Incident";

export class CreateIncidentCommand {
  constructor(
    public readonly organizationId: string,
    public readonly statusPageId: string,
    public readonly title: string,
    public readonly impact: IncidentImpact,
    public readonly message?: string,
    public readonly affectedMonitorIds?: string[],
    public readonly isScheduledMaintenance?: boolean,
    public readonly scheduledStartAt?: Date,
    public readonly scheduledEndAt?: Date,
  ) {}
}
