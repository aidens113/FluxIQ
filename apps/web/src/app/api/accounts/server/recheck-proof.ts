import type { AccountRouteDeps } from "./route-deps";
import type { AccountsResponse } from "./accounts-response";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Re-proves the caller's own credentials on their panel session before a
 * change that moves authority, as Identity Access's `create-user` and a role
 * or enable change of `update-user` do: the password, plus the PIN and
 * authenticator code when the account has them. `proof` is the body's
 * `proof` object. Null when proved; otherwise a refusal with
 * `requiresRecheck`, whose words never repeat what was typed or why it failed.
 */
export async function recheckProof(deps: AccountRouteDeps, proof: unknown): Promise<AccountsResponse | null> {
  const fields = proof !== null && typeof proof === "object" && !Array.isArray(proof) ? (proof as Record<string, unknown>) : {};
  const password = text(fields.password);
  const refused: AccountsResponse = { status: 403, body: { ok: false, code: "recheck", error: "Type your password (and your PIN or authenticator code, if you use one) to confirm.", requiresRecheck: true } };
  if (password === undefined) return refused;
  try {
    await deps.identityAccess.authorizeSessionCredentials({ sessionId: deps.sessionId, password, pin: text(fields.pin), totp: text(fields.totp) });
    return null;
  } catch {
    return { status: 403, body: { ok: false, code: "recheck", error: "That password, PIN or code was not accepted.", requiresRecheck: true } };
  }
}
