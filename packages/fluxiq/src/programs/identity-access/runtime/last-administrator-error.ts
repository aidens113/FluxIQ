/**
 * The refusal to disable, delete or demote the last enabled administrator
 * (`updateUser`, `deleteUser`). Its `code` is what a caller outside this
 * program matches on -- platform provisioning answers it as
 * `last_administrator` -- so it never parses the message.
 */
export class IdentityLastAdministratorError extends Error {
  static readonly code = "identity.last_administrator";
  readonly code = IdentityLastAdministratorError.code;

  constructor() {
    super("At least one enabled administrator is required");
    this.name = "IdentityLastAdministratorError";
  }
}
