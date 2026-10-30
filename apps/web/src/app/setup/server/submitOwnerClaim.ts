import { DEFAULT_SESSION_TTL_MS } from "fluxiq";
import { resolveClientAddress } from "fluxiq/platform/profile";
import { claimOwner, isOwnerClaimOpen, readSetupCode, setupCodeMatches, type OwnerClaimOutcome } from "../../../server/owner-claim";
import { readSetupForm } from "./readSetupForm";
import type { SetupDeps } from "./SetupDeps";
import type { SetupResponse } from "./SetupResponse";

const GLOBAL_KEY = "setup";
// The placeholder for a proxied request that forwards no address, as the sign-in route uses.
const UNKNOWN_PROXIED_ADDRESS = "proxy-unknown";

function refuse(status: number, code: string, fields?: string[]): SetupResponse {
  return { status, body: fields === undefined ? { ok: false, code } : { ok: false, code, fields } };
}

/**
 * `/setup/submit`: claims a public instance for its owner with the one-time
 * setup code, then signs the owner in.
 *
 * Not found on `local` and once claimed, before the body is read. Then the
 * form, the throttle (wrong codes only: about 10 per 10 minutes for the whole
 * instance, and 5 per client address behind a trusted proxy), the code by
 * digest, the confirmation, the claim (`claimOwner`), and the sign-in: a
 * session, the account's keys unlocked for it (the session is revoked if that
 * fails, as the sign-in route does) and the sign-in recorded. No answer or
 * log line carries the code or the password.
 */
export async function submitOwnerClaim(request: Request, deps: SetupDeps): Promise<SetupResponse> {
  if (!(await isOwnerClaimOpen(deps.settings, deps.fluxiqDir))) return refuse(404, "not_found");
  const read = await readSetupForm(request);
  if (!read.ok) return read.response;
  const { form } = read;

  const addressKey = deps.settings.trustProxy
    ? (resolveClientAddress({ peerAddress: null, forwardedFor: request.headers.get("x-forwarded-for"), trustProxy: true }).address ?? UNKNOWN_PROXIED_ADDRESS)
    : null;
  const locked = Math.max(await deps.attempts.global.remainingLockout(GLOBAL_KEY), addressKey === null ? 0 : await deps.attempts.address.remainingLockout(addressKey));
  if (locked > 0) {
    const seconds = Math.ceil(locked / 1000);
    return { status: 429, body: { ok: false, code: "rate_limited", retryAfterMs: locked }, headers: { "retry-after": String(seconds) } };
  }

  const expected = await readSetupCode(deps.settings, deps.fluxiqDir);
  if (expected === null) return refuse(503, "setup_unavailable");
  if (!setupCodeMatches(form.code, expected)) {
    await deps.attempts.global.registerFailure(GLOBAL_KEY);
    if (addressKey !== null) await deps.attempts.address.registerFailure(addressKey);
    (deps.log ?? console.info)("FluxIQ setup: a wrong setup code was refused.");
    return refuse(401, "invalid_code");
  }
  if (form.password !== form.confirmation) return refuse(400, "password_mismatch", ["confirmation"]);

  const claimed = await claimOwner({ username: form.username, displayName: form.displayName, password: form.password }, deps);
  if (!claimed.ok) return claimRefusal(claimed);
  return signIn(claimed.userId, form.username, form.password, deps);
}

function claimRefusal(outcome: Extract<OwnerClaimOutcome, { ok: false }>): SetupResponse {
  switch (outcome.code) {
    case "already_claimed": return refuse(404, "not_found");
    case "invalid_input": return refuse(400, "invalid_input", outcome.fields ?? []);
    case "weak_password": return refuse(422, "weak_password", ["password"]);
    case "username_taken": return refuse(409, "username_taken", ["username"]);
    case "claim_incomplete": return refuse(409, "claim_incomplete");
    default: return refuse(500, "claim_failed");
  }
}

async function signIn(userId: string, username: string, password: string, deps: SetupDeps): Promise<SetupResponse> {
  try {
    const signedIn = await deps.identityAccess.authenticate({ username, password, ttlMs: DEFAULT_SESSION_TTL_MS });
    try {
      await deps.secretKeys.unlockSession({ sessionId: signedIn.session.id, userId, authorizationPassword: password, expiresAtMs: signedIn.session.expiresAtMs });
    } catch (error) {
      await deps.identityAccess.revokeSession(signedIn.session.id);
      throw error;
    }
    await deps.provisioning.recordSignIn(userId);
    return { status: 200, body: { ok: true, redirectTo: "/" }, session: { id: signedIn.session.id, ttlMs: DEFAULT_SESSION_TTL_MS } };
  } catch {
    // The instance is claimed: the owner signs in at "/" with the new password.
    return refuse(500, "sign_in_failed");
  }
}
