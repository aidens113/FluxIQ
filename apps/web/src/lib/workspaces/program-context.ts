import type { ProgramRouteContext } from "fluxiq/server";
import { FLUXIQ_SESSION_COOKIE } from "../session-cookie";
import { sessionIdOf, type WorkspaceRequestSource } from "./session-id-of";
import { sessionWorkspaceId } from "./session-workspace";

/**
 * The program handler's selected data instance and trusted identity authority,
 * held until the buffered response is written. A service bearer without a
 * verified workspace binding cannot select a gateway and is refused here.
 * Single-root hosts retain their gateway's existing cookie and bearer paths.
 */
export async function workspaceProgramContext(source: WorkspaceRequestSource): Promise<{
  context: ProgramRouteContext;
  acceptBearer: boolean;
  release(): void;
} | null> {
  // The runtime imports the workspace barrel, so load it only on use.
  const { getFluxIQWorkspaces, getFluxIQWebRuntimeStatus } = await import("../fluxiq");
  const manager = getFluxIQWorkspaces();
  if (manager.tenancy === "single") {
    const lease = await manager.acquire(manager.primaryWorkspaceId);
    return { context: { fluxiq: lease.fluxiq, webRuntimeStatus: getFluxIQWebRuntimeStatus }, acceptBearer: true, release: lease.release };
  }
  const sessionId = sessionIdOf(source, FLUXIQ_SESSION_COOKIE);
  if (!sessionId) return null;
  const identityAuthority = manager.primary().fluxiq.programs.identityAccess;
  const workspaceId = await sessionWorkspaceId({
    sessionId,
    manager,
    platformServices: async () => (await import("../../server/provisioning-listener")).getPlatformServices()
  });
  if (!workspaceId) return null;
  const lease = await manager.acquire(workspaceId);
  // The existing presenter reads primary context, so service calls omit it
  // until a presenter scoped to this tenant exists.
  return { context: { fluxiq: lease.fluxiq, identityAuthority }, acceptBearer: false, release: lease.release };
}
