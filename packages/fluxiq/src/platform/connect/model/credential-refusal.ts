import type { ConnectEligibilityError } from "./types.ts";

/** A trusted issuer may report this only before it starts minting a credential. Consent stays spent. */
export class ConnectCredentialRefusal extends Error {
  readonly error: ConnectEligibilityError;

  constructor(error: ConnectEligibilityError) {
    super("The client credential was refused before issuance.");
    if (!["invalid_grant", "email_unverified", "account_disabled", "client_limit_reached"].includes(error)) throw new TypeError("Invalid connect refusal.");
    this.name = "ConnectCredentialRefusal";
    this.error = error;
  }
}
