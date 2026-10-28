import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import type { AutomationStudioResultNoRecord } from "../refuted-no/index.ts";
import { automationStudioRequestRowLabel } from "../request-rows/index.ts";

/** A left-out row's tested value said after its label (`../read-account/alone-rows.ts`): `label — column: value`. */
const SAID_VALUE = / — ([\p{L}\p{N}_.$@-]{1,64}): (.+)$/su;
/** What an empty tested value reads as (`../read-account/alone-rows.ts`). */
const NO_VALUE = "(no value)";

/**
 * Each row a read left out, by its folded label, with every record of its own
 * cells Core holds (t771): the cells the read sent beside each left-out row,
 * alone or together (`../left-out-cells/`), and, where it sent
 * none, the one value its condition tested, as the row is said
 * (`label — column: value`). A label several rows share holds each of their
 * records. What a no calling a row missing is held to (`./located-defects.ts`).
 */
export function automationStudioResultLeftOutRowCells(
  summary: Pick<AutomationStudioRunResultSummary, "reads">,
  record: Pick<AutomationStudioResultNoRecord, "leftOut">
): Map<string, Array<Record<string, string>>> {
  const cells = new Map<string, Array<Record<string, string>>>();
  const add = (label: string, row: Record<string, string> | undefined): void => {
    if (!row || !Object.keys(row).length) return;
    const key = automationStudioResultLeftOutLabelKey(label);
    cells.set(key, [...(cells.get(key) ?? []), row]);
  };
  for (const read of summary.reads ?? []) {
    for (const condition of read.conditions ?? []) {
      (condition.leftOutOnlyByThis ?? []).forEach((said, at) => add(automationStudioRequestRowLabel(said), condition.leftOutCells?.[at] ?? testedCell(said)));
    }
    for (const set of read.leftOutTogether ?? []) set.rows.forEach((said, at) => add(automationStudioRequestRowLabel(said), set.cells?.[at]));
  }
  // A build test's left-out rows, which come by its steps' observations, never as a read account (`../request-rows/summary-reads.ts`).
  if (!summary.reads?.length) for (const row of record.leftOut) add(row.label, testedCell(row.given));
  return cells;
}

/** A label as left-out labels are looked up: lower case, each run of spaces one, no closing stop. */
export function automationStudioResultLeftOutLabelKey(label: string): string {
  return label.toLowerCase().replace(/\s+/gu, " ").replace(/[\s.,;:]+$/u, "").trim();
}

/** The one tested value a row is said with, as a cell; nothing where it is said by its label alone. */
function testedCell(said: string): Record<string, string> | undefined {
  const found = SAID_VALUE.exec(said);
  if (!found) return undefined;
  const value = found[2]!.trim();
  return { [found[1]!]: value === NO_VALUE ? "" : value };
}
