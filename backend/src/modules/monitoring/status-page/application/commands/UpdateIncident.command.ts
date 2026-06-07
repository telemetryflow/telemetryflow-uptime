import { IncidentImpact, IncidentStatus } from "../../domain/aggregates/Incident";

export class UpdateIncidentCommand {
  constructor(
    public readonly organizationId: string,
    public readonly statusPageId: string,
    public readonly incidentId: string,
    public readonly title?: string,
    public readonly impact?: IncidentImpact,
    public readonly message?: string,
  ) {}
}

export class AddIncidentUpdateCommand {
  constructor(
    public readonly organizationId: string,
    public readonly statusPageId: string,
    public readonly incidentId: string,
    public readonly status: IncidentStatus,
    public readonly message: string,
  ) {}
}

export class ResolveIncidentCommand {
  constructor(
    public readonly organizationId: string,
    public readonly statusPageId: string,
    public readonly incidentId: string,
    public readonly message?: string,
  ) {}
}
