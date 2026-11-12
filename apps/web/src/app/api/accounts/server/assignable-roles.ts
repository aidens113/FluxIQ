import type { AssignableRole } from "../../../../features/accounts/model";

/**
 * The roles an administrator may give on a deployment. `local` and
 * `self-hosted` keep today's two (administrator, read only), the ones their
 * permission checks know; `service` adds the own-data member. Owner is never
 * given here: it is claimed at setup.
 */
export function assignableRoles(profile: "local" | "self-hosted" | "service"): AssignableRole[] {
  return profile === "service" ? ["administrator", "read-only", "member"] : ["administrator", "read-only"];
}
