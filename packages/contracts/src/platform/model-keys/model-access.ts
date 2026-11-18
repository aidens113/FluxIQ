import type { ModelKeyAvailability } from "./availability.ts";

/**
 * Whether a person's chats and Flows can reach a model now, and when they
 * cannot, the one reason (t924). Core works it out for the person asking, from
 * the key their calls would use and how the last call on that key went; the
 * panel and paired clients read it from the Secret Keys snapshot
 * (`modelAccess`) and show `message` as it is.
 *
 * - `ready`: a key is chosen and nothing has gone wrong with it since it last changed.
 * - `no_key`: no model key this person may use exists. The only status that says to add one.
 * - `key_unopenable`: the key exists but could not be opened on this server (`unopenableCode` says why).
 * - `not_permitted`: a key exists, but this person may not use it (IAM, or another person's key not chosen and offered for the workspace).
 * - `provider_refused`: the provider refused the key on its last call or check (a bad or revoked key).
 * - `no_credit`: the provider says the account behind the key has no credit left (a balance refusal on a call, or a free check).
 * - `provider_unreachable`: the provider could not be reached on the last call.
 */
export const MODEL_ACCESS_STATUSES = ["ready", "no_key", "key_unopenable", "not_permitted", "provider_refused", "no_credit", "provider_unreachable"] as const;
export type ModelAccessStatus = (typeof MODEL_ACCESS_STATUSES)[number];

export const MODEL_ACCESS_PROVIDERS = ["anthropic", "deepseek"] as const;
export type ModelAccessProvider = (typeof MODEL_ACCESS_PROVIDERS)[number];

/** Why a saved key could not be opened: the same causes key availability names. */
export type ModelAccessUnopenableCode = Extract<ModelKeyAvailability, { state: "unavailable" }>["code"];
const UNOPENABLE_CODES: readonly ModelAccessUnopenableCode[] = ["legacy_recovery_required", "host_protection_unavailable", "ciphertext_invalid"];

/** The key a call would use: never its value. `id` is said to the panel and left out for a paired client, which is never handed key ids. */
export type ModelAccessKey = { id?: string; name: string; provider: ModelAccessProvider; model: string };

/** How the last model call on the key went, since the key last changed. */
export type ModelAccessCallOutcome = "answered" | "provider_refused" | "no_credit" | "provider_unreachable";
export type ModelAccessLastCall = { outcome: ModelAccessCallOutcome; atMs: number };

export type ModelAccessState = {
  status: ModelAccessStatus;
  /** One plain sentence for the person, shown as it is: the same words the chat answers with. */
  message: string;
  /** The key the person's calls would use. Null only for `no_key`, and for `not_permitted` when no key could be named. */
  key: ModelAccessKey | null;
  /** Null until a call has used `key` since it last changed. */
  lastCall: ModelAccessLastCall | null;
  /** Present only, and always, with `key_unopenable`. */
  unopenableCode?: ModelAccessUnopenableCode;
};

const MAX_MESSAGE_CHARS = 600;
const NEEDS_KEY: ReadonlySet<ModelAccessStatus> = new Set(["ready", "key_unopenable", "provider_refused", "no_credit", "provider_unreachable"]);

/** The state as a paired client receives it: the same, without the key's id. */
export function pairedClientModelAccessState(state: ModelAccessState): ModelAccessState {
  if (!state.key) return state;
  const { id: _id, ...key } = state.key;
  return { ...state, key };
}

/**
 * A model-access state read from the wire, or null when it is not one. Only the
 * fields above are kept, and a state that contradicts itself (a refusal with no
 * call, a ready state with no key) is refused rather than shown as ready.
 */
export function readModelAccessState(value: unknown): ModelAccessState | null {
  const record = recordOf(value);
  if (!record) return null;
  const status = record.status;
  if (typeof status !== "string" || !(MODEL_ACCESS_STATUSES as readonly string[]).includes(status)) return null;
  const typed = status as ModelAccessStatus;
  const message = record.message;
  if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_CHARS) return null;
  const key = record.key === null ? null : readKey(record.key);
  if (key === undefined) return null;
  if (NEEDS_KEY.has(typed) && !key) return null;
  if (typed === "no_key" && key) return null;
  const lastCall = record.lastCall === null ? null : readLastCall(record.lastCall);
  if (lastCall === undefined) return null;
  if ((typed === "provider_refused" || typed === "no_credit" || typed === "provider_unreachable") && lastCall?.outcome !== typed) return null;
  const code = record.unopenableCode;
  if (typed === "key_unopenable") {
    if (!UNOPENABLE_CODES.includes(code as ModelAccessUnopenableCode)) return null;
    return { status: typed, message, key, lastCall, unopenableCode: code as ModelAccessUnopenableCode };
  }
  if (code !== undefined) return null;
  return { status: typed, message, key, lastCall };
}

function readKey(value: unknown): ModelAccessKey | undefined {
  const record = recordOf(value);
  if (!record) return undefined;
  const { id, name, provider, model } = record;
  if ((id !== undefined && (typeof id !== "string" || !id)) || typeof name !== "string" || typeof model !== "string" || !model) return undefined;
  if (typeof provider !== "string" || !(MODEL_ACCESS_PROVIDERS as readonly string[]).includes(provider)) return undefined;
  return { ...(id === undefined ? {} : { id }), name, provider: provider as ModelAccessProvider, model };
}

function readLastCall(value: unknown): ModelAccessLastCall | undefined {
  const record = recordOf(value);
  if (!record) return undefined;
  const { outcome, atMs } = record;
  if (outcome !== "answered" && outcome !== "provider_refused" && outcome !== "no_credit" && outcome !== "provider_unreachable") return undefined;
  if (typeof atMs !== "number" || !Number.isFinite(atMs) || atMs < 0) return undefined;
  return { outcome, atMs };
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
