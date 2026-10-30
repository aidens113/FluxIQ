import { NextResponse } from "next/server";
import { FLUXIQ_SESSION_COOKIE, sessionCookieOptions } from "../../../lib/session-cookie";
import type { SetupResponse } from "./SetupResponse";

/** The HTTP response for the setup submit's answer: never cached, with the session cookie when the owner was signed in. */
export function toSetupHttp(answer: SetupResponse): NextResponse {
  const response = NextResponse.json(answer.body, { status: answer.status, headers: { "cache-control": "no-store", ...answer.headers } });
  if (answer.session) response.cookies.set(FLUXIQ_SESSION_COOKIE, answer.session.id, sessionCookieOptions(Math.floor(answer.session.ttlMs / 1000)));
  return response;
}
