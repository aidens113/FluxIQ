// The judge's copy of a summary, with each stored row that shares a label given its handle (t1087, `../../row/handle.ts`).
//
// A yes cites the rows it checked, each by its label, and rows that share a label cannot be told apart by it: live run
// `run-mwz2jc4w-0c207128`'s judge qualified one ("label (ends Mon 21 Sep 15:35)"), matched no row, and was asked again.
// So on the copy, each stored row whose label another stored row has carries `rowHandle`, the label and its rank among the
// rows sharing it, in the order the rows are held, ranked by the one rule a citation is read by (`../../row/stored-row.ts`:
// the answer's record sets, never a working set's, `../../../read-account/working-sets.ts`). A row whose label is its own has
// none, and a summary with no shared label is given back as it is.
//
// **The judge's copy only.** The summary given is never changed, and the checks of a reply read the rows without it.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioRunResultSummary } from "../../../contracts/index.ts";
import { automationStudioResultReadWorkingSets } from "../../../read-account/working-sets.ts";
import { AutomationStudioRequestRowHandle, automationStudioRequestStoredRow } from "../../row/index.ts";

/** The member a row carries its handle in. */
const AUTOMATION_STUDIO_RESULT_ROW_HANDLE_KEY = "rowHandle";

/** `summary` with each stored row sharing a label given its handle (header); the same object when none shares one. */
export function automationStudioResultSummaryWithRowHandles(summary: AutomationStudioRunResultSummary): AutomationStudioRunResultSummary {
  const working = automationStudioResultReadWorkingSets(summary);
  const answer = summary.recordSets.filter((set) => !working.has(set.datasetId));
  const labels = answer.flatMap((set) => (set.sampleRows ?? []).flatMap((row) => automationStudioRequestStoredRow(set.columns, row)?.label ?? []));
  const handles = AutomationStudioRequestRowHandle.of(labels);
  if (handles.every((handle) => handle === undefined)) return summary;
  let at = 0;
  const recordSets = summary.recordSets.map((set) => {
    if (working.has(set.datasetId) || !set.sampleRows) return set;
    const sampleRows = set.sampleRows.map((row) => {
      if (automationStudioRequestStoredRow(set.columns, row) === undefined) return row;
      const handle = handles[at++];
      return handle === undefined ? row : { ...row, [AUTOMATION_STUDIO_RESULT_ROW_HANDLE_KEY]: handle as JsonValue };
    });
    return { ...set, sampleRows };
  });
  return { ...summary, recordSets };
}
