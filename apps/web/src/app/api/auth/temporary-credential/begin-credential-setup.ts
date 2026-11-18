import { NextResponse } from "next/server";
import type { IdentityAccessService } from "fluxiq";
import { credentialSetupCookies } from "./credential-setup-cookies";
import { credentialSetupGrants } from "./credential-setup-grants";
import { isLoopbackRequest } from "./is-loopback-request";

type SignedIn = Awaited<ReturnType<IdentityAccessService["authenticate"]>>;

/**
 * The sign-in route's answer to the temporary credential. Identity access has
 * just minted a session for it; that session and every other one of the
 * account's (one left from before this rule included) are revoked before the
 * answer, so the credential everyone knows holds no panel session the browser
 * could use. The browser gets a setup grant instead, and only when it
 * addressed this computer by a loopback name.
 */
export async function beginCredentialSetup(
  request: Request,
  signedIn: SignedIn,
  identity: Pick<IdentityAccessService, "revokeUserSessions">
): Promise<NextResponse> {
  await identity.revokeUserSessions(signedIn.user.id);
  if (!isLoopbackRequest(request)) {
    return NextResponse.json(
      { ok: false, code: "setup_on_this_computer", error: "Finish first setup on the computer running FluxIQ, at http://127.0.0.1." },
      { status: 403, headers: { "cache-control": "no-store" } }
    );
  }
  const grant = credentialSetupGrants.issue({ userId: signedIn.user.id, username: signedIn.user.username });
  const response = NextResponse.json(
    {
      ok: true,
      payload: {
        user: { id: signedIn.user.id, username: signedIn.user.username, displayName: signedIn.user.displayName },
        requiresCredentialSetup: true,
        setupExpiresAtMs: grant.expiresAtMs
      }
    },
    { headers: { "cache-control": "no-store" } }
  );
  return credentialSetupCookies.begin(response, grant.token, Math.floor(credentialSetupGrants.ttlMs / 1000));
}
