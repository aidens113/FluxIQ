// The wait a provider asked for, in milliseconds, or nothing when it asked for
// none.
//
// **What reaches this today, and what does not.** A `Retry-After` is the one
// place a rate limit says how long to wait, and Core's DeepSeek adapter does not
// carry it: the screened refusal record (`../refusal-record.ts`) holds the
// status, the declared media type, the body's size and the provider's error
// object, and headers are not among them. So this reads the hint from wherever a
// failure does carry one -- a field on the thrown failure, a headers bag it
// brought with it, or a `retryAfterMs` on its refusal record -- and the backoff
// table decides for every failure that carries none, which is all of DeepSeek's
// today. Surfacing the header is a two-line change in `deepseek/refusal.ts` and
// `refusal-record.ts`, and this function is what makes it worth making.
//
// A hint is read, bounded and honoured; it is never trusted with the run's
// clock. `maxWaitMs` clamps it, because a provider asking for a minute is asking
// for something a waiting person cannot give, and clamping keeps the cooperative
// behaviour -- waiting longer than the table would -- without handing a remote
// service the deadline.
//
// `runtime/executor/defensive/retry-hint.ts` answers the same question for a
// node's transport fault. The two should be one function; they are not yet
// because this one must not import a value across that directory edge while the
// other is still in flight. Named here so the duplication is visible rather than
// discovered.

/** Keys a failure may state its own delay under, in the order they are read. */
const HINT_KEYS: readonly string[] = ["retryAfterMs", "retryAfter", "retry-after", "Retry-After"];

export function automationStudioLlmProviderRetryHintMs(failure: unknown, now: number): number | undefined {
  for (const bag of [failure, property(failure, "headers"), property(failure, "refusal"), property(property(failure, "response"), "headers")]) {
    if (bag === undefined || bag === null) continue;
    for (const key of HINT_KEYS) {
      const read = metadata(bag, key);
      if (read === undefined || read === null) continue;
      const parsed = key === "retryAfterMs" ? milliseconds(read) : seconds(read, now);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

/**
 * A bag that answers `get` answers through it -- a `Headers` is the case that
 * matters -- and a plain object answers by own key.
 *
 * Nothing guards a throw from `get`: it is called with a header name the
 * transport itself defines, and a bag that threw on one is broken in a way a
 * silent absence would hide.
 */
function metadata(bag: unknown, key: string): unknown {
  if (typeof bag !== "object" || bag === null) return undefined;
  const get = (bag as { get?: unknown }).get;
  if (typeof get === "function") return (get as (name: string) => unknown).call(bag, key);
  return property(bag, key);
}

function property(source: unknown, key: string): unknown {
  if (typeof source !== "object" || source === null) return undefined;
  return (source as Record<string, unknown>)[key];
}

function milliseconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

/** `Retry-After` as the transport spells it: seconds, or the instant to try again at. */
function seconds(value: unknown, now: number): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value * 1_000) : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const numeric = Number(value.trim());
  if (Number.isFinite(numeric)) return numeric >= 0 ? Math.round(numeric * 1_000) : undefined;
  const instant = Date.parse(value.trim());
  if (!Number.isFinite(instant)) return undefined;
  return Math.max(0, Math.round(instant - now));
}
