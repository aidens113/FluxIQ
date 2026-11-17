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
  workspaceId: string;
  context: ProgramRouteContext;
  acceptBearer: boolean;
  sessionId: string | undefined;
  authorization: string | null;
  /** Synchronous primary-generation and abort check; the held lease prevents tenant eviction. */
  current(): boolean;
  release(): void;
} | null> {
  // The runtime imports the workspace barrel, so load it only on use.
  const { getFluxIQWorkspaces, getFluxIQWebRuntimeStatus, isCurrentFluxIQPrimary } = await import("../fluxiq");
  const manager = getFluxIQWorkspaces();
  if (source.signal?.aborted) return null;
  const sessionId = sessionIdOf(source, FLUXIQ_SESSION_COOKIE) ?? undefined;
  const authorization = source.headers?.get("authorization") ?? null;
  if (manager.tenancy === "single") {
    const lease = await manager.acquire(manager.primaryWorkspaceId);
    const current = () => !source.signal?.aborted && isCurrentFluxIQPrimary(lease.fluxiq);
    const revalidateAuthority = async () => current();
    if (!await revalidateAuthority()) {
      lease.release();
      return null;
    }
    const webRuntimeStatus = (operatorUserId: string) => {
      if (source.signal?.aborted || !isCurrentFluxIQPrimary(lease.fluxiq)) throw new Error("Workspace runtime is no longer current.");
      return getFluxIQWebRuntimeStatus(operatorUserId);
    };
    return { workspaceId: lease.workspaceId, context: { fluxiq: lease.fluxiq, webRuntimeStatus, revalidateAuthority }, acceptBearer: true, sessionId, authorization, current, release: lease.release };
  }
  const primary = manager.primary().fluxiq;
  const primaryCurrent = () => !source.signal?.aborted && isCurrentFluxIQPrimary(primary);
  if (!primaryCurrent()) return null;
  const identityAuthority = primary.programs.identityAccess;
  if (!sessionId) {
    const token = readBearerToken(authorization);
    if (!token) return null;
    const { resolveServiceClientHttpRoute } = await import("../../server/browser-trust");
    const selected = await resolveServiceClientHttpRoute(token);
    if (!selected) return null;
    if (!primaryCurrent()) {
      selected.lease.release();
      return null;
    }
    return {
      workspaceId: selected.lease.workspaceId,
      context: { fluxiq: selected.lease.fluxiq, identityAuthority, revalidateAuthority: async () => primaryCurrent() && await selected.revalidateAuthority() && primaryCurrent() },
      acceptBearer: true, sessionId: undefined, authorization, current: primaryCurrent, release: selected.lease.release
    };
  }
  const auth = await identityAuthority.validateSession(sessionId);
  if (!auth || !primaryCurrent()) return null;
  // Resolve before acquiring the tenant lease, then keep this exact identity
  // store. A guard must not wait for/reselect a replacement primary on reload.
  let platformServices: ReturnType<typeof import("../../server/provisioning-listener").getPlatformServices> | undefined;
  const selectedWorkspaceId = () => sessionWorkspaceId({ sessionId, manager, platformServices: () => platformServices ??= import("../../server/provisioning-listener").then(module => module.getPlatformServices()) });
  const workspaceId = await selectedWorkspaceId();
  if (!workspaceId || !primaryCurrent()) return null;
  const revalidateAuthority = async () => {
    if (!primaryCurrent()) return false;
    const current = await identityAuthority.validateSession(sessionId);
    return primaryCurrent() && current?.user.id === auth.user.id && await selectedWorkspaceId() === workspaceId && primaryCurrent();
  };
  const lease = await manager.acquire(workspaceId);
  let retained = false;
  try {
    if (lease.workspaceId !== workspaceId || !await revalidateAuthority()) return null;
    retained = true;
    // Service runtime presentation needs its own workspace-scoped owner.
    return { workspaceId: lease.workspaceId, context: { fluxiq: lease.fluxiq, identityAuthority, revalidateAuthority }, acceptBearer: false, sessionId, authorization: null, current: primaryCurrent, release: lease.release };
  } finally {
    if (!retained) lease.release();
  }
}
