import type { SecretKeySummary } from "../types.ts";
import type { SaveModelKeyProvider } from "./contracts.ts";
import { secretKeyModelProvider } from "./model-key-provider.ts";
import type { SecretKeyCheckVerdict, SecretKeySavedKeyCheck } from "./saved-key-check.ts";

/** A refused write's answer: the provider's outcome as its code, and a sentence for a key that was never saved. */
export type ModelKeyCheckRefusal = { ok: false; error: string; errorCode: "provider_refused" | "no_credit" };

/** The go-ahead to store the value, and what to call once it is stored. */
export type ModelKeyCheckGoAhead = { ok: true; record(saved: SecretKeySummary): void };

const LABELS: Readonly<Record<SaveModelKeyProvider, string>> = { anthropic: "Anthropic", deepseek: "DeepSeek" };

/**
 * The free provider check of a model key's new value, run BEFORE the value is
 * stored (t950), on every write that gives a model key a value: create-key,
 * rotate-key, save-model-key and replace-model-key.
 *
 * - The provider refuses the key (`provider_refused`) or its account has no
 *   credit (`no_credit`): the answer is that refusal and nothing is stored, so
 *   no refused key is ever listed, turned on or chosen; a replaced key keeps
 *   its previous value, and the person's previous choice stands. The caller's
 *   Activity row reads the write as failed, with the outcome as its kind.
 * - The provider cannot be reached (`provider_unreachable`), or the probe
 *   itself fails: the value is stored, because a network problem must not
 *   block saving, and the outcome is recorded on the stored key, so the
 *   person's model access reads it (the card's "Can't reach").
 * - It answers: the value is stored and the answer recorded.
 *
 * A key no free check can test (not an enabled model key of a provider Core
 * calls), or a host that binds no check, is stored with nothing recorded, as
 * before.
 */
export async function checkModelKeyBeforeSaving(
  check: SecretKeySavedKeyCheck | undefined,
  key: { kind: string; enabled: boolean; provider?: string | undefined },
  value: string,
  act: "save" | "replace"
): Promise<ModelKeyCheckRefusal | ModelKeyCheckGoAhead> {
  const provider = check ? secretKeyModelProvider(key) : undefined;
  if (!check || !provider) return { ok: true, record: () => undefined };
  let verdict: SecretKeyCheckVerdict;
  try {
    verdict = await check.probe({ provider, value });
  } catch (error) {
    // Nothing the provider said: the key is saved and reads as unreachable until a call says otherwise.
    console.warn(`The provider check of a model key failed (${error instanceof Error ? error.name : "non_error"}).`);
    verdict = { outcome: "provider_unreachable" };
  }
  const label = LABELS[provider];
  const unchanged = act === "save" ? "so it was not saved" : "so your key was not changed";
  if (verdict.outcome === "provider_refused") return { ok: false, errorCode: "provider_refused", error: `${label} did not accept this key, ${unchanged}. Check that it was copied in full.` };
  if (verdict.outcome === "no_credit") return { ok: false, errorCode: "no_credit", error: `${label} says the account behind this key has no credit left, ${unchanged}. Add credit with ${label}, or use another key.` };
  return { ok: true, record: (saved) => check.record({ id: saved.id, lastRotatedAtMs: saved.lastRotatedAtMs }, verdict) };
}
