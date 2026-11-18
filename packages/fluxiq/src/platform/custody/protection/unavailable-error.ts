/** Host protection is not configured or cannot resolve the required wrapping key. */
export class SecretKeyProtectionUnavailableError extends Error {
  constructor() {
    super("Secret key host protection is unavailable.");
    this.name = "SecretKeyProtectionUnavailableError";
  }
}
