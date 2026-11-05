// Whether two rows are one row, whatever shape each reached the record in: the one rule (plan
// D2, D6; t869 and t870 merged, `docs/working/answer-first-plan/reports/attempt-road/same-row-merge.md`).
//
// **Why.** A row's identity is a digest of its own fields, so it holds only while the row reads
// the same. A by-hand read, a walker's pass and a Flow's For Each each hold a row differently:
// columns renamed or dropped, a field cut short or derived, a field the first read had not, an
// address written whole, or simply the first press having changed the row. Each is a new digest,
// and that row is pressed again. The rule leans one way: a row wrongly held done is left out and
// told, which a judge's no brings back; a row wrongly held not done is an act done twice.
//
// **The rule, on hashed words alone, whatever a column is called.**
//
//   1. Two rows of one read are never one row: the list itself says they are two.
//   2. A value must tie them. A bare number or a date ties nothing, since different rows share
//      those all the time; a word with a letter, a long id or an address does.
//   3. Where a read has shown either row, that list decides, per earlier read: the row that fits
//      best is that row, and rows that fit equally all are. A kept value may differ here, because
//      the row it came from is already told from the rest of its list, and the press may have
//      changed it. A fit is a field a row can be told by, whole enough, found in the other row's
//      words, or a shared address. A field more than one row of a read holds ("Pending" on every
//      row) tells no row from another, unless the row has nothing else, or the other has: a row
//      all of whose values lie in this one may be this one, whatever this one's list shares. A row
//      that fits nothing in an earlier list can still be found by elimination, since two rows of a
//      list are never one: rows of both lists that plainly match are set aside, and a row left over in the later list
//      is any row left over in the earlier one with most of its words the same. Where more than one
//      is left over, nothing can say which is which, so all of them are held: the answer is "cannot
//      tell", and a lasting act is refused on it rather than guessed.
//   4. Where no read has shown either (two rows only an act or a run carried), there is no list to
//      choose among, so all there is to go on is the values: every value of the row with fewer must
//      lie in the other. A kept value that differs says two rows. A run's own rows meet here, so
//      two of them with most words in common stay two.

import type { AutomationStudioAttemptActNotedRow as NotedRow } from "./contracts.ts";

/** How much of a field's words must be in the other row: an item's words may be cut short (`structure/item-row.ts`). */
const FIELD_WORDS_NEEDED = 0.6;
/** A shared address outweighs any words: rows of one list rarely share one that is not their own. */
const SHARED_ADDRESS_WEIGHT = 8;
/** Where a row in no counted read sits: all such rows are taken as one list. */
const UNCOUNTED_READ = -1;
/** How much of the longer of two rows left over must be the same words: one word they happen to share (a control's "Accept") says nothing. */
const LEFT_OVER_WORDS_NEEDED = 0.5;

type Field = NotedRow["fields"][number];

/** The rows of `rows` that are the same row as `carried` (header), itself apart. `carried.reads` is the reads it was seen in. */
export function automationStudioAttemptActSameRows(carried: NotedRow, rows: readonly NotedRow[]): string[] {
  const alongside = new Set(carried.reads ?? []);
  const best = new Map<number, { score: number; rows: string[] }>();
  const byValues: string[] = [];
  for (const row of rows) {
    const reads = row.reads ?? [UNCOUNTED_READ];
    if (row.row === carried.row || reads.some((read) => alongside.has(read))) continue;
    if (carried.reads === undefined && row.reads === undefined) {
      if (sameRow(valuesOf(carried), valuesOf(row))) byValues.push(row.row);
      continue;
    }
    const score = fitOf(carried, row);
    if (score === 0) continue;
    for (const read of reads) {
      const held = best.get(read);
      if (!held || score > held.score) best.set(read, { score, rows: [row.row] });
      else if (score === held.score) held.rows.push(row.row);
    }
  }
  return [...new Set([...byValues, ...[...best.values()].flatMap((held) => held.rows), ...byElimination(carried, rows, best)])];
}

/** For each earlier list `carried` fits nothing in, the rows of it `carried` may be, all of them where nothing can say which (header, 3). */
function byElimination(carried: NotedRow, rows: readonly NotedRow[], fitted: ReadonlyMap<number, unknown>): string[] {
  const seen = carried.reads ?? [];
  const newest = seen.at(-1);
  if (newest === undefined) return [];
  const later = rows.filter((row) => row.reads?.includes(newest));
  const earlierReads = new Set(rows.flatMap((row) => row.reads ?? []).filter((read) => !seen.includes(read) && !fitted.has(read)));
  const found: string[] = [];
  for (const read of earlierReads) {
    const earlier = rows.filter((row) => row.reads?.includes(read));
    if (!unmatched(later, earlier).some((left) => left.row === carried.row)) continue;
    found.push(...unmatched(earlier, later).filter((gone) => mostWordsShared(carried, gone)).map((gone) => gone.row));
  }
  return found;
}

/** The rows of `list` that plainly match none of `others`. */
function unmatched(list: readonly NotedRow[], others: readonly NotedRow[]): NotedRow[] {
  return list.filter((row) => !others.some((other) => other.row === row.row || fitOf(row, other) > 0));
}

function mostWordsShared(one: NotedRow, other: NotedRow): boolean {
  const words = wordsOf(one.fields);
  const otherWords = wordsOf(other.fields);
  const shared = [...words].filter((word) => otherWords.has(word)).length;
  return shared / Math.max(words.size, otherWords.size) >= LEFT_OVER_WORDS_NEEDED && one.fields.some((field) => field.lettered.some((word) => otherWords.has(word)));
}

/** A row's values, whatever key holds each, and whether each ties two rows (header, 2). */
function valuesOf(row: NotedRow): Map<string, boolean> {
  const values = new Map<string, boolean>();
  for (const field of row.fields) {
    const value = `words:${field.words.join(" ")}`;
    values.set(value, values.get(value) === true || field.lettered.length > 0);
  }
  for (const path of row.paths) values.set(`path:${path}`, true);
  return values;
}

/** Whether every value of the row with fewer lies in the other, one of them tying them (header, 4). */
function sameRow(one: ReadonlyMap<string, boolean>, other: ReadonlyMap<string, boolean>): boolean {
  const [fewer, more] = one.size <= other.size ? [one, other] : [other, one];
  let proven = false;
  for (const [value, proves] of fewer) {
    if (!more.has(value)) return false;
    proven ||= proves || more.get(value) === true;
  }
  return proven;
}

/** Whether every value of the row with fewer lies in the other, whatever either's list says (header, 4). A handle a read printed asks this of a row no read has shown (`./row-ties.ts`). */
export function automationStudioAttemptActSameValues(one: NotedRow, other: NotedRow): boolean {
  return sameRow(valuesOf(one), valuesOf(other));
}

/** How well `row` fits `carried`: 0 where it does not (header, 3). Bare numbers count towards which fits best, never towards whether one fits. */
function fitOf(carried: NotedRow, row: NotedRow): number {
  const fromCarried = tellingFields(carried);
  const carriedWords = wordsOf(fromCarried);
  const rowWords = wordsOf(row.fields);
  const addresses = tellingPaths(carried).filter((path) => tellingPaths(row).includes(path)).length;
  if (addresses > 0 || fromCarried.some((field) => fieldFits(field, rowWords)) || tellingFields(row).some((field) => fieldFits(field, carriedWords))) return [...carriedWords].filter((word) => rowWords.has(word)).length + addresses * SHARED_ADDRESS_WEIGHT;
  // What tells `carried` is not in `row`, and all `row` says is in `carried`: `row` has nothing else to be told by.
  return automationStudioAttemptActSameValues(carried, row) ? Math.max(1, [...wordsOf(carried.fields)].filter((word) => rowWords.has(word)).length) : 0;
}

/** The fields a row can be told by: all of them where nothing else tells it (header, 3). */
function tellingFields(row: NotedRow): readonly Field[] {
  const telling = row.fields.filter((field) => field.common !== true);
  return telling.length > 0 || tellingPaths(row).length > 0 ? telling : row.fields;
}

function tellingPaths(row: NotedRow): readonly string[] {
  return row.paths.filter((path) => !row.commonPaths?.includes(path));
}

function wordsOf(fields: readonly Field[]): ReadonlySet<string> {
  return new Set(fields.flatMap((field) => field.words));
}

function fieldFits(field: Field, words: ReadonlySet<string>): boolean {
  const found = field.words.filter((word) => words.has(word)).length;
  return found / field.words.length >= FIELD_WORDS_NEEDED && field.lettered.some((word) => words.has(word));
}
