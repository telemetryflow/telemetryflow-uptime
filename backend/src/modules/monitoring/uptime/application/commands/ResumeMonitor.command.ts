export class ResumeMonitorCommand {
  constructor(
    public readonly organizationId: string,
    public readonly monitorId: string,
  ) {}
}
