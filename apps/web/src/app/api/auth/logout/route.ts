import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FLUXIQ_SESSION_COOKIE, sessionCookieOptions } from "../../../../lib/session-cookie";
import { platformScope } from "../../../../lib/platform";
import { credentialSetupCookies, credentialSetupGrants } from "../temporary-credential";

// Signing out revokes the cookie's session. Identity Access announces the
// revoke as that session's own user, and the runtime's subscriber drops the
// session's Secret Keys unlock with it; an unknown cookie vouches for no one,
// so it locks nobody's keys. Signing out of first setup drops its grant, so
// the browser is back on the sign-in form.
export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value;
  if (sessionId) {
    await platformScope().identityAccess.revokeSession(sessionId);
  }
  const setupGrant = credentialSetupGrants.find(cookieStore.get(credentialSetupCookies.token)?.value);
  if (setupGrant) credentialSetupGrants.forget(setupGrant.userId);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(FLUXIQ_SESSION_COOKIE, "", { ...sessionCookieOptions(0), expires: new Date(0) });
  return credentialSetupCookies.clear(response);
}
