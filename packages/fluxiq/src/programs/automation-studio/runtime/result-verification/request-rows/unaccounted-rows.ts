// The flagged rows a judge's yes did not name (`left-out-naming-the-item.ts`).
//
// Live run `run-muw60j7c-bb7c9a62` (debug C-2): the build-test judge answered
// "Kept rows are all earbuds ... accessory names excluded" over three pairs of
// earbuds the name condition alone had left out. A yes is a claim that the
// request excludes each such row, and a claim about a row that never names it
// has not looked at it. So each flagged row has to be named in the reply -- its
// expected, observed, changed or summary -- by a prefix of its label that tells
// it apart from every other row of its read, or by an id from it
// (`row-naming.ts`). Whether its reason is right is not checked here: naming the
// row is the least a reading of it leaves behind.

import type { AutomationStudioResultLeftOutNamingTheItem, AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioRequestRowNaming, automationStudioRequestTextNamesRow } from "./row-naming.ts";
import { automationStudioRequestRowLabel, automationStudioRequestRowsReads } from "./summary-reads.ts";

/** Each flagged condition with the rows the reply did not name; none when it named them all, or nothing was flagged. */
export function automationStudioResultLeftOutRowsUnaccounted(summary: AutomationStudioRunResultSummary, reply: string): AutomationStudioResultLeftOutNamingTheItem[] {
  const flagged = summary.leftOutNamingTheItem ?? [];
  if (!flagged.length) return [];
  const { reads } = automationStudioRequestRowsReads(summary);
  return flagged.flatMap((entry) => {
    const read = reads.find((candidate) => entry.step !== undefined ? candidate.step === entry.step : candidate.nodeId === entry.nodeId);
    const pool = read?.labels ?? entry.rows.map(automationStudioRequestRowLabel);
    const rows = entry.rows.filter((row) => !automationStudioRequestTextNamesRow(reply, automationStudioRequestRowNaming(automationStudioRequestRowLabel(row), pool)));
    return rows.length ? [{ ...entry, also: [...entry.also], rows }] : [];
  });
}
