import { readBearerToken, type ProgramRouteContext } from "fluxiq/server";
import { FLUXIQ_SESSION_COOKIE } from "../session-cookie";
import { sessionIdOf, type WorkspaceRequestSource } from "./session-id-of";
import { sessionWorkspaceId } from "./session-workspace";

/**
 * The program handler's selected data instance and trusted identity authority,
 * held until the buffered response is written. Service selection freezes the
 * channel; a primary-owned identity never selects primary-owned customer data.
 * Single-root hosts retain their existing cookie and bearer precedence.
 */
export async function workspaceProgramContext(source: WorkspaceRequestSource): Promise<{
  context: ProgramRouteContext;
  acceptBearer: boolean;
  sessionId: string | undefined;
  authorization: string | null;
  release(): void;
} | null> {
  // The runtime imports the workspace barrel, so load it only on use.
  const { getFluxIQWorkspaces, getFluxIQWebRuntimeStatus } = await import("../fluxiq");
  const manager = getFluxIQWorkspaces();
  if (source.signal?.aborted) return null;
  const sessionId = sessionIdOf(source, FLUXIQ_SESSION_COOKIE) ?? undefined;
  const authorization = source.headers?.get("authorization") ?? null;
  if (manager.tenancy === "single") {
    const lease = await manager.acquire(manager.primaryWorkspaceId);
    return { context: { fluxiq: lease.fluxiq, webRuntimeStatus: getFluxIQWebRuntimeStatus }, acceptBearer: true, sessionId, authorization, release: lease.release };
  }
  const identityAuthority = manager.primary().fluxiq.programs.identityAccess;
  if (!sessionId) {
    const token = readBearerToken(authorization);
    if (!token) return null;
    const { resolveServiceClientHttpRoute } = await import("../../server/browser-trust");
    const selected = await resolveServiceClientHttpRoute(token);
    if (!selected) return null;
    if (source.signal?.aborted) {
      selected.lease.release();
      return null;
    }
    return {
      context: { fluxiq: selected.lease.fluxiq, identityAuthority, revalidateAuthority: async () => !source.signal?.aborted && await selected.revalidateAuthority() },
      acceptBearer: true, sessionId: undefined, authorization, release: selected.lease.release
    };
  }
  const auth = await identityAuthority.validateSession(sessionId);
  if (!auth) return null;
  const selectedWorkspaceId = () => sessionWorkspaceId({ sessionId, manager, platformServices: async () => (await import("../../server/provisioning-listener")).getPlatformServices() });
  const workspaceId = await selectedWorkspaceId();
  if (!workspaceId) return null;
  const revalidateAuthority = async () => {
    if (source.signal?.aborted) return false;
    const current = await identityAuthority.validateSession(sessionId);
    return current?.user.id === auth.user.id && await selectedWorkspaceId() === workspaceId;
  };
  const lease = await manager.acquire(workspaceId);
  let retained = false;
  try {
    if (lease.workspaceId !== workspaceId || !await revalidateAuthority()) return null;
    retained = true;
    // Service runtime presentation needs its own workspace-scoped owner.
    return { context: { fluxiq: lease.fluxiq, identityAuthority, revalidateAuthority }, acceptBearer: false, sessionId, authorization: null, release: lease.release };
  } finally {
    if (!retained) lease.release();
  }
}
