export class RemoveMonitorFromStatusPageCommand {
  constructor(
    public readonly organizationId: string,
    public readonly statusPageId: string,
    public readonly monitorId: string,
  ) {}
}
