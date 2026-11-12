/**
 * The refusal of a sign-in (`IdentityAccessService.authenticate`) whose
 * password was right but whose authenticator code is missing or wrong, so a
 * client asks for the code rather than reporting bad credentials.
 */
export class TotpRequiredError extends Error {
  constructor(message = "Authenticator code required") {
    super(message);
    this.name = "TotpRequiredError";
  }
}
