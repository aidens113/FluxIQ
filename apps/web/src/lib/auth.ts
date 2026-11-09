import { cookies } from "next/headers";
import { presentPanelSession } from "fluxiq/server";
import { getFluxIQ } from "./fluxiq";
import { FLUXIQ_SESSION_COOKIE } from "./session-cookie";

export { FLUXIQ_SESSION_COOKIE };

export async function currentFluxIQUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const fluxiq = getFluxIQ();
  const auth = await fluxiq.programs.identityAccess.validateSession(sessionId);
  // A signed-in person's cookie opens their stored unlock (Core's `presentPanelSession`, which the program route calls too).
  if (auth) await presentPanelSession(fluxiq, sessionId, auth);
  return auth;
}

export async function requireFluxIQUser() {
  const auth = await currentFluxIQUser();
  if (!auth) return null;
  return auth;
}
