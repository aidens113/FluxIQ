// Whether a judge's no names a contradiction in the evidence, read from its reply's own shape (t1072).
//
// **Why.** Run `run-mwyfoz8o-507c92f6` (0101): a saved Flow's replay kept the right rows in the right order. The judge
// said no, and its own summary said the rows were the right set, "on a closer read the order is actually newest-first",
// and that the verdict "stays no only because the sort cannot be confirmed". Its question allows a no only on a
// concrete contradiction, said in `observed` (`./question.ts`). The reply left `observed` empty and listed two defects: a
// `wrong_value` on a cell it also listed in `checked` as right, and an `other` naming "all 7 kept rows". It was taken as
// a no, the attempt repaired a Flow that had not broken, and the next attempt paid one more judge call.
//
// **The rule, from the reply alone.** A no names a contradiction when it says what is wrong in `observed`, or lists a
// defect that names what is wrong by itself: a row kept that was not asked for or one asked for and missing, an act
// missing or done wrongly, or a wrong value on a cell the same reply does not give in `checked` as right. A defect of kind
// `other` is the reply's free form and says what it is only beside `observed`; a value the reply gives as right is no
// contradiction of it. A no that names none is read as unknown: it says nothing is shown wrong. Of 124 judge nos
// recorded in Lab runs from 2026-11-15 to 2026-11-26, two name none: 0101, and run-mwveg5ls-0266dfe0's 0149, whose
// summary says the answer "was not confirmed".

import type { AutomationStudioLlmDiagnosisFields } from "../../llm/index.ts";

/** The defect kinds that name what is wrong by themselves (header). */
const NAMING_KINDS: ReadonlySet<string> = new Set(["kept_not_asked", "asked_missing", "act_missing", "act_wrong"]);

/** Whether a reply's no names a contradiction (header); `true` for anything but a no. */
export function automationStudioFlowLessNoNamesContradiction(diagnosis: AutomationStudioLlmDiagnosisFields | undefined): boolean {
  if (diagnosis?.answersRequest !== "no") return true;
  if (said(diagnosis.observed)) return true;
  const checked = list(diagnosis.checked).flatMap((entry) => cell(entry) ?? []);
  return list(diagnosis.defects).some((defect) => {
    if (!isRecord(defect) || typeof defect.kind !== "string") return false;
    if (NAMING_KINDS.has(defect.kind)) return said(defect.row);
    if (defect.kind !== "wrong_value") return false;
    const named = cell(defect);
    return named !== undefined && !checked.some((right) => right.row === named.row && right.column === named.column && right.value === named.value);
  });
}

/** A row, column and value as a reply names them, compared as written but for the spaces around them. */
function cell(entry: unknown): { row: string; column: string; value: string } | undefined {
  if (!isRecord(entry) || !said(entry.row) || !said(entry.column)) return undefined;
  return { row: entry.row.trim(), column: entry.column.trim(), value: typeof entry.value === "string" ? entry.value.trim() : "" };
}

function said(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
