import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FLUXIQ_SESSION_COOKIE } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";

// Signing out revokes the cookie's session. Identity Access announces the
// revoke as that session's own user, and the runtime's subscriber drops the
// session's Secret Keys unlock with it; an unknown cookie vouches for no one,
// so it locks nobody's keys.
export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value;
  if (sessionId) {
    await getFluxIQ().programs.identityAccess.revokeSession(sessionId);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(FLUXIQ_SESSION_COOKIE);
  return response;
}
