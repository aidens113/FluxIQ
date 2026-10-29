import { ProvisioningRefusal } from "./provisioning-refusal.ts";

/** The `code` the identity port's refusal carries (`IdentityTwoFactorResetError` in identity access). */
const TWO_FACTOR_RESET_REFUSED = "identity.two_factor_reset_refused";

/**
 * The `two_factor` refusal for an error the identity port threw when
 * `resetPassword` met an account with two-factor sign-in whose credential is
 * sealed, or null for any other error. Matched by the error's `code`, as
 * `PlatformIdentityPort` documents it, never by its message.
 */
export function twoFactorRefusal(error: unknown): ProvisioningRefusal | null {
  if (typeof error !== "object" || error === null || (error as { code?: unknown }).code !== TWO_FACTOR_RESET_REFUSED) return null;
  return new ProvisioningRefusal("two_factor", "The account uses two-factor sign-in; a signed-in administrator must reset its password.");
}
