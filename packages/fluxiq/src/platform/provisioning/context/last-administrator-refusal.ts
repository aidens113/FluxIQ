import { ProvisioningRefusal } from "./provisioning-refusal.ts";

/** The `code` the identity port's refusal carries (`IdentityLastAdministratorError` in identity access). */
const LAST_ADMINISTRATOR_CODE = "identity.last_administrator";

/**
 * The `last_administrator` refusal for an error the identity port threw when
 * an operation would disable, delete or demote the last enabled administrator,
 * or null for any other error. Matched by the error's `code`, as
 * `PlatformIdentityPort` documents it, never by its message.
 */
export function lastAdministratorRefusal(error: unknown): ProvisioningRefusal | null {
  if (typeof error !== "object" || error === null || (error as { code?: unknown }).code !== LAST_ADMINISTRATOR_CODE) return null;
  return new ProvisioningRefusal("last_administrator", "The last enabled administrator cannot be disabled, deleted or demoted.");
}
