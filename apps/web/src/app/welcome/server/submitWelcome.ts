import { DEFAULT_SESSION_TTL_MS } from "fluxiq";
import type { AccountLinkResponse } from "./accountLinkResponse";
import { readTokenAndPassword } from "./readTokenAndPassword";
import { refuse } from "./refuse";
import type { WelcomeDeps } from "./WelcomeDeps";

/**
 * Redeems a welcome link and signs the person in: sets the password, mints a
 * session, restores the account's saved keys in its workspace (best effort: a
 * failure there never ends the sign-in) and records the sign-in. Answers a code
 * only on refusal, and never the token or the password.
 */
export async function submitWelcome(request: Request, deps: WelcomeDeps): Promise<AccountLinkResponse> {
  const read = await readTokenAndPassword(request);
  if (!read.ok) return read.response;
  const input = read.value;
  const redeemed = await deps.links.redeemWelcome(input);
  if (!redeemed.ok) return refuse(redeemed.code === "disabled" || redeemed.code === "two_factor" ? 403 : 400, redeemed.code);
  const { userId, continueUrl } = redeemed.redemption;
  const session = await deps.identityAccess.createSession(userId, DEFAULT_SESSION_TTL_MS);
  try {
    await deps.restoreKeys({ sessionId: session.id, userId, authorizationPassword: input.password, expiresAtMs: session.expiresAtMs });
  } catch {
    // Best effort and in the session's own workspace: a saved-key recovery problem is reported by key availability and never ends the sign-in.
    console.warn("Saved model keys could not be migrated after the welcome sign-in; inspect key availability and host protection.");
  }
  await deps.provisioning.recordSignIn(userId);
  return { status: 200, body: { ok: true, continueUrl: continueUrl ?? "/" }, session: { id: session.id, ttlMs: DEFAULT_SESSION_TTL_MS } };
}
