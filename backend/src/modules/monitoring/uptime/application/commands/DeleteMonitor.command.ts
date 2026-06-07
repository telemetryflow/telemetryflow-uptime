export class DeleteMonitorCommand {
  constructor(
    public readonly organizationId: string,
    public readonly monitorId: string,
  ) {}
}
