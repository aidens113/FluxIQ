import { NextResponse } from "next/server";
import { FLUXIQ_SESSION_COOKIE } from "../../../lib/auth";
import type { AccountLinkResponse } from "./accountLinkResponse";
import { sessionCookieOptions } from "./sessionCookieOptions";

/** The HTTP response for a handler's answer: never cached, with the session cookie when one was made. */
export function toAccountLinkHttp(answer: AccountLinkResponse): NextResponse {
  const response = NextResponse.json(answer.body, { status: answer.status, headers: { "cache-control": "no-store" } });
  if (answer.session) response.cookies.set(FLUXIQ_SESSION_COOKIE, answer.session.id, sessionCookieOptions());
  return response;
}
