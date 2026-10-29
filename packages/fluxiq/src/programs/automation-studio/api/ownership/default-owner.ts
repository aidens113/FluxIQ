import { adminRole } from "../../../identity-access/index.ts";
import type { AutomationStudioProjectOwnerDefaults } from "./types.ts";

/**
 * The owner an unowned project is given (hosted production plan, Permissions,
 * "Ownership"): the workspace owner, else the first enabled `admin` user by
 * creation order (ties broken by id, so every host picks the same user).
 * Null when there is neither. A disabled admin is passed over: an owner who
 * cannot sign in would leave the project reachable only by full access.
 */
export async function automationStudioProjectDefaultOwner(defaults: AutomationStudioProjectOwnerDefaults): Promise<string | null> {
  const workspaceOwner = defaults.workspaceOwner ? await defaults.workspaceOwner() : null;
  if (typeof workspaceOwner === "string" && workspaceOwner.length > 0) return workspaceOwner;
  const admins = (await defaults.users())
    .filter((user) => user.enabled && user.roleId === adminRole.id)
    .sort((left, right) => left.createdAtMs - right.createdAtMs || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return admins[0]?.id ?? null;
}
