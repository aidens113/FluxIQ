// What a refused completion says of the rows the check read against the table the request names (t1032).
//
// Run-mwv5m906-5e999159 was asked for "my cart as a table with columns item, quantity and price". Its result was the
// draft's only read step, a product listing read with columns name, price, rating, pickup and url, and the cart was
// never read as a draft step. Two checks said unsure ("the cart read has not been shown in a table"), and the model was
// told only the check's own prose and that new evidence changes its answer; it spent the next 40 steps looking for a
// pager. From Core's own records -- the request's named columns (`../result/answer-contract.ts`, only where the reader
// was sure of them) and the columns of the rows the check read -- this says plainly which named columns the rows lack,
// that the result is the draft's last read step, and the two ways a read of the asked table becomes it, both with the
// tools the attempt has: a read run with `add`, or `amend_draft` `take` of a read already run outside the draft.
//
// Nothing is said where the rows hold every named column (by its name, or the same name with other case, spaces, `_`
// or `-`, `runtime/result-verification/asked-words/held-column.ts`), where the request names none or the reader was unsure, or where there are no
// rows (the empty result has its own refusal). It refuses nothing itself: a judge's yes over rows that lack a named
// column is refused where the yes is weighed (`runtime/result-verification/cited-yes/records-yes.ts`). Generic words: no site, task or value.
import { automationStudioResultHeldColumn } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstAnswerContractOf } from "../result/index.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "../rows/index.ts";

export function automationStudioAnswerFirstResultColumnsWords(instructions: string, rows: AutomationStudioAnswerFirstRowsSummary): string | undefined {
  const contract = automationStudioAnswerFirstAnswerContractOf(instructions);
  if (!contract.sure || !contract.columns.length || rows.totalRows === 0) return undefined;
  const held = rows.columns.length ? rows.columns.map((column) => column.id) : [...new Set(rows.rows.flatMap((row) => Object.keys(row)))];
  const lacking = contract.columns.filter((column) => automationStudioResultHeldColumn(column, held) === undefined);
  if (!lacking.length) return undefined;
  return `The rows the check read hold columns ${held.join(", ")}, and no ${lacking.join(" or ")}, which the request names, so they are not the table it asks for. The result is the draft's last read step not marked intermediate, as resultHolds.result names it. To make the table asked for the result, read it where the site shows it, naming its columns as the request names them, in a call with add: true, which makes that read the result's step; or, where a read outside the draft already returned it, amend_draft with change "take" and that read's call id. Where the result's processing is set, set it again over the new step's columns.`;
}
