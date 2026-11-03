import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultConditionName } from "../read-account/index.ts";
import type { AutomationStudioResultItemMark } from "../read-condition.ts";
import type { AutomationStudioResultNoRecord } from "../refuted-no/index.ts";
import { automationStudioRequestRowLabel } from "../request-rows/index.ts";
import { automationStudioResultLeftOutTestedCell as testedCell } from "./tested-cell.ts";

/**
 * One row a read left out, as Core holds it (t771, t810): its own cells, empty
 * where the read sent none, and the marks the client read on its item
 * (a condition's `leftOutMarks`, a together set's `marks`), empty where it read
 * none. Both are the same row's, so a row told apart by its cells keeps its
 * own marks (`./located-defects.ts`). `leftBy`, the condition that alone left
 * it out, as every line names one (`condition N (wording)`), or the numbers of
 * the conditions that left it out together: what a claim about a kept row
 * that names it is refuted with (`./row-refuted.ts`, `not_kept`). Absent for a
 * build test's row, which comes by its steps' observations. `marksRead`
 * where the read sent marks for its rows at all (`leftOutMarks`, `marks`):
 * without it, an empty `marks` says nothing of the item (t810 follow-up 2).
 */
export type AutomationStudioResultLeftOutRowRecord = { cells: Record<string, string>; marks: AutomationStudioResultItemMark[]; leftBy?: string; marksRead?: true };

/**
 * Each row a read left out, by its folded label, with every record of it Core
 * holds (t771, t810): the cells the read sent beside each left-out row, alone
 * or together (`../left-out-cells/`), and, where it sent none, the one value
 * its condition tested, as the row is said (`label — column: value`); and the
 * marks the client read on its item, in the same order, and what left it
 * out. A label several rows share holds each of their records; a build test's
 * row with no tested value holds none. What a no calling a row missing is held to (`./located-defects.ts`)
 * and refuted by (`./row-refuted.ts`).
 */
export function automationStudioResultLeftOutRowRecords(
  summary: Pick<AutomationStudioRunResultSummary, "reads">,
  record: Pick<AutomationStudioResultNoRecord, "leftOut">
): Map<string, AutomationStudioResultLeftOutRowRecord[]> {
  const records = new Map<string, AutomationStudioResultLeftOutRowRecord[]>();
  const add = (label: string, cells: Record<string, string> | undefined, marks: AutomationStudioResultItemMark[] | null | undefined, leftBy?: string, marksRead?: boolean): void => {
    const own: AutomationStudioResultLeftOutRowRecord = { cells: cells ?? {}, marks: marks ?? [], ...(leftBy ? { leftBy } : {}), ...(marksRead ? { marksRead: true as const } : {}) };
    if (!Object.keys(own.cells).length && !own.marks.length && !leftBy) return;
    const key = automationStudioResultLeftOutLabelKey(label);
    records.set(key, [...(records.get(key) ?? []), own]);
  };
  for (const read of summary.reads ?? []) {
    (read.conditions ?? []).forEach((condition, index) => {
      const leftBy = automationStudioResultConditionName(condition.number ?? index + 1, condition.condition);
      (condition.leftOutOnlyByThis ?? []).forEach((said, at) => add(automationStudioRequestRowLabel(said), condition.leftOutCells?.[at] ?? testedCell(said), condition.leftOutMarks?.[at], leftBy, condition.leftOutMarks !== undefined));
    });
    for (const set of read.leftOutTogether ?? []) {
      const leftBy = `conditions ${set.conditions.join(" and ")} together`;
      set.rows.forEach((said, at) => add(automationStudioRequestRowLabel(said), set.cells?.[at], set.marks?.[at], leftBy, set.marks !== undefined));
    }
  }
  // A build test's left-out rows, which come by its steps' observations, never as a read account (`../request-rows/summary-reads.ts`).
  if (!summary.reads?.length) for (const row of record.leftOut) add(row.label, testedCell(row.given), undefined);
  return records;
}

/**
 * Each row a read left out, by its folded label, with every record of its own
 * cells Core holds (t771): the cells of `automationStudioResultLeftOutRowRecords`,
 * a row the read sent no cell of left out. What a no calling a row missing is
 * held to (`./located-defects.ts`).
 */
export function automationStudioResultLeftOutRowCells(
  summary: Pick<AutomationStudioRunResultSummary, "reads">,
  record: Pick<AutomationStudioResultNoRecord, "leftOut">
): Map<string, Array<Record<string, string>>> {
  const cells = new Map<string, Array<Record<string, string>>>();
  for (const [key, rows] of automationStudioResultLeftOutRowRecords(summary, record)) {
    const held = rows.map((row) => row.cells).filter((row) => Object.keys(row).length > 0);
    if (held.length) cells.set(key, held);
  }
  return cells;
}

/** A label as left-out labels are looked up: lower case, each run of spaces one, no closing stop. */
export function automationStudioResultLeftOutLabelKey(label: string): string {
  return label.toLowerCase().replace(/\s+/gu, " ").replace(/[\s.,;:]+$/u, "").trim();
}
