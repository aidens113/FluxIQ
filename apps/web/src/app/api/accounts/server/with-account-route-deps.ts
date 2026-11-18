import { cookies } from "next/headers";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { panelRouteActor } from "../../../../lib/app-route-iam";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ, getFluxIQWorkspaces } from "../../../../lib/fluxiq";
import { workspaceFluxIQ, type WorkspaceLease } from "../../../../lib/workspaces";
import type { AccountsResponse } from "./accounts-response";
import { refuseAccounts } from "./refuse-accounts";
import type { AccountPlatform, AccountRouteDeps } from "./route-deps";

const SIGN_IN_AGAIN = refuseAccounts(401, "unauthenticated", "Sign in again.");

/**
 * Runs one `/api/accounts` change with its dependencies for this request, and
 * releases the caller's workspace when it is done, on every path.
 *
 * Two scopes, on purpose:
 *
 * - platform (the identity directory, on the primary instance under every
 *   tenancy): who the caller is (`requireFluxIQUser`), the people list and
 *   the credential re-proof (`identityAccess`), and the platform's
 *   provisioning service and store, which every workspace's memberships live in;
 * - workspace: the instance of the workspace the caller's session works in,
 *   held by `workspaceFluxIQ` (never one named by the request), whose
 *   registry decides and audits the call by that workspace's policies, and
 *   whose id every change is made in.
 *
 * Under `single` tenancy (local, self-hosted) the held workspace is the
 * primary instance, so nothing changes there. A caller without a live
 * session, or (under `multi`) whose account belongs to no workspace, is 401.
 * The cross-site guard has already run in the middleware.
 */
export async function withAccountRouteDeps(work: (deps: AccountRouteDeps) => Promise<AccountsResponse>): Promise<AccountsResponse> {
  const auth = await requireFluxIQUser();
  if (!auth) return SIGN_IN_AGAIN;
  const lease = await workspaceFluxIQ({ cookies: await cookies() });
  if (!lease) return SIGN_IN_AGAIN;
  try {
    const deps: AccountRouteDeps = {
      actor: { ...panelRouteActor(auth), userId: auth.user.id },
      sessionId: auth.session.id,
      authorizer: lease.fluxiq.programs.api,
      identityAccess: getFluxIQ().programs.identityAccess,
      profile: resolveFluxIQDeploymentSettings(process.env).profile,
      platform: () => accountPlatform(lease)
    };
    return await work(deps);
  } finally {
    lease.release();
  }
}

/** The platform services (loaded on first use, so a refused call never opens them), in the held workspace. */
async function accountPlatform(lease: WorkspaceLease): Promise<AccountPlatform> {
  const { getPlatformServices } = await import("../../../../server/provisioning-listener");
  const services = await getPlatformServices();
  return { provisioning: services.provisioning, store: services.store, workspaceId: lease.workspaceId, tenancy: getFluxIQWorkspaces().tenancy };
}
