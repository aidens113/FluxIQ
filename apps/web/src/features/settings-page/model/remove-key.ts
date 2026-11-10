import type { SettingsPort } from "./types";

export type RemoveProof = { password?: string; pin?: string };

export type RemoveOutcome =
  | { kind: "removed" }
  /** The person turned a PIN on, so it confirms instead of the press. */
  | { kind: "needs-pin" }
  /** The engine still asks for the password on this call. */
  | { kind: "needs-password"; message: string }
  | { kind: "refused"; message: string };

// Sentences the engine says. Only the words reach a page, so they are matched.
const PIN_ON = /\bPIN\b.*\brequired\b/i;
const NO_CONFIRMATION_NEEDED = /does not need a confirmation/i;

/**
 * Removes a key after the person's one press. The press becomes a grant for
 * exactly this call (`identity-access/mint-press-grant`), and the call is sent
 * with the same payload plus `pressGrant`. A PIN is asked for only when the
 * engine says the person turned one on, and then it is sent instead of a grant.
 * Neither the grant nor any secret is returned or logged.
 */
export async function removeKey(port: SettingsPort, keyId: string, proof: RemoveProof = {}): Promise<RemoveOutcome> {
  const payload = { id: keyId, ...(proof.password ? { authorizationPassword: proof.password } : {}) };
  if (proof.pin) return outcomeOf(await port.call("secret-keys", "delete-key", { ...payload, authorizationPin: proof.pin }), proof);
  const mint = await port.call<{ grant?: string }>("identity-access", "mint-press-grant", { programId: "secret-keys", endpoint: "delete-key", payload });
  const grant = mint.ok ? mint.payload?.grant : undefined;
  if (grant) return outcomeOf(await port.call("secret-keys", "delete-key", { ...payload, pressGrant: grant }), proof);
  const reason = mint.error ?? "";
  if (PIN_ON.test(reason)) return { kind: "needs-pin" };
  if (NO_CONFIRMATION_NEEDED.test(reason)) return outcomeOf(await port.call("secret-keys", "delete-key", payload), proof);
  return { kind: "refused", message: reason || "That key could not be removed. Try again." };
}

function outcomeOf(result: { ok: boolean; error?: string; requiresRecheck?: boolean }, proof: RemoveProof): RemoveOutcome {
  if (result.ok) return { kind: "removed" };
  const message = result.error ?? "That key could not be removed. Try again.";
  if (PIN_ON.test(message)) return { kind: "needs-pin" };
  if (result.requiresRecheck && !proof.password) return { kind: "needs-password", message: "Type your password to remove this key." };
  return { kind: "refused", message };
}
