export class PauseMonitorCommand {
  constructor(
    public readonly organizationId: string,
    public readonly monitorId: string,
  ) {}
}
