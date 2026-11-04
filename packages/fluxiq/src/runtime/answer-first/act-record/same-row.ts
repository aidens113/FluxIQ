// Which rows a read already showed are the same row as one a pass carries (t869; plan D2, D6).
//
// **The defect this closes.** A row's identity is a digest of its own fields, so it holds
// only while the row reads the same. The model reads a list, presses the first row by hand,
// and the loop then carries what the Flow's own read returned. Renamed or fewer columns, a
// field cut short or derived, a field the first read had not, or simply the first press having
// changed the row (a due date moved on, a status now says accepted): each is a new digest, and
// that row is pressed again.
//
// **The rule, on hashed words alone.** Two rows of one read are never the same row: the list
// itself says they are two. Otherwise, per earlier read, the row that fits a carried row best is
// that row, and where several fit equally every one is (`./row-ties.ts`, the bias: a row wrongly
// held done is left out and told, which a judge's no brings back; a row wrongly held not done is
// an act done twice).
//
// **What fits.** A field a row can be told by, whole enough and with a word that is no bare
// number, found in the other row's words whatever its column is called; or a shared address. A
// field most of a read shares ("Pending" on every row) tells no row from another, so it fits
// nothing. A row with no other field keeps it: such a row can only be told by what it has.
//
// Bare numbers count towards which row fits best, and never towards whether one fits: two rows
// of one person's list differ by a date, and one date is in every other row's words by accident.

import type { AutomationStudioAttemptActNotedRow as NotedRow } from "./contracts.ts";

/** How much of a field's words must be in the other row: an item's words may be cut short (`structure/item-row.ts`). */
const FIELD_WORDS_NEEDED = 0.6;
/** A shared address outweighs any words: rows of one list rarely share one that is not their own. */
const SHARED_ADDRESS_WEIGHT = 8;
/** Where a row kept from before reads were counted sits: all such rows are taken as one read. */
const UNCOUNTED_READ = -1;

type Field = NotedRow["fields"][number];

/** The rows of `rows` that are the same row as `carried` (header), itself apart. `carried.reads` is the reads it was seen in. */
export function automationStudioAttemptActSameRows(carried: NotedRow, rows: readonly NotedRow[]): string[] {
  const alongside = new Set(carried.reads ?? []);
  const best = new Map<number, { score: number; rows: string[] }>();
  for (const row of rows) {
    const reads = row.reads ?? [UNCOUNTED_READ];
    if (row.row === carried.row || reads.some((read) => alongside.has(read))) continue;
    const score = fitOf(carried, row);
    if (score === 0) continue;
    for (const read of reads) {
      const held = best.get(read);
      if (!held || score > held.score) best.set(read, { score, rows: [row.row] });
      else if (score === held.score) held.rows.push(row.row);
    }
  }
  return [...new Set([...best.values()].flatMap((held) => held.rows))];
}

/** How well `row` fits `carried`: 0 where it does not (header). */
function fitOf(carried: NotedRow, row: NotedRow): number {
  const fromCarried = tellingFields(carried);
  const carriedWords = wordsOf(fromCarried);
  const rowWords = wordsOf(row.fields);
  const addresses = tellingPaths(carried).filter((path) => tellingPaths(row).includes(path)).length;
  if (addresses === 0 && !fromCarried.some((field) => fieldFits(field, rowWords)) && !tellingFields(row).some((field) => fieldFits(field, carriedWords))) return 0;
  return [...carriedWords].filter((word) => rowWords.has(word)).length + addresses * SHARED_ADDRESS_WEIGHT;
}

/** The fields a row can be told by: all of them where nothing else tells it (header). */
function tellingFields(row: NotedRow): readonly Field[] {
  const telling = row.fields.filter((field) => field.common !== true);
  return telling.length > 0 ? telling : row.fields;
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
