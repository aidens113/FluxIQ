import type { PlatformProvisioningError, PlatformProvisioningErrorCode } from "@fluxiq/contracts/platform";

/**
 * A typed refusal an operation throws and `run` turns into
 * `{ ok: false, error }`. `message` is for an operator: it never holds a
 * password, token, hash, session id or a value from the request body.
 */
export class ProvisioningRefusal extends Error {
  readonly code: PlatformProvisioningErrorCode;
  readonly issues: PlatformProvisioningError["issues"];

  constructor(code: PlatformProvisioningErrorCode, message: string, issues?: PlatformProvisioningError["issues"]) {
    super(message);
    this.name = "ProvisioningRefusal";
    this.code = code;
    this.issues = issues;
  }

  /** The contract's error object. */
  toError(): PlatformProvisioningError {
    const error: PlatformProvisioningError = { code: this.code, message: this.message };
    if (this.issues !== undefined) error.issues = this.issues;
    return error;
  }
}
