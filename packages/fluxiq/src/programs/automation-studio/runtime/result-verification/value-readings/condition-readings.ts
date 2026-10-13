// How Core read the tested value on a few rows one condition kept and left out
// (t511), said beside the condition for the judge.
//
// **Why.** Live run `run-mv6qr7fk-77f30b49`: `salary atLeast 70000` left out
// "£72k – £80k per annum", which the number reader read as 72. The judges were
// shown the row and its text, not the 72, and argued about patterns for six
// revisions before anyone saw the misread. So each bound says the number it
// compared, `left out "…": salary read as 72 from "£72k – £80k per annum"`, and
// each text test the part it found (`./text-match.ts`): on a kept row, or on a
// left-out row for a `not` test, the row it held on.
//
// **Bounded, labels only.** At most `PER_SIDE` kept and `PER_SIDE` left-out rows,
// in the order given, each by its label and the tested value -- both already
// screened where they came from (the stored rows, a condition's left-out rows) --
// and no other text of the page.

import { readAutomationStudioRecordNumber, type AutomationStudioRecordCondition } from "@fluxiq/contracts/automation-studio";
import { automationStudioResultTextMatch } from "./text-match.ts";

/** The most rows said on each side of one condition. */
export const AUTOMATION_STUDIO_RESULT_READINGS_PER_SIDE = 4;

/** One row of a condition as a reading is said: its label and the value the condition tested. */
export type AutomationStudioResultReadCell = { label: string; value: string };

const BOUNDS = ["atLeast", "atMost", "lessThan", "greaterThan"] as const;

/** Core's readings of `column` on a few rows `condition` kept and left out; none for a condition that compares no number or text. */
export function automationStudioResultConditionReadings(input: {
  condition: AutomationStudioRecordCondition;
  column: string;
  kept: readonly AutomationStudioResultReadCell[];
  leftOut: readonly AutomationStudioResultReadCell[];
}): string[] {
  const { condition, column } = input;
  const numeric = BOUNDS.some((key) => condition[key] !== undefined) || anyOf(condition.equals).some((entry) => typeof entry === "number");
  const text = condition.matches !== undefined || condition.contains !== undefined || condition.startsWith !== undefined || condition.endsWith !== undefined;
  if (!numeric && !text) return [];
  const line = (side: "kept" | "left out", cell: AutomationStudioResultReadCell): string | undefined => {
    const parts: string[] = [];
    if (numeric) {
      const number = readAutomationStudioRecordNumber(cell.value);
      parts.push(`${column} read as ${number === undefined ? "no number" : String(number)} from ${JSON.stringify(cell.value)}`);
    }
    // A text test held on a kept row, or, negated, on the row it left out.
    if (text && (side === "kept") !== (condition.not === true)) {
      const found = automationStudioResultTextMatch(condition, cell.value);
      if (found) parts.push(`${column} ${numeric ? "" : `${JSON.stringify(cell.value)} `}matched ${found}`);
    }
    return parts.length ? `${side} ${JSON.stringify(cell.label)}: ${parts.join("; ")}` : undefined;
  };
  const said = (side: "kept" | "left out", cells: readonly AutomationStudioResultReadCell[]): string[] =>
    cells.slice(0, AUTOMATION_STUDIO_RESULT_READINGS_PER_SIDE).flatMap((cell) => line(side, cell) ?? []);
  return [...said("kept", input.kept), ...said("left out", input.leftOut)];
}

function anyOf<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? (value as readonly T[]) : [value as T];
}
