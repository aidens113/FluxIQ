// A row called missing for the very absence a presence condition left it out
// by (framework plan P5; debug `run-mvtdoyf3-47ffaac1`, fix F4).
//
// **Why.** A revision's read kept a row only where it found a value in a
// column the request never mentions, and so left out rows the request asks
// for. Both judges said no rightly, each naming those rows `asked_missing` in
// that column with "(no value)", and Core refused the defect: it held no cell
// of that column for the rows -- the read sends only the answer's columns
// beside a left-out row (`../left-out-cells/`) -- and the bare label did not
// say "(no value)". The read's own account said each row as `label — column:
// (no value)`, and the condition's `leftOutSettled` held it: Core measured
// the absence itself (t599). So no no over a presence condition the request
// never states could be located, and the revision came back unsure twice.
//
// **So such a defect is located** where all of these hold:
//
// - the defect quotes the value as "(no value)" (or "no value", "none");
// - some read's presence condition (`settledKind: "presence"`) holds the row,
//   by its whole label, in `leftOutSettled`, said with that condition's
//   tested column and `(no value)` (`./tested-cell.ts`);
// - the defect's column is that column, compared as `./untested-column.ts`
//   compares columns.
//
// Whether the request asks for rows with that value is not this check's: a
// left-out row Core accounts for by the request's own words is decided before
// it (`./located-defects.ts`, `quotesRequest`).

import type { AutomationStudioLlmVerificationDefect } from "../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioRequestRowLabel } from "../request-rows/index.ts";
import { automationStudioResultLeftOutLabelKey } from "./row-cells.ts";
import { automationStudioResultLeftOutTestedCell } from "./tested-cell.ts";

/** How a defect may quote an absent value. */
const NO_VALUE: ReadonlySet<string> = new Set(["(no value)", "no value", "none", "(none)"]);

/**
 * Whether an `asked_missing` defect quoting "(no value)" in a column names a
 * row a presence condition left out, in that column's settled absence (header).
 * `label` is the row's whole label as Core's record names it.
 */
export function automationStudioResultAskedPresenceSettled(
  defect: AutomationStudioLlmVerificationDefect,
  label: string | undefined,
  summary: Pick<AutomationStudioRunResultSummary, "reads">
): boolean {
  if (defect.kind !== "asked_missing" || label === undefined || !defect.column || defect.value === undefined) return false;
  if (!NO_VALUE.has(defect.value.trim().toLowerCase())) return false;
  const key = automationStudioResultLeftOutLabelKey(label);
  return (summary.reads ?? []).some((read) => (read.conditions ?? []).some((condition) => condition.settledKind === "presence"
    && (condition.leftOutSettled ?? []).some((said) => {
      if (automationStudioResultLeftOutLabelKey(automationStudioRequestRowLabel(said)) !== key) return false;
      const cell = automationStudioResultLeftOutTestedCell(said);
      return cell !== undefined && Object.entries(cell).some(([column, value]) => value === "" && sameColumn(column, defect.column!));
    })));
}

/** Whether a defect's column names the condition's: by its own name, or one holding the other (`./untested-column.ts`). */
function sameColumn(tested: string, named: string): boolean {
  const a = bare(tested);
  const b = bare(named);
  return a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)));
}

/** A column name as columns are compared: letters and digits only, lower case. */
function bare(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
