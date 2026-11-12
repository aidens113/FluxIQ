import type { AccountsResponse } from "./accounts-response";
import { refuseAccounts } from "./refuse-accounts";

/** The largest body an accounts route reads: an email, a name, a role and the proof fit many times over. */
const MAX_BODY_BYTES = 8 * 1024;

const MALFORMED = refuseAccounts(400, "bad_request", "That request could not be read. Reload and try again.");

/**
 * The JSON object a POST carries, or the refusal for one that is too large
 * (413), malformed or not an object (400). The body is never echoed back.
 */
export async function readAccountsBody(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; refusal: AccountsResponse }> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  const tooLarge = { ok: false as const, refusal: refuseAccounts(413, "too_large", "That request is too large.") };
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return tooLarge;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return tooLarge;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, refusal: MALFORMED };
    throw error;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false, refusal: MALFORMED };
  return { ok: true, body: value as Record<string, unknown> };
}
