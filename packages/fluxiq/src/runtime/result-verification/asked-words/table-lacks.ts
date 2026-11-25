// Which of the columns a request names the held rows hold nothing for: no column of that name (`./held-column.ts`), and
// none sharing a word with it. A held column that shares a word ("due" for "due date") is left to the judge, so a name
// the contract reader read with a word too many ("title only", from "with columns title only") never becomes a refusal
// nothing can answer.
//
// Rows lacking one of these are not the table the request names, whatever else they show: a judge's yes over them is
// refused (`../cited-yes/records-yes.ts`, t1032), so the answer-first completion check refuses them before any judge is
// paid for (`framework/.../answer-first/completion/check.ts`, t1034). One predicate, so the two never disagree on what
// a table lacks.
import { automationStudioResultHeldColumn } from "./held-column.ts";

/** The named columns the held columns hold nothing for (header); none where no column is named. */
export function automationStudioResultAskedTableLacks(askedColumns: readonly string[] | undefined, heldColumns: readonly string[]): string[] {
  if (!askedColumns?.length) return [];
  const heldWords = new Set(heldColumns.flatMap(wordsOf));
  return askedColumns.filter((column) => automationStudioResultHeldColumn(column, heldColumns) === undefined && !wordsOf(column).some((word) => heldWords.has(word)));
}

function wordsOf(name: string): string[] {
  return name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
