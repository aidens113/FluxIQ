import type { PlatformServices } from "fluxiq/platform";
import type { FluxIQWorkspaceManager } from "./workspace-manager";

/**
 * The workspace a panel session works in, or null when the session is not a
 * live one (or, under `multi`, its account belongs to no workspace).
 *
 * Sessions are the platform's: the primary instance's Identity Access checks
 * them under every tenancy. Under `single` every signed-in person is in the
 * primary workspace; under `multi` it is their oldest active membership in
 * an existing tenant workspace, with workspace id breaking a creation-time
 * tie independently of store order. A membership alone never opens a root.
 */
export async function sessionWorkspaceId(input: {
  sessionId: string;
  manager: Pick<FluxIQWorkspaceManager, "tenancy" | "primaryWorkspaceId" | "primary">;
  platformServices: () => Promise<Pick<PlatformServices, "store">>;
}): Promise<string | null> {
  const { manager } = input;
  const auth = await manager.primary().fluxiq.programs.identityAccess.validateSession(input.sessionId);
  if (!auth) return null;
  if (manager.tenancy === "single") return manager.primaryWorkspaceId;
  const { store } = await input.platformServices();
  const memberships = await store.listMembershipsOfUser(auth.user.id);
  const active = memberships.filter((membership) => membership.status === "active" && membership.workspaceId !== manager.primaryWorkspaceId);
  active.sort((left, right) => left.createdAtMs - right.createdAtMs || (left.workspaceId < right.workspaceId ? -1 : left.workspaceId > right.workspaceId ? 1 : 0));
  for (const membership of active) {
    const workspace = await store.getWorkspace(membership.workspaceId);
    if (workspace) return workspace.workspaceId;
  }
  return null;
}
