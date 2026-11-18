import type { SettingsPort } from "./types";

export type RemoveOutcome = { kind: "removed" } | { kind: "refused"; message: string };

const COULD_NOT = "That key could not be removed. Try again.";

/**
 * Removes a key in ONE call, with the account password in that same call. Nothing is asked of the engine first
 * (no press grant is minted) and no sentence it says is matched: it either removes the key or says why not.
 */
export async function removeKey(port: SettingsPort, keyId: string, password: string): Promise<RemoveOutcome> {
  const result = await port.call("secret-keys", "delete-key", { id: keyId, ...(password ? { authorizationPassword: password } : {}) });
  return result.ok ? { kind: "removed" } : { kind: "refused", message: result.error || COULD_NOT };
}
