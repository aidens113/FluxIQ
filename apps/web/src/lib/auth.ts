import { cookies } from "next/headers";
import { getFluxIQ } from "./fluxiq";
import { FLUXIQ_SESSION_COOKIE } from "./session-cookie";

export { FLUXIQ_SESSION_COOKIE };

export async function currentFluxIQUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const fluxiq = getFluxIQ();
  const auth = await fluxiq.programs.identityAccess.validateSession(sessionId);
  if (auth) await presentPanelSession(fluxiq, sessionId, auth);
  return auth;
}

/**
 * A signed-in person spoke, and their cookie is what opens their stored unlock, so
 * it survives a Core restart with no password. Cheap once held. Never fails what
 * they asked for: a key that stays locked says so itself.
 */
export async function presentPanelSession(fluxiq: ReturnType<typeof getFluxIQ>, sessionId: string, auth: { user: { id: string }; session: { expiresAtMs: number } }): Promise<void> {
  try {
    await fluxiq.programs.secretKeys.credentialUnlocks.presentPanelSession({ sessionId, userId: auth.user.id, expiresAtMs: auth.session.expiresAtMs });
  } catch (error) {
    // A key that stays locked says so itself; whatever they asked for goes on. The name only: a store's message could quote what it was reading.
    console.warn(`A stored unlock could not be opened (${error instanceof Error ? error.name : "non_error"}).`);
  }
}

export async function requireFluxIQUser() {
  const auth = await currentFluxIQUser();
  if (!auth) return null;
  return auth;
}
