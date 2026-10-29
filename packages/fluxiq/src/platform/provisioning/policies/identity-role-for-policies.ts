/** The policies that make a member today's identity-access `admin`. */
const ADMIN_POLICIES: ReadonlySet<string> = new Set(["FluxIQOwnerFullAccess", "FluxIQAdministratorAccess"]);

/**
 * The identity-access `roleId` a member's policies map to until lane B3
 * enforces IAM: Owner or Administrator is `admin`, anything else `viewer`.
 */
export function identityRoleForPolicies(policies: readonly string[]): "admin" | "viewer" {
  return policies.some((name) => ADMIN_POLICIES.has(name)) ? "admin" : "viewer";
}
