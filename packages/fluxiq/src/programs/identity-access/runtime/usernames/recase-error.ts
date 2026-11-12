/** A case-only write no longer names the person's current sign-in name. */
export class IdentityUsernameRecaseError extends Error {
  static readonly code = "identity.recase_not_case_only";
  readonly code = IdentityUsernameRecaseError.code;

  constructor() {
    super("Only the capitalisation of your sign-in name can change here: send your current sign-in name with different capital letters.");
    this.name = "IdentityUsernameRecaseError";
  }
}
