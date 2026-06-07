export class DeleteStatusPageCommand {
  constructor(
    public readonly organizationId: string,
    public readonly statusPageId: string,
  ) {}
}
