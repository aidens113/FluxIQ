/**
 * The refusal of a sign-in name another person already has, ignoring case
 * (`refuseTakenUsername`): sign-in matches names ignoring case, so two people
 * whose names differ only by case could not both sign in by name. Nothing is
 * changed. Its `code` is what a caller outside this program matches on; the
 * `create-user` and `update-user` endpoints answer it as the response's
 * `errorCode`, never by parsing the message.
 */
export class IdentityUsernameTakenError extends Error {
  static readonly code = "identity.username_taken";
  readonly code = IdentityUsernameTakenError.code;

  constructor() {
    super("Another person already has this sign-in name (sign-in names are compared ignoring case)");
    this.name = "IdentityUsernameTakenError";
  }
}
