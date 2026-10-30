import type { PlatformServices } from "fluxiq/platform";
import type { FluxIQWorkspaceManager } from "./workspace-manager";

/**
 * The workspace a panel session works in, or null when the session is not a
 * live one (or, under `multi`, its account belongs to no workspace).
 *
 * Sessions are the platform's: the primary instance's Identity Access checks
 * them under every tenancy. Under `single` every signed-in person is in the
 * primary workspace; under `multi` it is their first active membership in the
 * platform store.
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
  const memberships = await (await input.platformServices()).store.listMembershipsOfUser(auth.user.id);
  return memberships.find((membership) => membership.status === "active")?.workspaceId ?? null;
}
