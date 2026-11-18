import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DEFAULT_SESSION_TTL_MS } from "fluxiq";
import { getFluxIQ } from "../../../../lib/fluxiq";
import { FLUXIQ_SESSION_COOKIE, sessionCookieOptions } from "../../../../lib/session-cookie";
import { restoreLoginKeys } from "../../../../server/connect";
import { isCrossSiteRequest } from "../../../welcome/server";
import { replacementPasswordError } from "../credential-setup-rules";
import { credentialSetupCookies, credentialSetupGrants, isLoopbackRequest, replaceTemporaryCredential } from "../temporary-credential";

const NO_STORE = { "cache-control": "no-store" };

function refuse(status: number, code: string, error: string): NextResponse {
  return NextResponse.json({ ok: false, code, error }, { status, headers: NO_STORE });
}

/**
 * `POST /api/auth/credential-setup`: the only thing the temporary credential
 * can do. The browser's setup cookie (from signing in with it) and a new
 * password replace the temporary password, and the same person is signed in
 * with a normal session at once. Same-site and loopback only, as the sign-in
 * that issued the cookie was. No answer or log line carries a password.
 */
export async function POST(request: Request) {
  if (isCrossSiteRequest(request)) return refuse(403, "cross_site_request", "Finish setup from the FluxIQ panel itself.");
  if (!isLoopbackRequest(request)) return refuse(403, "setup_on_this_computer", "Finish first setup on the computer running FluxIQ, at http://127.0.0.1.");
  const grant = credentialSetupGrants.find((await cookies()).get(credentialSetupCookies.token)?.value);
  if (!grant) {
    return credentialSetupCookies.clear(refuse(401, "setup_expired", "Setup timed out. Sign in with the temporary password again to choose your password."));
  }

  let payload: { password?: unknown; confirmation?: unknown } | null;
  try {
    payload = (await request.json()) as { password?: unknown; confirmation?: unknown } | null;
  } catch {
    return refuse(400, "bad_request", "Send the new password and its confirmation as JSON.");
  }
  const password = typeof payload?.password === "string" ? payload.password : "";
  const confirmation = typeof payload?.confirmation === "string" ? payload.confirmation : "";
  const invalid = replacementPasswordError(password, confirmation);
  if (invalid) return refuse(400, "invalid_password", invalid);

  const fluxiq = getFluxIQ();
  const identity = fluxiq.programs.identityAccess;
  let outcome;
  try {
    outcome = await replaceTemporaryCredential(identity, grant, password);
  } catch (error) {
    return refuse(400, "password_refused", error instanceof Error ? error.message : "The new password was refused.");
  }
  credentialSetupGrants.forget(grant.userId);
  if (outcome === "already_replaced") {
    return credentialSetupCookies.clear(refuse(409, "already_replaced", "The temporary password was already replaced. Sign in with the new password."));
  }

  const signedIn = await identity.authenticate({ username: grant.username, password, ttlMs: DEFAULT_SESSION_TTL_MS });
  try {
    await restoreLoginKeys(fluxiq, { sessionId: signedIn.session.id, userId: signedIn.user.id, authorizationPassword: password, expiresAtMs: signedIn.session.expiresAtMs });
  } catch {
    // As the sign-in route: the password is replaced; a saved-key recovery problem is reported by key availability.
    console.warn("Saved model keys could not be migrated after first setup; inspect key availability and host protection.");
  }
  const response = NextResponse.json(
    { ok: true, payload: { user: signedIn.user, role: signedIn.role, expiresAtMs: signedIn.session.expiresAtMs } },
    { headers: NO_STORE }
  );
  response.cookies.set(FLUXIQ_SESSION_COOKIE, signedIn.session.id, sessionCookieOptions(Math.floor(DEFAULT_SESSION_TTL_MS / 1000)));
  return credentialSetupCookies.clear(response);
}
