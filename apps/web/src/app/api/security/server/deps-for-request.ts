import { panelRouteActor } from "../../../../lib/app-route-iam";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ, getFluxIQWorkspaces } from "../../../../lib/fluxiq";
import { sessionWorkspaceId } from "../../../../lib/workspaces";
import { refuseAccounts, type AccountsResponse } from "../../accounts/server";
import { platformAuditReader } from "./platform-audit-reader";
import type { ActivitySource, AuditRouteDeps } from "./types";

/**
 * The audit route's dependencies for one request: the signed-in caller from
 * the panel cookie (401 without one; a paired client's token is not a
 * caller here) and the registry that decides. The caller's workspace, the
 * audit and the names are resolved only once the call is allowed.
 */
export async function auditRouteDepsForRequest(): Promise<AuditRouteDeps | AccountsResponse> {
  const auth = await requireFluxIQUser();
  if (!auth) return refuseAccounts(401, "unauthenticated", "Sign in again.");
  const fluxiq = getFluxIQ();
  return { actor: panelRouteActor(auth), authorizer: fluxiq.programs.api, activity: () => activitySource(auth.session.id) };
}

/** The session's workspace (from the server, never the request), the audit, and the names of this workspace's people. */
async function activitySource(sessionId: string): Promise<ActivitySource> {
  const { getPlatformServices } = await import("../../../../server/provisioning-listener");
  const manager = getFluxIQWorkspaces();
  const services = await getPlatformServices();
  const workspaceId = await sessionWorkspaceId({ sessionId, manager, platformServices: async () => services });
  if (workspaceId === null) throw new Error("activity: the session has no workspace");
  const tenancy = manager.tenancy;
  const identityAccess = getFluxIQ().programs.identityAccess;
  return {
    workspaceId,
    tenancy,
    audit: await platformAuditReader(),
    nameOf: async (userId) => {
      if ((await services.store.getMembership(workspaceId, userId)) !== null) {
        const account = await services.store.getAccount(userId);
        if (account !== null) return account.displayName || account.email;
      }
      if (tenancy !== "single") return null;
      const user = (await identityAccess.snapshot()).users.find((candidate) => candidate.id === userId);
      return user?.displayName ?? null;
    }
  };
}
