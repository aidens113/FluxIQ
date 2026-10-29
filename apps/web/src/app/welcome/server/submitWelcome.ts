import { DEFAULT_SESSION_TTL_MS } from "fluxiq";
import type { AccountLinkResponse } from "./accountLinkResponse";
import { readTokenAndPassword } from "./readTokenAndPassword";
import { refuse } from "./refuse";
import type { WelcomeDeps } from "./WelcomeDeps";

/**
 * Redeems a welcome link and signs the person in: sets the password, mints a
 * session, unlocks the account's keys for it (the session is revoked if that
 * fails, as the sign-in route does) and records the sign-in. Answers a code
 * only on refusal, and never the token or the password.
 */
export async function submitWelcome(request: Request, deps: WelcomeDeps): Promise<AccountLinkResponse> {
  const input = await readTokenAndPassword(request);
  if ("status" in input) return input;
  const redeemed = await deps.links.redeemWelcome(input);
  if (!redeemed.ok) return refuse(redeemed.code === "disabled" || redeemed.code === "two_factor" ? 403 : 400, redeemed.code);
  const { userId, continueUrl } = redeemed.redemption;
  const session = await deps.identityAccess.createSession(userId, DEFAULT_SESSION_TTL_MS);
  try {
    await deps.secretKeys.unlockSession({ sessionId: session.id, userId, authorizationPassword: input.password, expiresAtMs: session.expiresAtMs });
  } catch {
    await deps.identityAccess.revokeSession(session.id);
    // The password is set and the link is spent: the person can sign in at "/".
    return refuse(500, "sign_in_failed");
  }
  await deps.provisioning.recordSignIn(userId);
  return { status: 200, body: { ok: true, continueUrl: continueUrl ?? "/" }, session: { id: session.id, ttlMs: DEFAULT_SESSION_TTL_MS } };
}
