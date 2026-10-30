import { cookies } from "next/headers";
import { getFluxIQ } from "./fluxiq";
import { FLUXIQ_SESSION_COOKIE } from "./session-cookie";

export { FLUXIQ_SESSION_COOKIE };

export async function currentFluxIQUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  return getFluxIQ().programs.identityAccess.validateSession(sessionId);
}

export async function requireFluxIQUser() {
  const auth = await currentFluxIQUser();
  if (!auth) return null;
  return auth;
}
