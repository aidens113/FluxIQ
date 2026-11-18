import type { CloudAdmissionService } from "fluxiq/platform";
import { composedCommerce } from "../compose-commerce";

/**
 * Cloud admission, composed once beside the billing service (interface I6):
 * the same ledger, and a policy from the same commerce configuration (grace,
 * trial, verification age), or null when this server bills nothing. Who the
 * actor and target are comes from the resolver `setCloudAuthorizer` installs;
 * with none installed every admission is refused. A malformed configuration
 * throws, naming the field.
 */
export async function getCloudAdmission(): Promise<CloudAdmissionService<unknown> | null> {
  return (await composedCommerce())?.admission ?? null;
}
