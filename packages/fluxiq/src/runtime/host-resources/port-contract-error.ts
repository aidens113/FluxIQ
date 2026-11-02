/** The domain's host-resource port broke its contract: a bad capacity, a malformed grant, or a grant that overlaps a live lease. */
export class AutomationStudioHostResourcePortContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationStudioHostResourcePortContractError";
  }
}
