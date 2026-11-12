import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { panelRouteActor } from "../../../../lib/app-route-iam";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ, getFluxIQWorkspaces } from "../../../../lib/fluxiq";
import { sessionWorkspaceId } from "../../../../lib/workspaces";
import type { AccountsResponse } from "./accounts-response";
import { refuseAccounts } from "./refuse-accounts";
import type { AccountPlatform, AccountRouteDeps } from "./route-deps";

/**
 * The handlers' dependencies for one request: the signed-in caller from the
 * panel cookie (a 401 without one) and the registry that decides; the platform
 * services and the caller's workspace are resolved only once the call is
 * allowed. The cross-site guard has already run in the middleware.
 */
export async function accountRouteDepsForRequest(): Promise<AccountRouteDeps | AccountsResponse> {
  const auth = await requireFluxIQUser();
  if (!auth) return refuseAccounts(401, "unauthenticated", "Sign in again.");
  const fluxiq = getFluxIQ();
  return {
    actor: { ...panelRouteActor(auth), userId: auth.user.id },
    sessionId: auth.session.id,
    authorizer: fluxiq.programs.api,
    identityAccess: fluxiq.programs.identityAccess,
    profile: resolveFluxIQDeploymentSettings(process.env).profile,
    platform: () => accountPlatform(auth.session.id)
  };
}

/** The platform services (loaded on first use, so a refused call never opens them) and the session's workspace. */
async function accountPlatform(sessionId: string): Promise<AccountPlatform> {
  const { getPlatformServices } = await import("../../../../server/provisioning-listener");
  const manager = getFluxIQWorkspaces();
  const services = await getPlatformServices();
  const workspaceId = await sessionWorkspaceId({ sessionId, manager, platformServices: async () => services });
  if (workspaceId === null) throw new Error("accounts: the session has no workspace");
  return { provisioning: services.provisioning, store: services.store, workspaceId, tenancy: manager.tenancy };
}
