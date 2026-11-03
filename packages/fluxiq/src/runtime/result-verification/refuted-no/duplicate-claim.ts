// A no's claim that rows the result holds are one and the same (t607).
//
// **Why.** A8 everything-store `run-mv8p0p7c-c8412344`, whole test 2: both
// judges, on byte-identical requests, said two stored listings were "the same
// pair" -- two rows whose names and urls differ -- and the double no refuted a
// Flow that stored exactly the rows asked for. The repair then split a dedupe
// into a subflow of its own that had nothing to fix.
//
// **What Core holds.** Every stored row by its cells, and how many rows the
// answer's own dedupe removed as repeating an earlier one. A sentence that
// calls two or more named stored rows the same item, duplicates or one listed
// twice, or says they share a name, is refuted when every pair of them differs
// in its label and in another column Core stored -- each row is its own -- and
// no other stored row repeats one of them cell for cell. A claim naming fewer
// than two stored rows, or a row Core cannot find, is not one Core can check.

import type { AutomationStudioResultNoClaim, AutomationStudioResultNoNamedRows, AutomationStudioResultNoRecord, AutomationStudioResultNoStoredRow } from "./types.ts";

/** Words that call rows one and the same: generic, never any site's. */
const SAME = /\b(?:is|are|be|being)\s+(?:the\s+|one\s+and\s+the\s+)?same\b|\bsame\s+(?:pair|item|product|listing|row|record|thing|one|model|entry|article|offer)\b|\bduplicat\w*|\b(?:listed|appears?|stored|included|counted|kept)\s+twice\b|\bshare\s+(?:the\s+|a\s+)?(?:same\s+)?(?:name|title|label)\b|\bsame\s+(?:name|title|label)\b|\bidentical\b|\brepeat(?:s|ed)?\b/iu;

/** The claim a sentence makes that named stored rows are one (header); nothing where it makes none. */
export function automationStudioResultDuplicateClaim(sentence: string, named: AutomationStudioResultNoNamedRows, record: AutomationStudioResultNoRecord): AutomationStudioResultNoClaim | undefined {
  if (!SAME.test(sentence)) return undefined;
  const rows = named.stored;
  // Naming no row at all, the sentence's words rest on another's: nothing here to check.
  if (!rows.length && !named.leftOut.length && !named.unmatched) return undefined;
  if (rows.length < 2 || named.unmatched || named.leftOut.length > 0) return { refuted: false };
  const differ: string[][] = [];
  for (let one = 0; one < rows.length; one += 1) {
    for (let other = one + 1; other < rows.length; other += 1) {
      const columns = differingColumns(rows[one]!, rows[other]!);
      if (rows[one]!.label === rows[other]!.label || columns.length < Math.min(2, columnCount(rows[one]!, rows[other]!))) return { refuted: false };
      differ.push(columns);
    }
  }
  // A row another stored row repeats cell for cell is a duplicate after all.
  if (rows.some((row) => record.stored.filter((otherRow) => sameCells(row, otherRow)).length > 1)) return { refuted: false };
  const columns = [...new Set(differ.flat())];
  const removed = record.duplicatesRemoved > 0
    ? `; the answer's own dedupe had already removed ${record.duplicatesRemoved} row${record.duplicatesRemoved === 1 ? "" : "s"} that repeated an earlier one`
    : "";
  return {
    refuted: true,
    finding: `Core stored ${rows.map((row) => `"${row.label}"`).join(" and ")} as ${rows.length === 2 ? "two" : rows.length} separate rows, which differ in ${columns.join(" and ")}${removed}.`
  };
}

function differingColumns(one: AutomationStudioResultNoStoredRow, other: AutomationStudioResultNoStoredRow): string[] {
  const columns = [...new Set([...Object.keys(one.cells), ...Object.keys(other.cells)])];
  return columns.filter((column) => (one.cells[column] ?? "") !== (other.cells[column] ?? ""));
}

function columnCount(one: AutomationStudioResultNoStoredRow, other: AutomationStudioResultNoStoredRow): number {
  return new Set([...Object.keys(one.cells), ...Object.keys(other.cells)]).size;
}

function sameCells(one: AutomationStudioResultNoStoredRow, other: AutomationStudioResultNoStoredRow): boolean {
  return differingColumns(one, other).length === 0;
}
