import type { AccountPlatform } from "./route-deps";

/**
 * Whether `userId` has an active membership in a workspace other than the
 * caller's. Their account (its sign-in, its invite, its existence) is then
 * not this workspace's alone, so a change to it from this workspace would
 * reach into another one. Read from the platform store, never the request.
 */
export async function belongsElsewhere(platform: AccountPlatform, userId: string): Promise<boolean> {
  const memberships = await platform.store.listMembershipsOfUser(userId);
  return memberships.some((membership) => membership.status === "active" && membership.workspaceId !== platform.workspaceId);
}
