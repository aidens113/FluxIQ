// One authored `where` condition, in the words the model wrote it in.
//
// The judgement and the re-author are shown how many rows each condition of a
// read rejected, and a count is only useful beside the condition it belongs to:
// `run-munq5s8x-6d620cdf` dropped real earbuds named "... Wireless Charging
// Case" on `name not contains "charging case"`, and nothing it was shown could
// have said so. So each condition is rendered as the Flow authored it --
// `name not contains ["ear tips", "charging case"]`, `rating atLeast 4` -- and
// nothing more.
//
// **What names the value.** A condition names what it tests either by one of
// the step's own column keys, or by a read of its own inside the item. A read is
// never shown: it is a way to address part of the page. Where it is the very
// read one of the step's columns makes, the column's key is said instead, which
// the model recognises and which the stored schema already discloses. The
// comparison is made here, in Core, on the whole authored object, so the part
// that addresses the page is compared and never spelled. A read that matches no
// column is named by its kind, and by the item attribute it reads when that is
// a plain name -- `attribute data-sponsored is absent` is how an exclusion of
// sponsored items reads.
//
// **What the read found, when the condition reads for itself.** A kind and an
// attribute name do not say what a condition is about: `run-munw7ffn-fe1cecd2`
// filtered on the aria-label of the store's Brightaisle Plus icon, its judge was
// told `attribute aria-label is present`, and it advised adding a Plus condition
// the Flow already had. So the one value the read reports that condition's read
// found on an item it held of (the summary's `conditions.seen`) is said beside
// the subject -- `attribute aria-label (read "Brightaisle Plus" on a row it kept)
// is present` -- bounded, and withheld entirely when it would trip either screen
// or is a key the domain denies. A condition over a column says no value: the
// column's own values are the rows.
//
// **What is said about it.** Every other key of the condition is a relation the
// model wrote, spelled as it wrote it (the domain's reader accepts several
// spellings, and translating them here would be Core learning a grammar it does
// not own), with the value it wrote. Numbers are carried whole. A string is
// carried bounded, and refused -- replaced by a marker -- when it is shaped like
// a credential or like a way to address an element, the same two screens every
// other authored string in a request passes. `not: true` is said as `not`.
//
// Without the bound domain's declared keys nothing authored is carried at all:
// an absent declaration means nobody said, never "deny nothing".

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioEvidenceKey, automationStudioLocatorShapedText, screenAutomationStudioLlmEvidence } from "../../llm/index.ts";

/** Keys that name the value a condition tests, rather than saying something about it. */
const NAMING_KEYS = new Set(["field", "read"]);
/** The longest condition wording carried. */
const MAX_CONDITION_LENGTH = 200;
/** The longest single compared string carried, and the longest value a condition's read found. */
const MAX_OPERAND_LENGTH = 60;
/** The most compared values of one relation carried. */
const MAX_OPERANDS = 6;
/** What a compared value that could not be carried reads as. */
const WITHHELD_OPERAND = "(withheld)";
/** A relation key or a kind word: plain letters, as a grammar spells them. */
const WORD = /^[A-Za-z][A-Za-z_]{0,31}$/u;
/** A column key or an item attribute's name. */
const NAME = /^[A-Za-z_][\w-]{0,63}$/u;

/**
 * The condition as the model wrote it, or `undefined` when nothing of it can be
 * carried: it is not an object, it names its value by nothing sayable, or the
 * wording would trip a screen.
 */
export function automationStudioResultReadConditionText(
  condition: JsonValue | undefined,
  columns: JsonObject | undefined,
  deniedKeys: readonly string[],
  seen?: JsonValue | undefined
): string | undefined {
  if (!isRecord(condition)) return undefined;
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  const named = subjectOf(condition, columns, denied);
  const found = named.ownRead ? foundText(seen, denied) : undefined;
  const subject = found ? `${named.text} (read ${found} on a row it kept)` : named.text;
  const relations = Object.entries(condition)
    .filter(([key, value]) => !NAMING_KEYS.has(key) && key !== "not" && value !== null && value !== undefined && WORD.test(key))
    .map(([key, value]) => `${key} ${operandText(key, value)}`);
  if (!relations.length) return undefined;
  const negated = condition.not === true ? "not " : "";
  const text = `${subject} ${negated}${relations.join(" and ")}`;
  const bounded = text.length <= MAX_CONDITION_LENGTH ? text : `${text.slice(0, MAX_CONDITION_LENGTH - 1)}…`;
  return sayable(bounded) ? bounded : undefined;
}

/**
 * What the condition tests: a column key, or its own read described without the
 * part that addresses the page -- and whether it is the latter, which is the
 * only subject a value the read found is said beside.
 */
function subjectOf(condition: JsonObject, columns: JsonObject | undefined, denied: ReadonlySet<string>): { text: string; ownRead: boolean } {
  const named = condition.field;
  if (typeof named === "string" && plainName(named, denied)) return { text: named, ownRead: false };
  const read = condition.read;
  if (!isRecord(read)) return { text: "a value", ownRead: false };
  const column = columns ? Object.entries(columns).find(([key, declared]) => plainName(key, denied) && sameRead(declared, read))?.[0] : undefined;
  if (column) return { text: column, ownRead: false };
  const kind = typeof read.kind === "string" && WORD.test(read.kind) ? read.kind : "value";
  const attribute = read.attribute;
  const text = kind === "attribute" && typeof attribute === "string" && plainName(attribute, denied) ? `attribute ${attribute}` : `the item's ${kind}`;
  return { text, ownRead: true };
}

/** A value the condition's read found, quoted and bounded, or `undefined` when there is none or it may not be said. */
function foundText(seen: JsonValue | undefined, denied: ReadonlySet<string>): string | undefined {
  if (typeof seen !== "string") return undefined;
  const trimmed = seen.trim();
  if (!trimmed || denied.has(automationStudioEvidenceKey(trimmed))) return undefined;
  const bounded = trimmed.length <= MAX_OPERAND_LENGTH ? trimmed : `${trimmed.slice(0, MAX_OPERAND_LENGTH - 1)}…`;
  return sayable(bounded) ? JSON.stringify(bounded) : undefined;
}

/** Whether a column's declaration and a condition's read address the same thing the same way. Whether either is required does not change what it reads. */
function sameRead(declared: JsonValue | undefined, read: JsonObject): boolean {
  return isRecord(declared) && canonical(withoutRequired(declared)) === canonical(withoutRequired(read));
}

function withoutRequired(value: JsonObject): JsonObject {
  const { required: _required, ...rest } = value;
  return rest;
}

function canonical(value: JsonValue | undefined): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

/** A relation's value as written: a number whole, a word bare after `is`, text quoted and screened, a list as a list. */
function operandText(key: string, value: JsonValue): string {
  if (Array.isArray(value)) {
    const shown = value.slice(0, MAX_OPERANDS).map((item) => scalarText(key, item));
    return `[${shown.join(", ")}${value.length > shown.length ? `, and ${value.length - shown.length} more` : ""}]`;
  }
  return scalarText(key, value);
}

function scalarText(key: string, value: JsonValue): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : WITHHELD_OPERAND;
  if (typeof value === "boolean") return String(value);
  if (typeof value !== "string") return WITHHELD_OPERAND;
  if (key === "is" && WORD.test(value)) return value;
  const bounded = value.length <= MAX_OPERAND_LENGTH ? value : `${value.slice(0, MAX_OPERAND_LENGTH - 1)}…`;
  return sayable(bounded) ? JSON.stringify(bounded) : WITHHELD_OPERAND;
}

/** A column key or an attribute name that may be said: plain, not a declared key, and through both screens. */
function plainName(name: string, denied: ReadonlySet<string>): boolean {
  return NAME.test(name) && !denied.has(automationStudioEvidenceKey(name)) && sayable(name);
}

function sayable(text: string): boolean {
  return !automationStudioLocatorShapedText(text) && !screenAutomationStudioLlmEvidence(text, []).secretShaped;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
