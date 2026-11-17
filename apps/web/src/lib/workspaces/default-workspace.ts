import type { PlatformStore } from "fluxiq/platform";

/** Resolve a person's default tenant from current platform records, never a request-selected id. */
export async function defaultWorkspaceId(input: {
  userId: string;
  primaryWorkspaceId: string;
  store: Pick<PlatformStore, "getAccount" | "listMembershipsOfUser" | "getWorkspace">;
}): Promise<string | null> {
  const account = await input.store.getAccount(input.userId);
  if (!account || account.status !== "active" || account.deletion !== null) return null;
  const memberships = await input.store.listMembershipsOfUser(input.userId);
  const active = memberships.filter((membership) => membership.status === "active" && membership.workspaceId !== input.primaryWorkspaceId);
  active.sort((left, right) => left.createdAtMs - right.createdAtMs || (left.workspaceId < right.workspaceId ? -1 : left.workspaceId > right.workspaceId ? 1 : 0));
  for (const membership of active) {
    const workspace = await input.store.getWorkspace(membership.workspaceId);
    if (workspace) return workspace.workspaceId;
  }
  return null;
}
