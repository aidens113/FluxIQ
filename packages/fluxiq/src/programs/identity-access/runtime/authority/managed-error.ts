/**
 * The refusal of an Identity Access sign-in name, role or on/off change for a
 * person whose authority is held elsewhere (`IdentityAuthorityOwner`): a
 * person with a platform account. Their sign-in role is derived from their
 * workspace memberships' policies, whether they may sign in from their
 * account's status, and their sign-in name is their account's email, so a
 * change made here would disagree with provisioning's record and the role or
 * on/off would be undone by the next provisioning change. Its `code` is what a caller matches on; the
 * registry answers it as the response's `errorCode`.
 */
export class IdentityAuthorityManagedError extends Error {
  static readonly code = "identity.authority_managed_by_provisioning";
  readonly code = IdentityAuthorityManagedError.code;

  constructor() {
    super("This person has an account, so their sign-in name, role and sign-in are set by provisioning, not here. Their sign-in name is their account email. Use provisioning instead: setPolicies changes their role, and disableAccount or enableAccount turns their sign-in off or on (Security, Access). Their display name can still be changed here.");
    this.name = "IdentityAuthorityManagedError";
  }
}
