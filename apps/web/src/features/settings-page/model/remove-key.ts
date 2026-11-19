import type { SettingsPort } from "./types";

export type RemoveOutcome = { kind: "removed" } | { kind: "refused"; message: string };

const COULD_NOT = "That key could not be removed. Try again.";

/**
 * Removes a key in ONE call, with no password or PIN: the engine decides whether this person may. Nothing is asked
 * of the engine first (no press grant is minted) and no sentence it says is matched: it either removes the key or
 * says why not.
 */
export async function removeKey(port: SettingsPort, keyId: string): Promise<RemoveOutcome> {
  const result = await port.call("secret-keys", "delete-key", { id: keyId });
  return result.ok ? { kind: "removed" } : { kind: "refused", message: result.error || COULD_NOT };
}
