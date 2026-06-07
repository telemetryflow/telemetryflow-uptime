export class VerifyCustomDomainCommand {
  constructor(
    public readonly organizationId: string,
    public readonly statusPageId: string,
  ) {}
}
