/**
 * The refusal of `resetPassword` (a welcome or reset link, or an operator's
 * reset) for an account with two-factor sign-in whose credential is sealed and
 * not unlocked in this process. The authenticator secret is inside the seal,
 * so the reset could only go ahead by turning two-factor off, and a link or an
 * operator command alone must never do that. Nothing is changed; a signed-in
 * administrator resets such an account (`setPasswordAuthorized`). Its `code` is what platform provisioning matches on
 * (answered as `two_factor`), never the message.
 */
export class IdentityTwoFactorResetError extends Error {
  static readonly code = "identity.two_factor_reset_refused";
  readonly code = IdentityTwoFactorResetError.code;

  constructor() {
    super("This account uses two-factor sign-in; an administrator must reset its password");
    this.name = "IdentityTwoFactorResetError";
  }
}
