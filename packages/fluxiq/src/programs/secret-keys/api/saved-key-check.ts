import type { SaveModelKeyProvider } from "./contracts.ts";

/**
 * What the provider said of a model key's value, by its free check: it
 * answered, it refused the key (`provider_refused`), the account behind it has
 * no credit (`no_credit`), or it could not be reached (`provider_unreachable`).
 * `message` is the check's own sentence, never built from the value.
 */
export type SecretKeyCheckVerdict = { outcome: "answered" | "provider_refused" | "no_credit" | "provider_unreachable"; message?: string | undefined };

/**
 * The host's free provider check of a model key's value, in two steps so a key
 * the provider refuses is never stored (t950): `probe` asks the provider about
 * the value before anything is saved, and `record` keeps that verdict as the
 * stored key's last outcome, under the version it was saved at, once it is.
 * Handed the value only for the probe; it never answers, logs or stores it.
 * `checkModelKeyBeforeSaving` (`./check-before-saving.ts`) runs both.
 */
export type SecretKeySavedKeyCheck = {
  probe(input: { provider: SaveModelKeyProvider; value: string }): Promise<SecretKeyCheckVerdict>;
  record(key: { id: string; lastRotatedAtMs: number }, verdict: SecretKeyCheckVerdict): void;
};
