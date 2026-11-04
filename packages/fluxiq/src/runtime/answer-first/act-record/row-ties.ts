// Which row a by-hand press belongs to (plan D2, D6).
//
// D2's whole shape is that the model does the first row by hand, writes the loop and
// runs it on the rest. The rest is "every row not done", so the first row must be
// known done, and a by-hand press names a control, not a row. Missing this tie is a
// lasting act done twice on exactly the path the plan is built on.
//
// **What the real answers offer (web domain).** Three ties, tried in this order:
//
//   1. A handle printed in the row (`noteReadRows`), for a domain whose rows print one.
//      The web domain's do not today, and the record must not depend on it.
//   2. The answer's own sentence naming the item it acted on (`actedOn`,
//      `node-run/press-effect/acted-on.ts`). It is read for the row's own words, never
//      its place.
//   3. The page the act was made on: an act on a row's own page, opened by the row's
//      link, is that row's. A press on an item's own page has no list item to name.
//
// **When a sentence cannot tell rows apart, every row it fits is marked.** A row wrongly
// held done is a row the forward run leaves out, which a judge's no brings back by hand.
// A row wrongly held not done is a lasting act done twice.
//
// **Nothing here is kept in the clear.** A row's words and addresses are hashed, so what
// is persisted beside a Flow holds no page text, and one read can still be matched
// against a sentence that came before it.
//
// **The same row in another shape (`sameAs`, t870).** A by-hand read, a walker's pass and a
// Flow's For Each each hold one row differently: keys renamed by a record output, a column
// dropped, a handle minted, an address written whole or from the page's origin, a number
// read back from text. So two rows are compared by their values, whatever key holds them:
// they are the same row when every value of the one with fewer lies in the other, and a
// value they share proves it, one with a letter in it or an address. A bare number or a
// date proves nothing, since two different rows share those all the time. A kept column
// that differs is a value that does not lie in the other, so those stay two rows.
//
// This leans the way the rule above does. A row with few columns left fits every row
// holding those values, and it is then held done if any of them was acted on. What it cannot
// see: a value written differently in the two shapes ("Nov 4" against "2026-11-04"), a
// column split or merged, two rows sharing every value, and a row whose every value is a
// bare number under renamed keys, which only an exact identity tells.
//
// **Words about a control, before it is pressed (`ofControlWords`, t870).** The domain can say
// what a call names before it is sent, and those words are read as an answer's sentence is. They
// are about a control rather than an item, so words every row holds (a column repeating the
// control's own name) name no row at all: held as naming all of them, one acted row would refuse
// a press on every other.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioAttemptActNotedRow } from "./contracts.ts";
import { automationStudioAttemptActDigest, automationStudioAttemptActRowIdentity } from "./identity/index.ts";

/** The most rows held: far past any read, and short of a record that outgrows its file. */
const MOST_ROWS = 5_000;
/** How much of a field's words must be in a sentence: an item's words may be cut short (`structure/item-row.ts`). */
const FIELD_WORDS_NEEDED = 0.6;
const HASH_LENGTH = 16;
const MINTED_HANDLE = /^\$|handle/iu;
/** An evidence reference is minted per read as a handle is (`./identity/fields.ts`), and no call names one. */
const MINTED_REFERENCE = /evidence/iu;
/** A value that is one number, whatever marks it: read back from text, `1,299.00` and `1299` are one value. */
const ONE_NUMBER = /^[^\p{L}\p{N}]*\d[\d,]*(?:\.\d+)?[^\p{L}\p{N}]*$/u;
const ADDRESS_OR_PATH = /^(?:[a-z][a-z\d+.-]*:\/\/|\/)/iu;
const WORD = /[\p{L}\p{N}]+/gu;

const hashed = (text: string) => automationStudioAttemptActDigest(text).slice(0, HASH_LENGTH);

export class AutomationStudioAttemptActRowTies {
  private rows: AutomationStudioAttemptActNotedRow[];

  constructor(rows: readonly AutomationStudioAttemptActNotedRow[] = []) {
    this.rows = [...rows];
  }

  /** The hashed words of a sentence, for comparing with a row's. */
  static wordsOf(sentence: string): string[] {
    return [...new Set((sentence.toLowerCase().match(WORD) ?? []).map(hashed))];
  }

  /** The hashed path of an address, trailing slash and origin aside; none for what is no address. */
  static pathOf(address: string): string | undefined {
    const trimmed = address.trim();
    if (!ADDRESS_OR_PATH.test(trimmed)) return undefined;
    return hashed(trimmed.replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]+/iu, "").replace(/#.*$/u, "").replace(/\/+$/u, "") || "/");
  }

  /** Holds `rows`, the newest kept where they run past the bound (`MOST_ROWS`), and `acted` kept always: a row an act is on is what stops it happening twice. */
  note(rows: readonly JsonObject[], acted: ReadonlySet<string> = new Set()): void {
    const merged = new Map(this.rows.map((row) => [row.row, row]));
    for (const row of rows) {
      const noted = notedRow(row);
      if (!noted) continue;
      const known = merged.get(noted.row);
      merged.set(noted.row, known ? { ...known, handles: [...new Set([...known.handles, ...noted.handles])] } : noted);
    }
    let over = merged.size - MOST_ROWS;
    this.rows = [...merged.values()].filter((row) => {
      if (over <= 0 || acted.has(row.row)) return true;
      over -= 1;
      return false;
    });
  }

  /** Which of `among` are this same row in another shape (header). */
  sameAs(row: JsonObject, among: ReadonlySet<string>): string[] {
    if (among.size === 0) return [];
    const noted = notedRow(row);
    if (!noted) return [];
    const values = valuesOf(noted);
    return this.rows.filter((held) => among.has(held.row) && sameRow(values, valuesOf(held))).map((held) => held.row);
  }

  /** Which of `among` are these held rows in another shape: a handle a read printed names the row as that read held it, and a run may have acted on it as a Flow's For Each holds it. */
  sameAsHeld(rows: readonly string[], among: ReadonlySet<string>): string[] {
    if (among.size === 0 || rows.length === 0) return [];
    const named = this.rows.filter((held) => rows.includes(held.row)).map(valuesOf);
    return this.rows.filter((held) => among.has(held.row) && named.some((values) => sameRow(values, valuesOf(held)))).map((held) => held.row);
  }

  /** The rows that printed `handle`. */
  ofHandle(handle: string): string[] {
    return this.rows.filter((row) => row.handles.includes(handle)).map((row) => row.row);
  }

  /** The rows whose address is this hashed path. */
  ofPath(path: string): string[] {
    return this.rows.filter((row) => row.paths.includes(path)).map((row) => row.row);
  }

  /** Every row whose own words best fit a sentence's hashed words, none where no row's fit (header). */
  ofWords(sentence: readonly string[]): string[] {
    const words = new Set(sentence);
    let best = 0;
    let found: string[] = [];
    for (const row of this.rows) {
      const score = fitOf(row, words);
      if (score === 0 || score < best) continue;
      if (score > best) {
        best = score;
        found = [];
      }
      found.push(row.row);
    }
    return found;
  }

  /** `ofWords`, for words about a control: none where they fit every row and there is more than one row to tell apart (header). */
  ofControlWords(sentence: readonly string[]): string[] {
    const found = this.ofWords(sentence);
    if (found.length < 2 || found.length < this.rows.length) return found;
    const first = valuesOf(this.rows[0]!);
    return this.rows.every((row) => sameRow(first, valuesOf(row))) ? found : [];
  }

  data(): AutomationStudioAttemptActNotedRow[] {
    return structuredClone(this.rows);
  }
}

/** One row as the record holds it, or none for a row that can be told from no other. */
function notedRow(row: JsonObject): AutomationStudioAttemptActNotedRow | undefined {
  const identity = automationStudioAttemptActRowIdentity(row);
  if (identity === undefined) return undefined;
  const noted: AutomationStudioAttemptActNotedRow = { row: identity, handles: [], fields: [], paths: [] };
  for (const [key, value] of Object.entries(row)) noteValue(noted, key, value);
  return noted;
}

function noteValue(noted: AutomationStudioAttemptActNotedRow, key: string, value: JsonValue | undefined): void {
  if (Array.isArray(value)) {
    for (const item of value) noteValue(noted, key, item);
    return;
  }
  if (value && typeof value === "object") {
    for (const [inner, item] of Object.entries(value)) noteValue(noted, inner, item);
    return;
  }
  if (typeof value === "boolean") {
    // Tells two rows apart as any value does, and is no word on the page: no sentence fits it and it proves nothing.
    if (!MINTED_HANDLE.test(key) && !MINTED_REFERENCE.test(key)) noted.fields.push({ words: [hashed(String(value))], lettered: [] });
    return;
  }
  if (typeof value !== "string" && typeof value !== "number") return;
  const text = String(value);
  if (MINTED_HANDLE.test(key)) {
    if (text) noted.handles.push(text);
    return;
  }
  if (MINTED_REFERENCE.test(key)) return;
  const path = AutomationStudioAttemptActRowTies.pathOf(text);
  if (path) {
    noted.paths.push(path);
    return;
  }
  const words = plainNumber(text).toLowerCase().match(WORD) ?? [];
  if (words.length > 0) noted.fields.push({ words: words.map(hashed), lettered: words.filter((word) => /\p{L}/u.test(word)).map(hashed) });
}

/** A value that is one number as that number's own writing (`ONE_NUMBER`); anything else, or one too long to read exactly, as it stands. */
function plainNumber(text: string): string {
  if (!ONE_NUMBER.test(text)) return text;
  const number = Number(text.replace(/[^\d.]/gu, ""));
  return Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER ? String(number) : text;
}

/** A row's values, whatever key holds each, and whether each proves two rows the same (header). */
function valuesOf(row: AutomationStudioAttemptActNotedRow): Map<string, boolean> {
  const values = new Map<string, boolean>();
  for (const field of row.fields) {
    const value = `words:${field.words.join(" ")}`;
    values.set(value, values.get(value) === true || field.lettered.length > 0);
  }
  for (const path of row.paths) values.set(`path:${path}`, true);
  return values;
}

/** Whether every value of the row with fewer lies in the other, one of them proving it (header). */
function sameRow(one: ReadonlyMap<string, boolean>, other: ReadonlyMap<string, boolean>): boolean {
  const [fewer, more] = one.size <= other.size ? [one, other] : [other, one];
  let proven = false;
  for (const [value, proves] of fewer) {
    if (!more.has(value)) return false;
    proven ||= proves || more.get(value) === true;
  }
  return proven;
}

/**
 * How many of a row's words fit, counting only fields that fit whole enough and with a
 * word with a letter in the sentence. A sentence names an item's place too ("item 2/3"),
 * so a field of bare numbers fits by accident, and would pick the wrong one of two rows
 * only it tells apart, leaving the right one held not done.
 */
function fitOf(row: AutomationStudioAttemptActNotedRow, words: ReadonlySet<string>): number {
  let score = 0;
  for (const field of row.fields) {
    const inSentence = field.words.filter((word) => words.has(word)).length;
    if (inSentence / field.words.length < FIELD_WORDS_NEEDED || !field.lettered.some((word) => words.has(word))) continue;
    score += inSentence;
  }
  return score;
}
