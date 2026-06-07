export * from "./CreateMonitor.handler";
export * from "./UpdateMonitor.handler";
export * from "./DeleteMonitor.handler";
export * from "./PauseMonitor.handler";
export * from "./ResumeMonitor.handler";

import { CreateMonitorHandler } from "./CreateMonitor.handler";
import { UpdateMonitorHandler } from "./UpdateMonitor.handler";
import { DeleteMonitorHandler } from "./DeleteMonitor.handler";
import { PauseMonitorHandler } from "./PauseMonitor.handler";
import { ResumeMonitorHandler } from "./ResumeMonitor.handler";

export const CommandHandlers = [
  CreateMonitorHandler,
  UpdateMonitorHandler,
  DeleteMonitorHandler,
  PauseMonitorHandler,
  ResumeMonitorHandler,
];
