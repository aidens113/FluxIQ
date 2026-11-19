import type { CommerceRouteDeps } from "./types";

/**
 * The account a workspace's billing belongs to: a personal workspace's owner.
 * Organisation workspaces are billed by a later unit, so they have none yet.
 */
export async function payerOf(deps: Pick<CommerceRouteDeps, "workspaceId" | "workspaces">): Promise<string | null> {
  const workspace = await deps.workspaces.getWorkspace(deps.workspaceId);
  return workspace?.workspaceId === deps.workspaceId ? workspace.ownerUserId : null;
}
