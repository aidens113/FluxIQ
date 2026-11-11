// The answer's rows: every row the output step's current version kept, page by page in place order, holding the
// contract's columns (I5) and nothing else.
//
// Run-mwb2kkv5: the read kept `link`, which the request never named, and the answer kept it too. Where the contract is
// sure and every named column is one the read holds (by its name, or the same name written with other case, spaces,
// `_` or `-`), each row is narrowed to the named columns in the request's order, under the request's names. A named
// column the read does not hold is reported as `unmatched`, and the rows are then left as read: narrowing them would
// throw away a column that may be the named one under another name, which only the judge can weigh. An unsure or
// empty contract narrows nothing.
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioAnswerFirstResultOutputStep } from "./output-step.ts";
import type { AutomationStudioAnswerFirstResultLedger } from "./types.ts";

export type AutomationStudioAnswerFirstResultAnswer = { rows: JsonObject[]; columns: readonly string[]; unmatched: readonly string[] };

export function automationStudioAnswerFirstResultAnswer(ledger: AutomationStudioAnswerFirstResultLedger): AutomationStudioAnswerFirstResultAnswer {
  const output = automationStudioAnswerFirstResultOutputStep(ledger);
  if (!output) return { rows: [], columns: [...ledger.contract.columns], unmatched: [] };
  const kept = output.pages.flatMap((page) => page.kept);
  const held = [...new Set([...Object.keys(output.reads.fields), ...kept.flatMap((row) => Object.keys(row))])];
  const contract = ledger.contract;
  if (!contract.sure || !contract.columns.length) return { rows: [...kept], columns: held, unmatched: [] };
  const matched = contract.columns.map((column) => held.find((key) => key === column) ?? held.find((key) => loose(key) === loose(column)));
  const unmatched = contract.columns.filter((_, index) => matched[index] === undefined);
  if (unmatched.length) return { rows: [...kept], columns: held, unmatched };
  const rows = kept.map((row) => {
    const narrowed: JsonObject = {};
    contract.columns.forEach((column, index) => {
      const value = row[matched[index]!];
      if (value !== undefined) narrowed[column] = value;
    });
    return narrowed;
  });
  return { rows, columns: [...contract.columns], unmatched: [] };
}

function loose(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/gu, "");
}
