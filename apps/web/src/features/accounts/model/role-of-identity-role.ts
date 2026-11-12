import type { AccountRole } from "./types";

/** The role an older Identity Access user's `roleId` is: `admin` an administrator, `viewer` read only, anything else unknown. */
export function roleOfIdentityRole(roleId: string): AccountRole {
  if (roleId === "admin") return "administrator";
  if (roleId === "viewer") return "read-only";
  return "other";
}
