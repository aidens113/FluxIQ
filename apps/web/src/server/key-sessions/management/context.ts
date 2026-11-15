import { cookies } from "next/headers";
import { getFluxIQAfterReload, getFluxIQWorkspaces } from "../../../lib/fluxiq";
import { FLUXIQ_SESSION_COOKIE } from "../../../lib/session-cookie";
import { sessionWorkspaceId } from "../../../lib/workspaces";
import { appRouteIamContract, authorizeAppRoute, panelRouteActor } from "../../../lib/app-route-iam";
import { KeyManagementRefusal } from "./refusal";

/** A person's own default workspace; neither bearer headers nor payload ids select the owner. */
export async function keyManagementContext(method: "GET" | "POST" | "DELETE" = "GET"): Promise<{ userId: string; workspaceId: string } | null> {
  const sessionId = (await cookies()).get(FLUXIQ_SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const primary = await getFluxIQAfterReload();
  const auth = await primary.programs.identityAccess.validateSession(sessionId);
  if (!auth) return null;
  const workspaceId = await sessionWorkspaceId({
    sessionId,
    manager: getFluxIQWorkspaces(),
    platformServices: async () => (await import("../../provisioning-listener")).getPlatformServices()
  });
  if (!workspaceId) return null;
  const lease = await getFluxIQWorkspaces().acquire(workspaceId);
  try {
    const currentAuth = await primary.programs.identityAccess.validateSession(sessionId);
    const currentWorkspaceId = await sessionWorkspaceId({
      sessionId, manager: getFluxIQWorkspaces(),
      platformServices: async () => (await import("../../provisioning-listener")).getPlatformServices()
    });
    if (!currentAuth || currentAuth.user.id !== auth.user.id || currentWorkspaceId !== workspaceId) return null;
    const refusal = await authorizeAppRoute(lease.fluxiq.programs.api, appRouteIamContract(method, "/api/keys"), "panel", panelRouteActor(currentAuth));
    if (refusal) throw new KeyManagementRefusal();
    return { userId: auth.user.id, workspaceId };
  } finally {
    lease.release();
  }
}
