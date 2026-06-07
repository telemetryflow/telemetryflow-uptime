export class AddMonitorToStatusPageCommand {
  constructor(
    public readonly organizationId: string,
    public readonly statusPageId: string,
    public readonly monitorId: string,
    public readonly displayName?: string,
    public readonly description?: string,
    public readonly displayOrder?: number,
    public readonly groupName?: string,
    public readonly isVisible?: boolean,
  ) {}
}
