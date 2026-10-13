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
// is present` -- whole, and withheld entirely when it would trip either screen
// or is a key the domain denies.
//
// **And when it names a column the answer does not store.** A condition over a
// stored column says no value: the column's own values are the rows. A column
// read only to filter by reaches no row -- the stored schema leaves it out, and
// the domain takes it out of the read the page runs -- so its values reach the
// judge nowhere else. Run `run-mv5jnc51-9eac63f2` filtered on `plus is present`
// over such a column; its judges saw that, eight `attribute absent` witnesses
// and no value read on a kept row, and three times refuted an exact answer as a
// broken read. So a column the caller says is not stored is said with its value
// exactly as a read of its own is: `plus (read "…" on a row it kept) is present`.
// Where the caller does not say which columns are stored, every column is taken
// as stored and nothing changes.
//
// **And a presence test of its own read says what it looks for (t482, N3).**
// A condition that keeps only the rows lacking something, over a read no
// column makes and no attribute names, was said `the item's text is absent`,
// which names neither what is absent nor that the rest of the item is not
// tested. Lane D round 12 (`run-mv636xyp-2e4fe54d`) kept the requests that no
// longer had their accept control that way, and both trial judges called the
// result fragile. Such a condition is now said by the words its read found on
// a row it left out (`leftOutSeen`, screened like the left-out rows):
// `the item's text "Accept" is absent (a row is kept only when it has no
// "Accept")`. With no such word it is said as before.
//
// **What is said about it.** Every other key of the condition is a relation the
// model wrote, spelled as it wrote it (the domain's reader accepts several
// spellings, and translating them here would be Core learning a grammar it does
// not own), with the value it wrote. Numbers are carried whole. A string is
// carried whole, as is every value of a list, and refused -- replaced by a
// marker -- when it is shaped like a credential or like a way to address an
// element, the same two screens every other authored string in a request
// passes. `not: true` is said as `not`.
//
// **Nothing is cut** (user, 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER
// OF ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION"): no wording, value or
// list length bound, and no length bound on a relation word or a name.
//
// Without the bound domain's declared keys nothing authored is carried at all:
// an absent declaration means nobody said, never "deny nothing".

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioEvidenceKey, automationStudioLocatorShapedText, screenAutomationStudioLlmEvidence } from "../../llm/index.ts";

/** Keys that name the value a condition tests, rather than saying something about it. */
const NAMING_KEYS = new Set(["field", "read"]);
/** What a compared value that could not be carried reads as. */
const WITHHELD_OPERAND = "(withheld)";
/** A relation key or a kind word: plain letters, as a grammar spells them. */
const WORD = /^[A-Za-z][A-Za-z_]*$/u;
/** A column key or an item attribute's name. */
const NAME = /^[A-Za-z_][\w-]*$/u;

/**
 * The condition as the model wrote it, or `undefined` when nothing of it can be
 * carried: it is not an object, it names its value by nothing sayable, or the
 * wording would trip a screen.
 */
export function automationStudioResultReadConditionText(
  condition: JsonValue | undefined,
  columns: JsonObject | undefined,
  deniedKeys: readonly string[],
  seen?: JsonValue | undefined,
  stored?: ReadonlySet<string> | undefined,
  leftOutSeen?: JsonValue | undefined
): string | undefined {
  if (!isRecord(condition)) return undefined;
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  const named = subjectOf(condition, columns, denied);
  const lacking = lackingText(condition, named, leftOutSeen, denied);
  if (lacking) return lacking;
  const unstored = named.column !== undefined && stored !== undefined && !stored.has(named.column);
  const found = named.ownRead || unstored ? foundText(seen, denied) : undefined;
  const subject = found ? `${named.text} (read ${found} on a row it kept)` : named.text;
  const relations = Object.entries(condition)
    .filter(([key, value]) => !NAMING_KEYS.has(key) && key !== "not" && value !== null && value !== undefined && WORD.test(key))
    .map(([key, value]) => `${key} ${operandText(key, value)}`);
  if (!relations.length) return undefined;
  const negated = condition.not === true ? "not " : "";
  const text = `${subject} ${negated}${relations.join(" and ")}`;
  return sayable(text) ? text : undefined;
}

/**
 * The column of the read a condition tests, as the row it left out is keyed:
 * its `field`, or the column whose declared read is the condition's own read
 * (the comparison `subjectOf` names it by). `undefined` for a condition whose
 * read no column makes, which tests a value no row carries. Not screened: the
 * caller says the column only through the screen a row's cells pass
 * (`alone-rows.ts`).
 */
export function automationStudioResultReadConditionColumn(condition: JsonValue | undefined, columns: JsonObject | undefined): string | undefined {
  if (!isRecord(condition)) return undefined;
  if (typeof condition.field === "string") return condition.field;
  const read = condition.read;
  if (!isRecord(read) || !columns) return undefined;
  return Object.entries(columns).find(([, declared]) => sameRead(declared, read))?.[0];
}

/**
 * What the condition tests: a column key, or its own read described without the
 * part that addresses the page -- and whether it is the latter, or which column
 * it is, which decide whether a value the read found is said beside it.
 */
function subjectOf(condition: JsonObject, columns: JsonObject | undefined, denied: ReadonlySet<string>): { text: string; ownRead: boolean; column?: string; generic?: string } {
  const named = condition.field;
  if (typeof named === "string" && plainName(named, denied)) return { text: named, ownRead: false, column: named };
  const read = condition.read;
  if (!isRecord(read)) return { text: "a value", ownRead: false };
  const column = columns ? Object.entries(columns).find(([key, declared]) => plainName(key, denied) && sameRead(declared, read))?.[0] : undefined;
  if (column) return { text: column, ownRead: false, column };
  const kind = typeof read.kind === "string" && WORD.test(read.kind) ? read.kind : "value";
  const attribute = read.attribute;
  if (kind === "attribute" && typeof attribute === "string" && plainName(attribute, denied)) return { text: `attribute ${attribute}`, ownRead: true };
  // Named by nothing of its own: `generic` says so, for a presence test said by what it found (`lackingText`).
  return { text: `the item's ${kind}`, ownRead: true, generic: `the item's ${kind}` };
}

/**
 * A condition that keeps the rows lacking what its own read finds -- `is:
 * absent` over a read no column makes and no attribute names, and nothing else
 * -- said by the word that read found on a row it left out (header);
 * `undefined` for any other condition, or where no such word may be said.
 */
function lackingText(condition: JsonObject, named: { ownRead: boolean; generic?: string }, leftOutSeen: JsonValue | undefined, denied: ReadonlySet<string>): string | undefined {
  if (!named.ownRead || named.generic === undefined || condition.is !== "absent" || condition.not === true) return undefined;
  const relations = Object.keys(condition).filter((key) => !NAMING_KEYS.has(key) && key !== "not" && condition[key] !== null && condition[key] !== undefined);
  if (relations.length !== 1) return undefined;
  const found = foundText(leftOutSeen, denied);
  if (!found) return undefined;
  const text = `${named.generic} ${found} is absent (a row is kept only when it has no ${found})`;
  return sayable(text) ? text : undefined;
}

/** A value the condition's read found, quoted and whole, or `undefined` when there is none or it may not be said. */
function foundText(seen: JsonValue | undefined, denied: ReadonlySet<string>): string | undefined {
  if (typeof seen !== "string") return undefined;
  const trimmed = seen.trim();
  if (!trimmed || denied.has(automationStudioEvidenceKey(trimmed))) return undefined;
  return sayable(trimmed) ? JSON.stringify(trimmed) : undefined;
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
    return `[${value.map((item) => scalarText(key, item)).join(", ")}]`;
  }
  return scalarText(key, value);
}

function scalarText(key: string, value: JsonValue): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : WITHHELD_OPERAND;
  if (typeof value === "boolean") return String(value);
  if (typeof value !== "string") return WITHHELD_OPERAND;
  if (key === "is" && WORD.test(value)) return value;
  return sayable(value) ? JSON.stringify(value) : WITHHELD_OPERAND;
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
