import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FLUXIQ_SESSION_COOKIE } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";

export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value;
  if (sessionId) {
    const fluxiq = getFluxIQ();
    fluxiq.programs.llmExecutionGrants.revokeForSession(sessionId);
    fluxiq.programs.secretKeys.revokeSessionUnlock(sessionId);
    await fluxiq.programs.identityAccess.revokeSession(sessionId);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(FLUXIQ_SESSION_COOKIE);
  return response;
}

