import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioRequestStoredRow, type AutomationStudioRequestStoredRow } from "../request-rows/index.ts";
import { automationStudioResultReadWorkingSets } from "../read-account/index.ts";

/**
 * The result's stored rows as a citation is held to them (`./index.ts`, t810):
 * each answer row (never a working set's, `../read-account/working-sets.ts`)
 * by its label, the first of the set's columns it holds text in, with every
 * cell it holds said as text (`../request-rows/row/stored-row.ts`, the rule the
 * judge's copy reads rows by too). `complete` is false where Core holds only some
 * of the answer's rows (a sample, a truncated or cut set) or holds no cell of
 * them, so a row it does not find may still be there.
 */
export function automationStudioResultCitedStoredCells(summary: Pick<AutomationStudioRunResultSummary, "reads" | "recordSets">): {
  rows: AutomationStudioRequestStoredRow[];
  complete: boolean;
} {
  const working = automationStudioResultReadWorkingSets(summary);
  const answer = summary.recordSets.filter((set) => !working.has(set.datasetId));
  const rows = answer.flatMap((set) => (set.sampleRows ?? []).flatMap((row) => automationStudioRequestStoredRow(set.columns, row) ?? []));
  const complete = answer.length > 0 && answer.every((set) => !set.truncated && (set.sampleRows?.length ?? 0) >= set.recordCount);
  return { rows, complete };
}
