// Which of the columns a request names the held rows hold nothing for: no column of that name (`./held-column.ts`: the
// same name written with other case, spacing, `_`, `-` or as a plural). A held column that only shares a word ("due"
// for "due date") is another column, and is not matched (t1051): the contract reader now gives the names as written
// ("title only" is read as "title", `flow-bootstrap/answerability/instruction-columns.ts`), so matching by a shared
// word is no longer needed and let a table with the wrong column pass.
//
// Rows lacking one of these are not the table the request names, whatever else they show: a judge's yes over them is
// refused (`../cited-yes/records-yes.ts`, t1032), so the answer-first completion check refuses them before any judge is
// paid for (`framework/.../answer-first/completion/check.ts`, t1034). One predicate, so the two never disagree on what
// a table lacks.
import { automationStudioResultHeldColumn } from "./held-column.ts";

/** The named columns the held columns hold nothing for (header); none where no column is named. */
export function automationStudioResultAskedTableLacks(askedColumns: readonly string[] | undefined, heldColumns: readonly string[]): string[] {
  if (!askedColumns?.length) return [];
  return askedColumns.filter((column) => automationStudioResultHeldColumn(column, heldColumns) === undefined);
}
