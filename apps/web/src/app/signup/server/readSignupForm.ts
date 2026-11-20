import type { AccountLinkResponse } from "../../welcome/server";
import { isCrossSiteRequest, refuse } from "../../welcome/server";
import type { SignupForm } from "./SignupForm";
import { SIGNUP_TERMS_VERSION } from "./signupTermsVersion";

/** The largest body the sign-up route reads, as for the other account forms. */
const MAX_BODY_BYTES = 8 * 1024;

export type SignupFormRead = { ok: true; form: SignupForm } | { ok: false; response: AccountLinkResponse };

/**
 * Reads the sign-up post: same-site only (the panel's one cross-site rule,
 * as for the welcome and setup posts), a JSON object of at most 8 KiB with
 * string `email`, `displayName` and `termsVersion`, the version being the
 * current terms (`terms_changed` when the page showed older ones). The answer
 * is a discriminated union, so a posted field can never be taken for a
 * refusal.
 */
export async function readSignupForm(request: Request): Promise<SignupFormRead> {
  if (isCrossSiteRequest(request)) return refused(403, "forbidden");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return refused(413, "too_large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return refused(413, "too_large");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return refused(400, "bad_request");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return refused(400, "bad_request");
  const { email, displayName, termsVersion } = body as Record<string, unknown>;
  if (typeof email !== "string" || typeof displayName !== "string" || typeof termsVersion !== "string") return refused(400, "bad_request");
  if (termsVersion !== SIGNUP_TERMS_VERSION) return refused(409, "terms_changed");
  return { ok: true, form: { email, displayName, termsVersion } };
}

function refused(status: number, code: string): SignupFormRead {
  return { ok: false, response: refuse(status, code) };
}
