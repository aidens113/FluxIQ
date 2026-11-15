import { cookies } from "next/headers";
import { getFluxIQAfterReload, getFluxIQWorkspaces } from "../../lib/fluxiq";
import { FLUXIQ_SESSION_COOKIE } from "../../lib/session-cookie";
import { sessionWorkspaceId } from "../../lib/workspaces";

/** A person's own default workspace; neither bearer headers nor payload ids select the owner. */
export async function keyManagementContext(): Promise<{ userId: string; workspaceId: string } | null> {
  const sessionId = (await cookies()).get(FLUXIQ_SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const primary = await getFluxIQAfterReload();
  const auth = await primary.programs.identityAccess.validateSession(sessionId);
  if (!auth) return null;
  const workspaceId = await sessionWorkspaceId({
    sessionId,
    manager: getFluxIQWorkspaces(),
    platformServices: async () => (await import("../provisioning-listener")).getPlatformServices()
  });
  return workspaceId ? { userId: auth.user.id, workspaceId } : null;
}
