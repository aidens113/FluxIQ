import type { SecretKeySummary } from "../types.ts";
import type { SaveModelKeyProvider } from "./contracts.ts";
import { secretKeyModelProvider } from "./model-key-provider.ts";

/**
 * The host's free provider check of a model key just saved or replaced, so the
 * caller's model access says at once whether the provider takes it. Handed the
 * value only for that check; it never answers, logs or stores it.
 */
export type SecretKeySavedKeyCheck = (key: { id: string; provider: SaveModelKeyProvider; value: string; lastRotatedAtMs: number }) => Promise<void>;

/**
 * Runs the host's check on a model key that now holds `value`, when the host
 * binds one and the key is a model key. The key is saved either way, so a
 * check that fails is logged by its error's name only and the caller's model
 * access, read next, says what is known.
 */
export async function checkSavedModelKey(check: SecretKeySavedKeyCheck | undefined, key: SecretKeySummary, value: string): Promise<void> {
  const provider = check ? secretKeyModelProvider(key) : undefined;
  if (!check || !provider) return;
  try {
    await check({ id: key.id, provider, value, lastRotatedAtMs: key.lastRotatedAtMs });
  } catch (error) {
    console.warn(`The provider check of a saved model key failed (${error instanceof Error ? error.name : "non_error"}).`);
  }
}
