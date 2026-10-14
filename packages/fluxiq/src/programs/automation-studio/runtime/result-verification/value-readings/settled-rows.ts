// The rows a numeric bound left out that Core itself settles (t574).
//
// **Why.** A yes over any row a condition alone left out has to quote, beside
// that row, the request's words excluding it (`../request-rows/unquoted-rows.ts`,
// t515). Live run `run-mv7vor5f-ea4d08b4`'s revisions 2 and 4 stored exactly
// the 13 rows asked for and left out 37 rows across six conditions; most were
// rows a rating or price bound left out, each said with the value it tested.
// The one yes was held because it did not argue each of the 37, and the
// recheck that listed all of them turned it into a no.
//
// **What Core settles: only what it measured.** A row the condition alone left
// out, said `label — column: value`, whose value Core reads as a number
// (`readAutomationStudioRecordNumber`, the domain's own reading) that fails the
// condition by Core's own semantics (`automationStudioRecordConditionHolds`,
// the domain's condition to the character). Only for a condition that compares
// nothing but numbers: a bound, or `equals` a number. A row whose value states
// no number, is withheld or empty, or a row of a text or presence condition is
// not settled, and is still quoted for row by row.
//
// **What a yes must still show.** That the bound is the request's: Core read
// the row against the condition as authored, not against the request. So the
// sentence says a yes quotes, once, in a sentence naming the condition, the
// request's words stating that bound -- `../request-rows/unquoted-rows.ts`
// holds it to that -- and need not quote beside each settled row.

import { automationStudioRecordConditionHolds, readAutomationStudioRecordNumber, type AutomationStudioRecordCondition } from "@fluxiq/contracts/automation-studio";
import { automationStudioResultConditionName } from "../read-account/index.ts";
import type { AutomationStudioResultReadCell } from "./condition-readings.ts";

/** The relations that compare a number. */
const BOUNDS = ["atLeast", "atMost", "lessThan", "greaterThan"] as const;
/** The relations that compare text, or ask whether a value is there. */
const NOT_NUMERIC = ["matches", "contains", "startsWith", "endsWith", "is"] as const;

/**
 * The left-out rows Core settles for this condition, as given, and its
 * sentence (header); nothing when the condition compares more than numbers or
 * no row is settled. `leftOut` pairs each row as given with its tested cell,
 * where the row says one.
 */
export function automationStudioResultSettledRows(input: {
  condition: AutomationStudioRecordCondition;
  column: string;
  number: number;
  wording: string | undefined;
  leftOut: ReadonlyArray<{ row: string; cell: AutomationStudioResultReadCell | undefined }>;
}): { leftOutSettled: string[]; settled: string } | undefined {
  const { condition, column } = input;
  if (!numericOnly(condition)) return undefined;
  const settled = input.leftOut.filter(({ cell }) => cell !== undefined && readAutomationStudioRecordNumber(cell.value) !== undefined && !automationStudioRecordConditionHolds(condition, cell.value));
  if (!settled.length) return undefined;
  const name = automationStudioResultConditionName(input.number, input.wording);
  return {
    leftOutSettled: settled.map(({ row }) => row),
    settled: `Core read ${column} as a number on each row in leftOutSettled, and each fails ${name} as written: Core settled these rows, so a yes need not quote the request beside each of them. `
      + `It must still show the bound is the request's: quote, once, in a sentence that names ${name} or ${column}, the request's own words stating that bound. If the request states no such bound, these rows are ones it asks for.`
  };
}

/** Whether the condition compares a number and nothing else: a bound or a numeric `equals`, no text test and no presence test. */
function numericOnly(condition: AutomationStudioRecordCondition): boolean {
  if (NOT_NUMERIC.some((key) => condition[key] !== undefined)) return false;
  const equals = condition.equals === undefined ? [] : Array.isArray(condition.equals) ? condition.equals : [condition.equals];
  if (equals.some((entry) => typeof entry !== "number")) return false;
  return equals.length > 0 || BOUNDS.some((key) => condition[key] !== undefined);
}
