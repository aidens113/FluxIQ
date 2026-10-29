/**
 * A provisioning listener configuration the listener refuses to start with: a
 * public bind, an invalid listen value or CIDR, or an unusable token file.
 * The message names the setting and never holds a token.
 */
export class ProvisioningListenerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisioningListenerConfigError";
  }
}
