export class SetCustomDomainCommand {
  constructor(
    public readonly organizationId: string,
    public readonly statusPageId: string,
    public readonly domain: string,
  ) {}
}
