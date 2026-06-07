export class CreateStatusPageCommand {
  constructor(
    public readonly organizationId: string,
    public readonly createdBy: string,
    public readonly title: string,
    public readonly slug: string,
    public readonly description?: string,
    public readonly isPublic?: boolean,
    public readonly branding?: Record<string, any>,
    public readonly display?: Record<string, any>,
  ) {}
}
