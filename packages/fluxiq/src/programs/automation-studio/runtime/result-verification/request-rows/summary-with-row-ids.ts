// The judge's copy of a summary, with Core's short id said before every row a
// condition alone left out that a judge must still name (t599, `row-id.ts`).
//
// **Which rows.** Each read condition's `leftOutOnlyByThis` row that Core did
// not settle (`leftOutSettled`, `../value-readings/settled-rows.ts`), and each
// record set's processing condition's: the rows a yes names one by one
// (`unquoted-rows.ts`, `unaccounted-rows.ts`). A settled row needs no naming,
// nor does a row whose item is also in the result (`leftOutAlsoInResult`,
// `summary-with-also-in-result.ts`, t624, made first on the copy), and a withheld
// label is no row's own, so none of them is given one.
//
// **The judge's copy only.** The summary given is never changed, and the
// checks of a reply read the summary without ids: the id is the label's own
// (`row-id.ts`), so `row-naming.ts` counts a reply that names it with nothing
// carried between the copy and the check. Core's lines (`../verdict/`) and
// every other reader of the summary see the rows exactly as before.

import type { AutomationStudioResultReadAccount, AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { AutomationStudioRequestRowId } from "./row-id.ts";
import { automationStudioRequestRowLabel } from "./summary-reads.ts";

/** What a label that may not be said reads as (`../read-account/alone-rows.ts`). */
const WITHHELD_LABEL = "(withheld)";

/** The summary with each left-out row a judge must still name said with its id (header); the same object when there is none. */
export function automationStudioResultSummaryWithRowIds(summary: AutomationStudioRunResultSummary): AutomationStudioRunResultSummary {
  let changed = false;
  const said = (rows: readonly string[], settled: readonly string[] = []): string[] => {
    const skip = new Set(settled);
    return rows.map((row) => {
      const label = automationStudioRequestRowLabel(row);
      if (skip.has(row) || label === WITHHELD_LABEL || !label.trim()) return row;
      const withId = AutomationStudioRequestRowId.said(row, label);
      changed ||= withId !== row;
      return withId;
    });
  };
  const reads = summary.reads?.map((read): AutomationStudioResultReadAccount => !read.conditions?.some((entry) => entry.leftOutOnlyByThis?.length) ? read : {
    ...read,
    conditions: read.conditions.map((entry) => entry.leftOutOnlyByThis?.length ? { ...entry, leftOutOnlyByThis: said(entry.leftOutOnlyByThis, [...(entry.leftOutSettled ?? []), ...(entry.leftOutAlsoInResult ?? [])]) } : entry)
  });
  const recordSets = summary.recordSets.map((set): AutomationStudioResultRecordSetSummary => !set.processing?.conditions?.some((entry) => entry.leftOutOnlyByThis?.length) ? set : {
    ...set,
    processing: { ...set.processing, conditions: set.processing.conditions.map((entry) => entry.leftOutOnlyByThis?.length ? { ...entry, leftOutOnlyByThis: said(entry.leftOutOnlyByThis) } : entry) }
  });
  return changed ? { ...summary, ...(reads ? { reads } : {}), recordSets } : summary;
}
