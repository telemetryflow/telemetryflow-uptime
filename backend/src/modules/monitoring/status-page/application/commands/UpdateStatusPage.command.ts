export class UpdateStatusPageCommand {
  constructor(
    public readonly organizationId: string,
    public readonly statusPageId: string,
    public readonly title?: string,
    public readonly slug?: string,
    public readonly description?: string,
    public readonly isPublic?: boolean,
    public readonly branding?: Record<string, any>,
    public readonly display?: Record<string, any>,
    public readonly monitors?: Array<{
      monitorId: string;
      displayName?: string;
      description?: string;
      displayOrder: number;
      groupName?: string;
      isVisible: boolean;
    }>,
  ) {}
}
