import { FLUXIQ_SESSION_COOKIE } from "../session-cookie";
import { sessionIdOf } from "./session-id-of";
import { sessionWorkspaceId } from "./session-workspace";
import type { WorkspaceLease } from "./WorkspaceEntry";
import type { WorkspaceRequestSource } from "./session-id-of";

/**
 * The FluxIQ instance of the workspace the caller's panel session works in,
 * held for this caller, or null when the request carries no live session.
 * Release the lease when the request is done; until then the workspace is not
 * evicted. Under `single` it is always the primary instance, as `getFluxIQ()`
 * returns.
 */
export async function workspaceFluxIQ(source: WorkspaceRequestSource): Promise<WorkspaceLease | null> {
  const sessionId = sessionIdOf(source, FLUXIQ_SESSION_COOKIE);
  if (!sessionId) return null;
  // Both are imported on use: `lib/fluxiq` imports this directory, and the
  // provisioning listener imports `lib/fluxiq`, so static imports would close
  // a module cycle.
  const { getFluxIQWorkspaces } = await import("../fluxiq");
  const manager = getFluxIQWorkspaces();
  const workspaceId = await sessionWorkspaceId({
    sessionId,
    manager,
    platformServices: async () => (await import("../../server/provisioning-listener")).getPlatformServices()
  });
  if (!workspaceId) return null;
  return await manager.acquire(workspaceId);
}
