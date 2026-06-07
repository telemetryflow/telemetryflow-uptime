import { CreateStatusPageHandler } from "./CreateStatusPage.handler";
import { UpdateStatusPageHandler } from "./UpdateStatusPage.handler";
import { DeleteStatusPageHandler } from "./DeleteStatusPage.handler";
import { AddMonitorToStatusPageHandler } from "./AddMonitor.handler";
import { RemoveMonitorFromStatusPageHandler } from "./RemoveMonitor.handler";
import { CreateIncidentHandler } from "./CreateIncident.handler";
import {
  UpdateIncidentHandler,
  AddIncidentUpdateHandler,
  ResolveIncidentHandler,
} from "./UpdateIncident.handler";
import { SetCustomDomainHandler } from "./SetCustomDomain.handler";
import { VerifyCustomDomainHandler } from "./VerifyCustomDomain.handler";
import { RemoveCustomDomainHandler } from "./RemoveCustomDomain.handler";

export {
  CreateStatusPageHandler,
  UpdateStatusPageHandler,
  DeleteStatusPageHandler,
  AddMonitorToStatusPageHandler,
  RemoveMonitorFromStatusPageHandler,
  CreateIncidentHandler,
  UpdateIncidentHandler,
  AddIncidentUpdateHandler,
  ResolveIncidentHandler,
  SetCustomDomainHandler,
  VerifyCustomDomainHandler,
  RemoveCustomDomainHandler,
};

export const StatusPageCommandHandlers = [
  CreateStatusPageHandler,
  UpdateStatusPageHandler,
  DeleteStatusPageHandler,
  AddMonitorToStatusPageHandler,
  RemoveMonitorFromStatusPageHandler,
  CreateIncidentHandler,
  UpdateIncidentHandler,
  AddIncidentUpdateHandler,
  ResolveIncidentHandler,
  SetCustomDomainHandler,
  VerifyCustomDomainHandler,
  RemoveCustomDomainHandler,
];
