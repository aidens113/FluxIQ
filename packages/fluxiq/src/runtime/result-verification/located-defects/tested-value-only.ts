// A row called missing by the very value a condition tested and left it out
// for, which the request does not say (t785).
//
// **Why.** Run `run-mvskodlp-9966d618`: a read kept the rows whose column held
// one of a list of values the Flow wrote, and left out the others, each by that
// condition alone. Both judges of a correct result called two of those rows
// missing, each quoting the row's own value in that column. t771's check
// (`./located-defects.ts`, `askedCellNotFound`) found the row's cell said it,
// so the defect was located and the double no stood. But the cell grounds only
// which value the row holds; it was the value the condition had tested and
// rejected, so the defect restated that the judge disagreed with the
// condition's list. What would make the row asked for -- a property the request
// defines the rows by -- is in no cell and no condition Core measured.
//
// **So such a defect is not located** where all of these hold:
//
// - the row was left out by one condition alone, wherever a read left it out,
//   and by no set of conditions together;
// - that condition is one `equals` test of the defect's column against values
//   the Flow wrote (`./condition-equals.ts`);
// - the quoted value is the row's own value in that column, as Core holds the
//   row's cells (`../left-out-cells/`, or its tested value said after its
//   label, `./tested-cell.ts`), and none of the values the condition keeps;
// - the request's own words (`record.says`, the check `requestWordsUnsaid`
//   uses) do not contain that value.
//
// Where the request names the value, the defect is located as before: the
// request asks for that row by its own words, and the condition's list missed
// it. Where Core holds no wording of the request, it cannot say the request is
// silent, and the defect is located as before. Such a no is then re-asked once
// (`../agreement/unsupported-no.ts`).

import type { AutomationStudioLlmVerificationDefect } from "../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultConditionName } from "../read-account/index.ts";
import type { AutomationStudioResultNoRecord } from "../refuted-no/index.ts";
import { automationStudioRequestRowLabel } from "../request-rows/index.ts";
import { automationStudioResultReadConditionEquals } from "./condition-equals.ts";
import { automationStudioResultLeftOutLabelKey } from "./row-cells.ts";
import { automationStudioResultLeftOutTestedCell } from "./tested-cell.ts";

type Summary = Pick<AutomationStudioRunResultSummary, "reads" | "flowShape">;

/**
 * Core's words for an `asked_missing` defect whose quoted value is only the
 * value one condition tested and left the row out for, which the request does
 * not say (header); nothing where any part of that does not hold, and the
 * defect is located as before. `label` is the row's whole label as Core's
 * record names it, `quoted` the defect's row as Core's lines quote it.
 */
export function automationStudioResultAskedTestedValueOnly(
  defect: AutomationStudioLlmVerificationDefect,
  label: string | undefined,
  quoted: string,
  summary: Summary,
  says: ((text: string) => boolean) | undefined
): string | undefined {
  if (defect.kind !== "asked_missing" || label === undefined || !says || !defect.column || defect.value === undefined) return undefined;
  const value = fold(defect.value);
  if (!value || says(defect.value)) return undefined;
  const key = automationStudioResultLeftOutLabelKey(label);
  const named = (said: string): boolean => automationStudioResultLeftOutLabelKey(automationStudioRequestRowLabel(said)) === key;
  const conditions = new Set<string>();
  let alone = 0;
  for (const read of summary.reads ?? []) {
    // A row two or more conditions left out together is not one condition's (header).
    if ((read.leftOutTogether ?? []).some((set) => set.rows.some(named))) return undefined;
    for (const [index, condition] of (read.conditions ?? []).entries()) {
      for (const [at, said] of (condition.leftOutOnlyByThis ?? []).entries()) {
        if (!named(said)) continue;
        alone += 1;
        const number = condition.number ?? index + 1;
        const tested = automationStudioResultReadConditionEquals(summary.flowShape, read, number);
        if (!tested || !sameColumn(tested.column, defect.column)) return undefined;
        if (tested.values.some((kept) => fold(kept) === value)) return undefined;
        const cells = condition.leftOutCells?.[at] ?? automationStudioResultLeftOutTestedCell(said);
        const cell = cells?.[tested.column];
        if (cell === undefined || !holds(cell, value)) return undefined;
        conditions.add(automationStudioResultConditionName(number, condition.condition));
      }
    }
  }
  if (!alone) return undefined;
  const names = [...conditions].join(" and ");
  return `Core's record of ${quoted} holds "${defect.value}" in "${defect.column}", the value ${names} tested and left out as written; the request does not say "${defect.value}", so whether it asks for that row is not something Core can find in the row's cells.`;
}

/** Whether a defect's column names the condition's, as columns are compared (`./located-defects.ts`): by its own name, or one holding the other. */
function sameColumn(tested: string, named: string): boolean {
  const a = bare(tested);
  const b = bare(named);
  return a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)));
}

/** Whether a cell says a value, as `./located-defects.ts` finds one: the whole cell, or, for a value of three letters or more, within it. */
function holds(cell: string, value: string): boolean {
  const folded = fold(cell);
  return folded === value || (value.length >= 3 && folded.includes(value));
}

/** A label as labels are compared: lower case, each run of spaces one, no closing stop or comma. */
function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").replace(/[\s.,;:]+$/u, "").trim();
}

/** A column name as columns are compared: letters and digits only, lower case. */
function bare(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
