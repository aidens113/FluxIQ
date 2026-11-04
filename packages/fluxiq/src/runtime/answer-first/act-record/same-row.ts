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
//      row) tells no row from another, unless the row has nothing else.
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
  return [...new Set([...byValues, ...[...best.values()].flatMap((held) => held.rows)])];
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

/** How well `row` fits `carried`: 0 where it does not (header, 3). Bare numbers count towards which fits best, never towards whether one fits. */
function fitOf(carried: NotedRow, row: NotedRow): number {
  const fromCarried = tellingFields(carried);
  const carriedWords = wordsOf(fromCarried);
  const rowWords = wordsOf(row.fields);
  const addresses = tellingPaths(carried).filter((path) => tellingPaths(row).includes(path)).length;
  if (addresses === 0 && !fromCarried.some((field) => fieldFits(field, rowWords)) && !tellingFields(row).some((field) => fieldFits(field, carriedWords))) return 0;
  return [...carriedWords].filter((word) => rowWords.has(word)).length + addresses * SHARED_ADDRESS_WEIGHT;
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
