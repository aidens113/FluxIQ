/**
 * The refusal of an Identity Access sign-in name, role or on/off change when
 * the authority owner (`IdentityAuthorityOwner`) could not say whether the
 * person's authority is held elsewhere. Failing closed: an unreadable answer is never
 * read as "held here", so nothing changes until it can be checked. Carries no
 * detail of the failure.
 */
export class IdentityAuthorityUncheckedError extends Error {
  static readonly code = "identity.authority_unchecked";
  readonly code = IdentityAuthorityUncheckedError.code;

  constructor() {
    super("Whether this person has an account could not be checked, so their sign-in name, role and sign-in were not changed. Try again.");
    this.name = "IdentityAuthorityUncheckedError";
  }
}
