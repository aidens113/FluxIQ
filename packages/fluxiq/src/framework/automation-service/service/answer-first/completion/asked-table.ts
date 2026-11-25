// Rows that cannot be the table the request names, known before any judge is paid for (t1034).
//
// Bigbox run run-mwveg5ls-0266dfe0 was asked for "my cart as a table with columns item, quantity and price". Its result
// was a read of the search results (name, price, rating, pickup) from the first completion to the last, and every one of
// its 11 judge calls, about $0.66 of the run's $3.15, was made over those rows. None could have passed: a judge's yes over
// rows that hold nothing for a column the request names is refused (`runtime/result-verification/cited-yes/records-yes.ts`,
// t1032), and its no told the model nothing Core had not already worked out. So the completion check refuses such rows
// itself, by the same predicate (`runtime/result-verification/asked-words/table-lacks.ts`), and a judge is asked only of
// rows that may be the table: what a judge would still find wrong is found once they are.
//
// Only where Core's reader is sure of the named columns (`../result/answer-contract.ts`), and only over rows: a result
// with no rows is the judge's to weigh, since an empty table can be the right answer.
import { automationStudioResultAskedTableLacks } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstAnswerContractOf } from "../result/index.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "../rows/index.ts";

/** The named columns and which of them the rows hold nothing for, where the rows cannot be the table asked for; nothing where they may be. */
export function automationStudioAnswerFirstNotAskedTable(instructions: string, rows: AutomationStudioAnswerFirstRowsSummary): { asked: readonly string[]; lacking: string[] } | undefined {
  const contract = automationStudioAnswerFirstAnswerContractOf(instructions);
  if (!contract.sure || !contract.columns.length || rows.totalRows === 0) return undefined;
  const held = rows.columns.length ? rows.columns.map((column) => column.id) : [...new Set(rows.rows.flatMap((row) => Object.keys(row)))];
  const lacking = automationStudioResultAskedTableLacks(contract.columns, held);
  return lacking.length ? { asked: contract.columns, lacking } : undefined;
}
