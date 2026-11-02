/**
 * The longest wait the runtime will take from a source's own hint.
 *
 * A service that asks for an hour is asking for something a run cannot give: the
 * person is waiting, and a Flow that sleeps for an hour is indistinguishable
 * from one that hung. The hint is honoured up to this bound and clamped past it,
 * because clamping keeps the cooperative behaviour -- waiting longer than the
 * backoff table would -- without handing a remote service control of the run's
 * clock.
 */
export const AUTOMATION_STUDIO_MAX_RETRY_HINT_MS = 60_000;

/** Keys a source may state its own retry delay under, in the order they are read. */
const HINT_KEYS: readonly string[] = ["retry-after", "Retry-After", "retryAfter", "retryAfterMs"];

/**
 * The wait a source asked for, in milliseconds, or nothing when it asked for
 * none.
 *
 * Read from an error, a response-like object, or a bag of transport metadata: a
 * numeric hint is seconds, as the transport spells it, except `retryAfterMs`
 * which is already milliseconds; a date is the instant to try again at, measured
 * from `now`. A hint that is absent, unreadable, negative or infinite yields
 * nothing, so the backoff table decides instead. A hint longer than
 * `AUTOMATION_STUDIO_MAX_RETRY_HINT_MS` is clamped rather than discarded.
 */
export function automationStudioRetryHintMs(source: unknown, now: number): number | undefined {
  for (const value of hintValues(source)) {
    const parsed = parseHint(value, now);
    if (parsed !== undefined) return Math.min(AUTOMATION_STUDIO_MAX_RETRY_HINT_MS, parsed);
  }
  return undefined;
}

/** Every place a hint may sit on one object: the object itself, and any metadata bag it carries. */
function hintValues(source: unknown): unknown[] {
  const values: unknown[] = [];
  for (const bag of [source, readProperty(source, "headers"), readProperty(readProperty(source, "response"), "headers"), readProperty(source, "response"), readProperty(source, "cause")]) {
    if (bag === undefined || bag === null) continue;
    for (const key of HINT_KEYS) {
      const read = readMetadata(bag, key);
      if (read !== undefined && read !== null) values.push(key === "retryAfterMs" ? { milliseconds: read } : read);
    }
  }
  return values;
}

/**
 * A bag that answers `get` answers through it; a plain object answers by own
 * key.
 *
 * `get` is called with a name the transport itself defines, which every bag
 * implementing the method accepts, so nothing here guards against a throw: a bag
 * that threw on a valid name is broken in a way a silent `undefined` would hide.
 */
function readMetadata(bag: unknown, key: string): unknown {
  if (typeof bag !== "object" || bag === null) return undefined;
  const get = (bag as { get?: unknown }).get;
  if (typeof get === "function") return (get as (name: string) => unknown).call(bag, key);
  return readProperty(bag, key);
}

function readProperty(source: unknown, key: string): unknown {
  if (typeof source !== "object" || source === null) return undefined;
  return (source as Record<string, unknown>)[key];
}

function parseHint(value: unknown, now: number): number | undefined {
  if (typeof value === "object" && value !== null && "milliseconds" in value) {
    const milliseconds = (value as { milliseconds: unknown }).milliseconds;
    return typeof milliseconds === "number" && Number.isFinite(milliseconds) && milliseconds >= 0 ? Math.round(milliseconds) : undefined;
  }
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value * 1_000) : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds)) return seconds >= 0 ? Math.round(seconds * 1_000) : undefined;
  const instant = Date.parse(value.trim());
  if (!Number.isFinite(instant)) return undefined;
  return Math.max(0, Math.round(instant - now));
}
