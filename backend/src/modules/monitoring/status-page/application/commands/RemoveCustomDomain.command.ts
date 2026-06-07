export class RemoveCustomDomainCommand {
  constructor(
    public readonly organizationId: string,
    public readonly statusPageId: string,
  ) {}
}
