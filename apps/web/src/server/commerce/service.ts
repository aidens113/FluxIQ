import type { CommerceBillingService } from "fluxiq/platform";
import { composedCommerce } from "./compose-commerce";

/**
 * The web server's billing service, or null when this server bills nothing
 * (`FLUXIQ_COMMERCE_CONFIG_FILE` unset). A malformed configuration throws,
 * naming the field.
 */
export async function getCommerceBilling(): Promise<CommerceBillingService | null> {
  return (await composedCommerce())?.service ?? null;
}
