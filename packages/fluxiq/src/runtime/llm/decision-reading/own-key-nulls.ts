// A tool call's own optional key written as `null`, read as not written.
//
// `add`, `act` and `place` sit beside a tool call's input and are optional:
// each says something about the step only when it is there. A reply that
// writes `"act": null, "place": null` has said nothing about either, exactly
// as one that leaves them out, and nothing else can be meant: `null` is not an
// act, a place or a yes. run-mwus396e-5447c6f6 step 45 (t1025) lost a sound
// node call to it. Only these three keys: an input's own `null` is the tool's
// to read, and a `complete` or `amend_draft` carries none of them.

/** A tool call's own optional keys: written only to say something. */
const OWN_OPTIONAL_KEYS: readonly string[] = ["add", "act", "place"];

/** Decisions that carry none of those keys; any other may be a tool call. */
const OTHER_KINDS: ReadonlySet<unknown> = new Set(["complete", "amend_draft"]);

/** The decision without its own optional keys that were `null`, and which they were; nothing when none was. */
export function automationStudioLlmDecisionOwnKeyNulls(decision: unknown): { decision: Record<string, unknown>; keys: string[] } | undefined {
  if (!isRecord(decision) || OTHER_KINDS.has(decision.kind)) return undefined;
  const keys = OWN_OPTIONAL_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(decision, key) && decision[key] === null);
  if (!keys.length) return undefined;
  const read: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(decision)) {
    if (keys.includes(key)) continue;
    Object.defineProperty(read, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return { decision: read, keys };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
