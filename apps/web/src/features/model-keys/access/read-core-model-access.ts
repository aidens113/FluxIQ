import type { CoreModelAccess } from "@fluxiq/ui-components";

// Core's model-access state as the secret-keys snapshot carries it (`modelAccess`; the contract is
// `readModelAccessState` in `@fluxiq/contracts/platform`, which this app does not depend on, so the same
// checks are restated here). A value that contradicts itself reads as null, which the card shows as "Update FluxIQ".

const STATUSES: readonly string[] = ["ready", "no_key", "key_unopenable", "not_permitted", "provider_refused", "no_credit", "provider_unreachable"];
const PROVIDERS: readonly string[] = ["anthropic", "deepseek"];
const OUTCOMES: readonly string[] = ["answered", "provider_refused", "no_credit", "provider_unreachable"];
const CODES: readonly string[] = ["legacy_recovery_required", "host_protection_unavailable", "ciphertext_invalid"];
const NEEDS_KEY: readonly string[] = ["ready", "key_unopenable", "provider_refused", "no_credit", "provider_unreachable"];
const MAX_MESSAGE = 600;

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

function readKey(value: unknown): CoreModelAccess["key"] | undefined {
  const record = recordOf(value);
  if (!record) return undefined;
  const { id, name, provider, model } = record;
  if ((id !== undefined && (typeof id !== "string" || !id)) || typeof name !== "string" || typeof model !== "string" || !model) return undefined;
  if (typeof provider !== "string" || !PROVIDERS.includes(provider)) return undefined;
  return { ...(id === undefined ? {} : { id }), name, provider, model };
}

function readLastCall(value: unknown): CoreModelAccess["lastCall"] | undefined {
  const record = recordOf(value);
  if (!record) return undefined;
  const { outcome, atMs } = record;
  if (typeof outcome !== "string" || !OUTCOMES.includes(outcome)) return undefined;
  if (typeof atMs !== "number" || !Number.isFinite(atMs) || atMs < 0) return undefined;
  return { outcome: outcome as NonNullable<CoreModelAccess["lastCall"]>["outcome"], atMs };
}

/** The state Core sent, or null when it is absent or not one. */
export function readCoreModelAccess(value: unknown): CoreModelAccess | null {
  const record = recordOf(value);
  if (!record) return null;
  const { status, message } = record;
  if (typeof status !== "string" || !STATUSES.includes(status)) return null;
  if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE) return null;
  const key = record.key === null ? null : readKey(record.key);
  if (key === undefined) return null;
  if (NEEDS_KEY.includes(status) && !key) return null;
  if (status === "no_key" && key) return null;
  const lastCall = record.lastCall === null ? null : readLastCall(record.lastCall);
  if (lastCall === undefined) return null;
  if ((status === "provider_refused" || status === "no_credit" || status === "provider_unreachable") && lastCall?.outcome !== status) return null;
  const code = record.unopenableCode;
  const typed = status as CoreModelAccess["status"];
  if (status === "key_unopenable") {
    if (typeof code !== "string" || !CODES.includes(code)) return null;
    return { status: typed, message, key, lastCall, unopenableCode: code };
  }
  if (code !== undefined) return null;
  return { status: typed, message, key, lastCall };
}
