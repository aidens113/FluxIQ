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
// **A later read is tied the same way.** The sentence naming a by-hand press is kept, and each
// new read's rows are held against it (`note`, `ofWords`), so a Flow's read of quite different
// columns still finds the row the press named. Here a word most of that read shares does not
// count: every remaining row saying "Accept" is not the row an "Accept" was pressed on.
//
// **A row a pass carries is matched by its words too (`./same-row.ts`).** It may read differently
// from the read that noted the press, and that must not read as another row.
//
// **Nothing here is kept in the clear.** A row's words and addresses are hashed, so what
// is persisted beside a Flow holds no page text, and one read can still be matched
// against a sentence that came before it.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioAttemptActNotedRow } from "./contracts.ts";
import { automationStudioAttemptActDigest, automationStudioAttemptActRowIdentity } from "./identity/index.ts";
import { automationStudioAttemptActSameRows } from "./same-row.ts";

/** The most rows held: far past any read, and short of a record that outgrows its file. */
const MOST_ROWS = 5_000;
/** How much of a field's words must be in a sentence: an item's words may be cut short (`structure/item-row.ts`). */
const FIELD_WORDS_NEEDED = 0.6;
const HASH_LENGTH = 16;
const MINTED_HANDLE = /^\$|handle/iu;
const ADDRESS_OR_PATH = /^(?:[a-z][a-z\d+.-]*:\/\/|\/)/iu;
const WORD = /[\p{L}\p{N}]+/gu;
/** A number this long is an id a person tells a row by: too long to be a count or a place on a page. */
const ID_NUMBER = /^\p{N}{6,}$/u;
/** How many reads a row remembers: two rows of a read further back than this are compared as any two are. */
const MOST_READS_KEPT = 8;

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

  /** Holds `rows`, the rows of one read, the newest kept where they run past the bound (`MOST_ROWS`). Answers the digests of the rows it read. */
  note(rows: readonly JsonObject[]): string[] {
    const read = this.rows.reduce((newest, row) => Math.max(newest, ...(row.reads ?? [])), 0) + 1;
    const batch = rows.flatMap((row) => notedRow(row) ?? []);
    markCommon(batch);
    const merged = new Map(this.rows.map((row) => [row.row, row]));
    for (const noted of batch) {
      const known = merged.get(noted.row);
      merged.set(noted.row, withRead(known ? mergedRow(known, noted) : noted, read));
    }
    this.rows = [...merged.values()].slice(-MOST_ROWS);
    return batch.map((row) => row.row);
  }

  /** The digests `row` answers to: its own, and those of the rows earlier reads noted that are the same row (`./same-row.ts`). None for a row that can be told from no other. */
  sameAs(row: JsonObject): string[] {
    const carried = notedRow(row);
    if (!carried) return [];
    return [carried.row, ...automationStudioAttemptActSameRows(this.rows.find((known) => known.row === carried.row) ?? carried, this.rows)];
  }

  /** The rows that printed `handle`. */
  ofHandle(handle: string): string[] {
    return this.rows.filter((row) => row.handles.includes(handle)).map((row) => row.row);
  }

  /** The rows whose address is this hashed path. */
  ofPath(path: string): string[] {
    return this.rows.filter((row) => row.paths.includes(path)).map((row) => row.row);
  }

  /** Every row whose own words best fit a sentence's hashed words, none where no row's fit (header). `among`: only those of one read, by what tells its rows apart. */
  ofWords(sentence: readonly string[], among?: readonly string[]): string[] {
    const words = new Set(sentence);
    const within = among === undefined ? undefined : new Set(among);
    let best = 0;
    let found: string[] = [];
    for (const row of this.rows) {
      if (within && !within.has(row.row)) continue;
      const score = fitOf(row, words, within !== undefined);
      if (score === 0 || score < best) continue;
      if (score > best) {
        best = score;
        found = [];
      }
      found.push(row.row);
    }
    return found;
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
  if (typeof value !== "string" && typeof value !== "number") return;
  const text = String(value);
  if (MINTED_HANDLE.test(key)) {
    if (text) noted.handles.push(text);
    return;
  }
  const path = AutomationStudioAttemptActRowTies.pathOf(text);
  if (path) {
    noted.paths.push(path);
    return;
  }
  const words = text.toLowerCase().match(WORD) ?? [];
  if (words.length > 0) noted.fields.push({ words: words.map(hashed), lettered: words.filter((word) => /\p{L}/u.test(word) || ID_NUMBER.test(word)).map(hashed) });
}

const fieldKey = (field: { words: readonly string[] }) => field.words.join(" ");

/** Marks what more than one row of a read holds (`./same-row.ts`). A read of one row can say nothing of it. */
function markCommon(batch: AutomationStudioAttemptActNotedRow[]): void {
  const seen = new Map<string, number>();
  for (const row of batch) {
    for (const key of new Set([...row.fields.map(fieldKey), ...row.paths])) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const row of batch) {
    for (const field of row.fields) if ((seen.get(fieldKey(field)) ?? 0) > 1) field.common = true;
    const commonPaths = row.paths.filter((path) => (seen.get(path) ?? 0) > 1);
    if (commonPaths.length > 0) row.commonPaths = commonPaths;
  }
}

/** A row seen again: what either read said of it. A field common in any read tells no row from another. */
function mergedRow(known: AutomationStudioAttemptActNotedRow, noted: AutomationStudioAttemptActNotedRow): AutomationStudioAttemptActNotedRow {
  const common = new Set(noted.fields.filter((field) => field.common).map(fieldKey));
  const commonPaths = [...new Set([...(known.commonPaths ?? []), ...(noted.commonPaths ?? [])])];
  return {
    ...known,
    handles: [...new Set([...known.handles, ...noted.handles])],
    fields: known.fields.map((field) => common.has(fieldKey(field)) ? { ...field, common: true as const } : field),
    ...(commonPaths.length > 0 ? { commonPaths } : {})
  };
}

function withRead(row: AutomationStudioAttemptActNotedRow, read: number): AutomationStudioAttemptActNotedRow {
  return { ...row, reads: [...(row.reads ?? []), read].slice(-MOST_READS_KEPT) };
}

/**
 * How many of a row's words fit, counting only fields that fit whole enough and with a
 * word with a letter in the sentence. A sentence names an item's place too ("item 2/3"),
 * so a field of bare numbers fits by accident, and would pick the wrong one of two rows
 * only it tells apart, leaving the right one held not done.
 */
function fitOf(row: AutomationStudioAttemptActNotedRow, words: ReadonlySet<string>, tellingOnly = false): number {
  let score = 0;
  for (const field of row.fields) {
    if (tellingOnly && field.common === true) continue;
    const inSentence = field.words.filter((word) => words.has(word)).length;
    if (inSentence / field.words.length < FIELD_WORDS_NEEDED || !field.lettered.some((word) => words.has(word))) continue;
    score += inSentence;
  }
  return score;
}
