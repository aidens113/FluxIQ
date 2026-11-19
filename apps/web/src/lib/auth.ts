import { cookies } from "next/headers";
import { platformScope, presentSingleTenantPanelSession } from "./platform";
import { FLUXIQ_SESSION_COOKIE } from "./session-cookie";

export { FLUXIQ_SESSION_COOKIE };

export async function currentFluxIQUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const auth = await platformScope().identityAccess.validateSession(sessionId);
  // Single tenancy only: the primary is the person's workspace there. Multi tenancy presents in the session's own workspace.
  if (auth) await presentSingleTenantPanelSession(sessionId, auth);
  return auth;
}

export async function requireFluxIQUser() {
  const auth = await currentFluxIQUser();
  if (!auth) return null;
  return auth;
}
