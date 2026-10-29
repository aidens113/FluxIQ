// A row called missing by a column the one condition that left it out never
// tested (t790).
//
// **Why.** Run `run-mvswewhy-e4e469d4`: a read left rows out, each by one
// condition alone, and a judge's no called them missing by quoting their
// `posted` dates, a column that condition did not test. t771's check
// (`./located-defects.ts`, `askedCellNotFound`) asks only that the row's cell
// says the quoted value, and the cells did, so had the no named the rows by
// Core's labels the defect would have been located and a correct result
// refuted. A cell of another column grounds only that the row holds that
// value; it does not show that the condition which alone left the row out
// should have kept it. The same reading would locate a no quoting any other
// cell of such a row, whatever the condition tests.
//
// **So such a defect is not located** where all of these hold:
//
// - the row was left out by one condition alone, wherever a read left it out,
//   and by no set of conditions together;
// - Core knows the column each such condition tests: its authored `field`, or
//   the column whose read its own read is (`./condition-authored.ts`,
//   `../read-account/condition.ts`), where the condition's wording says that
//   column, or else the column the row is said with, `label — column: value`
//   (`./tested-cell.ts`), which names the column the condition tested;
// - the defect's column is none of those columns, compared as
//   `./tested-value-only.ts` compares them.
//
// Where Core cannot say which column a condition tests -- a step the summary
// does not hold, a condition over a read no column makes -- the defect is
// held to the row's cells as before. A true defect stays locatable by quoting
// the tested column's own value; where that value is only the rejected value
// of an `equals` list, `./tested-value-only.ts` still decides it (t785). Such a
// no is then re-asked once (`../agreement/unsupported-no.ts`).

import type { AutomationStudioLlmVerificationDefect } from "../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultConditionName, automationStudioResultReadConditionColumn } from "../read-account/index.ts";
import { automationStudioRequestRowLabel } from "../request-rows/index.ts";
import { automationStudioResultReadAuthoredCondition } from "./condition-authored.ts";
import { automationStudioResultLeftOutLabelKey } from "./row-cells.ts";
import { automationStudioResultLeftOutTestedCell } from "./tested-cell.ts";

type Summary = Pick<AutomationStudioRunResultSummary, "reads" | "flowShape">;
type Read = NonNullable<Summary["reads"]>[number];

/**
 * Core's words for an `asked_missing` defect whose column is not the column
 * of the one condition that left the row out (header); nothing where any part
 * of that does not hold, and the defect is held to the row's cells as before.
 * `label` is the row's whole label as Core's record names it, `quoted` the
 * defect's row as Core's lines quote it.
 */
export function automationStudioResultAskedUntestedColumn(
  defect: AutomationStudioLlmVerificationDefect,
  label: string | undefined,
  quoted: string,
  summary: Summary
): string | undefined {
  if (defect.kind !== "asked_missing" || label === undefined || !defect.column) return undefined;
  const key = automationStudioResultLeftOutLabelKey(label);
  const named = (said: string): boolean => automationStudioResultLeftOutLabelKey(automationStudioRequestRowLabel(said)) === key;
  const tested = new Map<string, { number: number; column: string }>();
  for (const read of summary.reads ?? []) {
    // A row two or more conditions left out together is not one condition's (header).
    if ((read.leftOutTogether ?? []).some((set) => set.rows.some(named))) return undefined;
    for (const [index, condition] of (read.conditions ?? []).entries()) {
      for (const said of condition.leftOutOnlyByThis ?? []) {
        if (!named(said)) continue;
        const number = condition.number ?? index + 1;
        const column = testedColumn(summary.flowShape, read, number, condition.condition, said);
        if (column === undefined || sameColumn(column, defect.column)) return undefined;
        tested.set(`${automationStudioResultConditionName(number, condition.condition)}, which tests "${column}"`, { number, column });
      }
    }
  }
  if (!tested.size) return undefined;
  const which = [...tested.keys()].join(" and ");
  const columns = [...new Set([...tested.values()].map((one) => `"${one.column}"`))].join(" or ");
  if (tested.size === 1) {
    const { number } = [...tested.values()][0]!;
    return `Core's record of ${quoted} was left out only by ${which}; the defect quotes "${defect.column}", which condition ${number} did not test, so it does not show why condition ${number} should keep that row. Quote that row's own value in ${columns}.`;
  }
  return `Core's record of ${quoted} was left out each time by one condition alone, ${which}; the defect quotes "${defect.column}", which none of them tested, so it does not show why they should keep that row. Quote that row's own value in ${columns}.`;
}

/**
 * The column condition `number` of `read` tests, as Core may say it (header):
 * the authored one where the condition's wording says it, else the one the
 * row is said with; nothing where Core cannot tell.
 */
function testedColumn(flowShape: Summary["flowShape"], read: Read, number: number, wording: string | undefined, said: string): string | undefined {
  const authored = automationStudioResultReadAuthoredCondition(flowShape, read, number);
  const column = authored ? automationStudioResultReadConditionColumn(authored.condition, authored.fields) : undefined;
  // The wording names a column only where it passed the screens (`../read-account/condition.ts`), so Core says it only then.
  if (column !== undefined && wording !== undefined && saysColumn(wording, column)) return column;
  const cell = automationStudioResultLeftOutTestedCell(said);
  const keys = cell ? Object.keys(cell) : [];
  return keys.length === 1 ? keys[0] : undefined;
}

/** Whether a condition's wording names a column, as a whole word. */
function saysColumn(wording: string, column: string): boolean {
  const escaped = column.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_$-])${escaped}(?:$|[^\\p{L}\\p{N}_$-])`, "u").test(wording);
}

/** Whether a defect's column names the condition's, as columns are compared (`./tested-value-only.ts`): by its own name, or one holding the other. */
function sameColumn(tested: string, named: string): boolean {
  const a = bare(tested);
  const b = bare(named);
  return a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)));
}

/** A column name as columns are compared: letters and digits only, lower case. */
function bare(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
