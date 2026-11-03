// What a provider said when it refused a request, as a typed record a caller
// can keep, read and publish.
//
// Why this is a type and not a string. A 4xx is a client error -- the request
// was wrong -- and the only thing that says *how* is the body the provider
// sends back with it. Two live runs died on their first call with a status and
// nothing else (`run-muhs8hx3-6fd929e6`, `run-muhtuizo-c458e49c`), and the
// answer was thrown away one line after being in hand. The DeepSeek adapter now
// reads and screens that answer (`deepseek/refusal.ts`), but it rides on the
// thrown failure as a JSON string in `responseBody`, so the only thing a reader
// could do with it was re-parse a string of unknown shape or ignore it. It was
// ignored: nothing outside the throw ever saw it.
//
// This module is the provider-neutral shape it is read into, and the bounds it
// must satisfy to be kept. It names no provider: a refusal is a status, what the
// provider said about it, what the request looked like, and what was
// deliberately left out. Any adapter can produce one.
//
// **Why the bounds are re-checked here rather than trusted.** The producer
// screens the record -- the message goes through Core's locator screen and is
// dropped whole if it carries the configured credential; `code`, `type` and
// `param` must be plain identifiers; the request is counts, bounds and ids this
// repository minted. That screening is the producer's guarantee and this module
// does not repeat it, because it cannot: it has no credential to compare
// against and the record reaches it already screened. What it can do, and does,
// is refuse to carry anything whose *shape* is not publishable: a string long
// enough to be prose or payload where only a name belongs, a status that is not
// a status, a body size that is not a size. The two together are what let this
// record travel further than the process that built it.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";

/**
 * Every bound a refusal record must satisfy to be carried.
 *
 * A record outside them is not truncated into shape silently: either the field
 * is dropped and named in `withheld`, or -- where the bound says the record is
 * not one of ours at all -- the whole record is refused.
 */
export const AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS = Object.freeze({
  /** How much of the provider's own sentence is kept: long enough to name a field, short enough not to be a payload. */
  messageLength: 400,
  /** How long `code`, `type` and `param` may be. They are names, not prose. */
  fieldLength: 120,
  /** How long a declared media type may be. */
  mediaTypeLength: 200,
  /** How many named omissions a record may carry. More than this is not a vocabulary. */
  withheldEntries: 32,
  /** How long any string inside the request's shape may be, and how deep and wide the shape may go. */
  requestStringLength: 200,
  requestDepth: 8,
  requestEntries: 500
});

/** The provider's own error, read field by field out of a refusal body -- never the body itself. */
export type AutomationStudioLlmProviderRefusalError = {
  code: string | null;
  type: string | null;
  param: string | null;
  message: string | null;
};

/**
 * A provider's refusal of one request.
 *
 * `withheld` names every omission, so a reader can tell "the provider said
 * nothing" from "the provider said something this record would not carry". The
 * vocabulary belongs to the producer -- Core's own adapter uses
 * `body_unreadable`, `body_over_limit`, `body_empty`, `body_not_json`,
 * `error_object_absent`, `error_fields_unnamed`, `message_truncated`,
 * `message_locator_shaped` and `message_credential_shaped` -- and this module
 * adds `request_unpublishable` when it drops a request shape of its own accord.
 */
export type AutomationStudioLlmProviderRefusal = {
  /** The status the provider answered with. Always known: it is why the record exists. */
  status: number;
  /** The media type the provider declared, or `null` when it declared none this record would carry. */
  contentType: string | null;
  /** How many bytes of body arrived, or `null` when none could be read. */
  bodyBytes: number | null;
  error: AutomationStudioLlmProviderRefusalError | null;
  withheld: readonly string[];
  /**
   * The shape of the request the provider refused: counts, bounds, booleans and
   * ids, never its content (`deepseek/request-shape.ts` is Core's).
   *
   * `null` when the producer sent none, or when what it sent held a string this
   * module would not publish -- said then in `withheld` as
   * `request_unpublishable`.
   */
  request: JsonObject | null;
};

const WITHHELD_NAME = /^[a-z0-9_]{1,40}$/u;
/**
 * The shape a name-bearing field must have: `invalid_request_error`,
 * `max_tokens`, `messages[1].content`, `deepseek-flash`, `web.read_page`.
 *
 * It admits the field path that makes a 400 actionable and refuses every shape
 * that addresses an element, because those need a quote, an equals sign, a
 * sigil or whitespace and none is admitted. What it does *not* claim is to know
 * a node id from a class name -- that is the producer's screen. What it
 * guarantees is that nothing prose-shaped, payload-shaped or quoted travels in
 * a field that should hold a name.
 */
const NAMED_FIELD = /^[\w.:\-[\]/]*$/u;
/**
 * A declared media type, with its parameters: `application/json`,
 * `text/html; charset=utf-8`.
 *
 * Wider than a name because a real one carries a semicolon, an equals sign and a
 * space -- and narrower than prose for the same reason the rest of this record
 * is: no bracket, no quote, no sigil, so nothing that addresses an element can
 * arrive in the one field an interposed proxy gets to fill in.
 */
const MEDIA_TYPE = /^[\w.\-+/;= ]{1,200}$/u;

/**
 * Read a refusal record, from the typed record itself or from the JSON a
 * provider encoded it as.
 *
 * `undefined` means "there is no refusal record here" -- a failure that carries
 * none, or something in the `responseBody` slot that is not one. It never means
 * "there was one and it was dropped": everything droppable is named in
 * `withheld` instead.
 */
export function parseAutomationStudioLlmProviderRefusal(value: unknown): AutomationStudioLlmProviderRefusal | undefined {
  const read = refusalRecord(value);
  if (!("record" in read)) return undefined;
  const status = read.record.status;
  // A refusal is a status the provider answered with. Without one there is
  // nothing to hang the rest on, and whatever this is, it is not this record.
  if (!Number.isInteger(status) || (status as number) < 100 || (status as number) > 599) return undefined;
  const withheld = namedOmissions(read.record.withheld);
  if (!withheld) return undefined;
  return {
    status: status as number,
    contentType: boundedMediaType(read.record.contentType),
    bodyBytes: boundedByteCount(read.record.bodyBytes),
    error: refusalError(read.record.error, withheld),
    request: publishableRequestShape(read.record.request, withheld),
    withheld: Object.freeze([...withheld])
  };
}

/**
 * The record, from an object or from the JSON string one was encoded as.
 *
 * `{ unreadable: true }` rather than `undefined`, because a caller must be able
 * to tell a failure carrying no refusal from a failure carrying something that
 * would not parse -- and because a caught parse failure answered with an absent
 * value is exactly what the structure audit's `failure-as-empty` rule exists to
 * stop.
 */
function refusalRecord(value: unknown): { record: Record<string, unknown> } | { unreadable: true } {
  if (isRefusalRecord(value)) return { record: value };
  if (typeof value !== "string" || value.length > 64_000) return { unreadable: true };
  try {
    const parsed: unknown = JSON.parse(value);
    return isRefusalRecord(parsed) ? { record: parsed } : { unreadable: true };
  } catch {
    return { unreadable: true };
  }
}

function isRefusalRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The omissions the producer named, as a set this parse can add its own to.
 *
 * `null` -- refusing the whole record -- when `withheld` is present but is not
 * a list of names, or is longer than a vocabulary can be. A record whose own
 * account of what it left out cannot be read is not one this module will carry:
 * the entries are the only thing standing between a dropped field and a silent
 * absence.
 */
function namedOmissions(value: unknown): Set<string> | null {
  if (value === undefined || value === null) return new Set();
  if (!Array.isArray(value) || value.length > AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS.withheldEntries) return null;
  if (!value.every((entry) => typeof entry === "string" && WITHHELD_NAME.test(entry))) return null;
  return new Set(value as string[]);
}

function boundedMediaType(value: unknown): string | null {
  return typeof value === "string" && value.length <= AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS.mediaTypeLength && MEDIA_TYPE.test(value)
    ? value
    : null;
}

function boundedByteCount(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= Number.MAX_SAFE_INTEGER ? value as number : null;
}

function refusalError(value: unknown, withheld: Set<string>): AutomationStudioLlmProviderRefusalError | null {
  if (value === undefined || value === null) return null;
  if (!isRefusalRecord(value)) {
    withheld.add("error_fields_unnamed");
    return null;
  }
  return {
    code: namedField(value.code, withheld),
    type: namedField(value.type, withheld),
    param: namedField(value.param, withheld),
    message: refusalMessage(value.message, withheld)
  };
}

function namedField(value: unknown, withheld: Set<string>): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS.fieldLength || !NAMED_FIELD.test(value)) {
    withheld.add("error_fields_unnamed");
    return null;
  }
  return value;
}

/**
 * The provider's sentence, bounded.
 *
 * The producer has already run it through Core's locator screen and dropped it
 * whole if it carried the configured credential; what is enforced here is only
 * the length, because prose is the one field in this record that legitimately
 * holds free text and a ceiling is the only thing a reader downstream can rely
 * on without knowing which adapter wrote it.
 */
function refusalMessage(value: unknown, withheld: Set<string>): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "") {
    withheld.add("error_fields_unnamed");
    return null;
  }
  if (value.length <= AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS.messageLength) return value;
  withheld.add("message_truncated");
  return value.slice(0, AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS.messageLength);
}

/**
 * The request's shape, carried only if every string in it is a name.
 *
 * The shape exists to say what a refused request looked like without saying
 * what was in it, and the request held a page's content, a person's instruction
 * and every handle a domain issued. A producer that adds a text-bearing field
 * to its shape therefore loses the shape rather than publishing the text, and
 * the loss is named: `request_unpublishable`.
 */
function publishableRequestShape(value: unknown, withheld: Set<string>): JsonObject | null {
  if (value === undefined || value === null) return null;
  if (!isRefusalRecord(value) || !publishableJson(value, 0)) {
    withheld.add("request_unpublishable");
    return null;
  }
  return value as JsonObject;
}

function publishableJson(value: unknown, depth: number): value is JsonValue {
  const limits = AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= limits.requestStringLength && NAMED_FIELD.test(value);
  if (depth >= limits.requestDepth || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.length <= limits.requestEntries && value.every((entry) => publishableJson(entry, depth + 1));
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= limits.requestEntries
    && entries.every(([key, entry]) => key.length <= limits.fieldLength && NAMED_FIELD.test(key) && publishableJson(entry, depth + 1));
}
