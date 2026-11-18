import type { NextResponse } from "next/server";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { FLUXIQ_SESSION_COOKIE, sessionCookieOptions } from "../../../../lib/session-cookie";
import { CREDENTIAL_SETUP_PENDING_COOKIE } from "../credential-setup-rules";

const secure = resolveFluxIQDeploymentSettings(process.env).session.secure;
const TOKEN_COOKIE = "fluxiq_credential_setup";
/** The token goes only to the auth routes, never to a page or another API. */
const TOKEN_PATH = "/api/auth";

/**
 * The setup cookies: the HttpOnly token that `/api/auth/credential-setup`
 * spends, and the readable marker that keeps the sign-in form on the setup
 * form. Both are SameSite=Strict, so no other site's request carries them.
 */
export const credentialSetupCookies = {
  token: TOKEN_COOKIE,
  pending: CREDENTIAL_SETUP_PENDING_COOKIE,

  /** Sets the setup cookies and clears any panel session cookie, so the browser holds setup only. */
  begin(response: NextResponse, token: string, maxAgeSeconds: number): NextResponse {
    response.cookies.set(TOKEN_COOKIE, token, { httpOnly: true, sameSite: "strict", secure, path: TOKEN_PATH, maxAge: maxAgeSeconds });
    response.cookies.set(CREDENTIAL_SETUP_PENDING_COOKIE, "1", { httpOnly: false, sameSite: "strict", secure, path: "/", maxAge: maxAgeSeconds });
    response.cookies.set(FLUXIQ_SESSION_COOKIE, "", { ...sessionCookieOptions(0), expires: new Date(0) });
    return response;
  },

  clear(response: NextResponse): NextResponse {
    response.cookies.set(TOKEN_COOKIE, "", { httpOnly: true, sameSite: "strict", secure, path: TOKEN_PATH, maxAge: 0, expires: new Date(0) });
    response.cookies.set(CREDENTIAL_SETUP_PENDING_COOKIE, "", { httpOnly: false, sameSite: "strict", secure, path: "/", maxAge: 0, expires: new Date(0) });
    return response;
  }
};
