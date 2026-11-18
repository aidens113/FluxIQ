import { DEFAULT_SESSION_TTL_MS } from "fluxiq";
import { claimLocalOwner, localSetupCode } from "../../../server/owner-claim";
import { replacementPasswordError } from "../../api/auth/credential-setup-rules";
import { isLoopbackRequest } from "../../api/auth/temporary-credential";
import type { LocalSetupDeps } from "./LocalSetupDeps";
import { readLocalSetupForm } from "./readLocalSetupForm";
import type { SetupResponse } from "./SetupResponse";

const GLOBAL_KEY = "setup-local";
/** A sign-in name: no spaces, at most 64 characters. Anything else (an email included) is the person's choice. */
const USERNAME = /^\S{1,64}$/u;

function refuse(status: number, code: string, fields?: string[]): SetupResponse {
  return { status, body: fields === undefined ? { ok: false, code } : { ok: false, code, fields } };
}

/**
 * `/setup/submit` on `local`: the person who opened the printed setup link
 * becomes the owner, with the name and password they chose, and is signed in.
 *
 * Not found once an owner exists, before the body is read. Then the form
 * (code from the body only), this computer only, the throttle on wrong codes
 * (about 10 per 10 minutes for the instance), the code (`none`: restart for a
 * link; `expired`; `wrong`), the name and password, the claim, the code spent,
 * and the sign-in. No answer or log line carries the code or the password.
 */
export async function submitLocalOwnerClaim(request: Request, deps: LocalSetupDeps): Promise<SetupResponse> {
  if ((await deps.identity.firstRun.state()) === "claimed") return refuse(404, "not_found");
  const read = await readLocalSetupForm(request);
  if (!read.ok) return read.response;
  if (!isLoopbackRequest(request)) return refuse(403, "setup_on_this_computer");
  const { form } = read;
  const nowMs = deps.nowMs?.() ?? Date.now();

  const locked = await deps.attempts.global.remainingLockout(GLOBAL_KEY);
  if (locked > 0) return { status: 429, body: { ok: false, code: "rate_limited", retryAfterMs: locked }, headers: { "retry-after": String(Math.ceil(locked / 1000)) } };
  const code = localSetupCode.check(form.code, nowMs);
  if (code === "none") return refuse(503, "setup_unavailable");
  if (code === "wrong") {
    await deps.attempts.global.registerFailure(GLOBAL_KEY);
    (deps.log ?? console.info)("FluxIQ setup: a wrong setup code was refused.");
    return refuse(401, "invalid_code");
  }
  if (code === "expired") return refuse(410, "setup_expired");

  if (!USERNAME.test(form.username)) return refuse(400, "invalid_input", ["username"]);
  const passwordProblem = replacementPasswordError(form.password, form.confirmation);
  if (passwordProblem !== "") {
    return form.password !== form.confirmation && form.password.length >= 12 ? refuse(400, "password_mismatch", ["confirmation"]) : refuse(422, "weak_password", ["password"]);
  }

  const claimed = await claimLocalOwner({ username: form.username, password: form.password }, deps.identity, deps.log);
  if (!claimed.ok) {
    if (claimed.code === "already_claimed") return refuse(404, "not_found");
    if (claimed.code === "username_taken") return refuse(409, "username_taken", ["username"]);
    return refuse(500, "claim_failed");
  }
  localSetupCode.spend();
  return signIn(claimed.userId, form.username, form.password, deps);
}

async function signIn(userId: string, username: string, password: string, deps: LocalSetupDeps): Promise<SetupResponse> {
  let signedIn: Awaited<ReturnType<LocalSetupDeps["identity"]["authenticate"]>>;
  try {
    signedIn = await deps.identity.authenticate({ username, password, ttlMs: DEFAULT_SESSION_TTL_MS });
  } catch {
    // The owner exists: they sign in at "/" with the new password.
    return refuse(500, "sign_in_failed");
  }
  try {
    await deps.restoreKeys({ sessionId: signedIn.session.id, userId, authorizationPassword: password, expiresAtMs: signedIn.session.expiresAtMs });
  } catch {
    // As the sign-in route: the owner is signed in; a saved-key problem is reported by key availability.
    console.warn("Saved model keys could not be unlocked after first setup; inspect key availability.");
  }
  return { status: 200, body: { ok: true, redirectTo: "/" }, session: { id: signedIn.session.id, ttlMs: DEFAULT_SESSION_TTL_MS } };
}
