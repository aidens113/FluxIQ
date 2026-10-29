import type { Role } from "../types.ts";

export const adminRole: Role = {
  id: "admin",
  permissions: [
    "programs.read",
    "programs.write",
    "flows.write",
    "runtime.control",
    "compute.control",
    "identity.manage",
    "data.manage",
    "secrets.manage"
  ]
};

export const viewerRole: Role = {
  id: "viewer",
  permissions: ["programs.read"]
};

export const defaultRoles: Role[] = [adminRole, viewerRole];

/**
 * The predefined IAM identity policies each role is replaced by (hosted
 * production plan, Permissions, "Predefined policies"), as data: the names are
 * the contract's (`IAM_PREDEFINED_POLICIES` in `@fluxiq/contracts/iam`), and
 * the policies themselves are the platform's (`platform/iam/predefined/`),
 * which this program does not import.
 *
 * - `admin` -> `FluxIQAdministratorAccess`, `viewer` -> `FluxIQReadOnlyAccess`:
 *   the parity test (`platform/iam/parity/`) proves each allows exactly what
 *   the role's permissions allow today.
 * - `user` -> `FluxIQUserAccess`, the own-data rule. No `user` role exists
 *   today (`defaultRoles` is unchanged); the entry is the mapping a `user`
 *   membership takes when IAM is switched on.
 */
export const ROLE_POLICY_NAMES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  admin: Object.freeze(["FluxIQAdministratorAccess"]),
  viewer: Object.freeze(["FluxIQReadOnlyAccess"]),
  user: Object.freeze(["FluxIQUserAccess"])
});

/** The predefined policy names a role maps to, or null for a role with no mapping (never `{}`'s inherited keys). */
export function rolePolicyNames(roleId: string): readonly string[] | null {
  return Object.hasOwn(ROLE_POLICY_NAMES, roleId) ? (ROLE_POLICY_NAMES[roleId] ?? null) : null;
}
