// The judge's copy of a summary, with each read condition's left-out rows whose
// item is also in the result said so (t624).
//
// **Why.** A8 bigbox `run-mv96rz6d-745e2940`: a presence condition alone left
// out six rows that were second copies of items whose first copy the read kept
// and stored. Judges 0052, 0053, 0084 and 0123 read them as items the Flow
// dropped and answered no over an exact answer. Core already knew: the check
// of a no's rows says " (also in the result)" (`checked-rows.ts`), and a yes is
// never asked to quote beside such a row (`unquoted-rows.ts`, `inResult`). The
// judge's evidence never said it.
//
// **Which rows.** A row of a read condition's `leftOutOnlyByThis` whose label
// -- the row as given, less Core's id and its tested value
// (`summary-reads.ts`) -- is a stored row's label, over every record set the
// summary holds. A withheld label is no row's own, so it is never marked. They
// are listed, as given, in `leftOutAlsoInResult`, with `alsoInResult`, Core's
// sentence. Nothing else changes: the rows stay in `leftOutOnlyByThis`.
//
// **The judge's copy only.** As `summary-with-row-ids.ts`: the summary given is
// never changed, and the verdict reads the rows as before.

import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioRequestRowLabel, automationStudioRequestRowsReads } from "./summary-reads.ts";

/** What a label that may not be said reads as (`../read-account/alone-rows.ts`). */
const WITHHELD_LABEL = "(withheld)";

/** Core's sentence beside the marked rows (header). */
const ALSO_IN_RESULT = "Each row in leftOutAlsoInResult is one this condition alone left out whose label is also a row of the result: "
  + "another copy of the same item was kept, so that item is not missing from the result, and none of these rows is an item the condition took out of it.";

/** The summary with each read condition's left-out rows that are also in the result marked (header); the same object when there are none. */
export function automationStudioResultSummaryWithAlsoInResult(summary: AutomationStudioRunResultSummary): AutomationStudioRunResultSummary {
  if (!summary.reads?.some((read) => read.conditions?.some((entry) => entry.leftOutOnlyByThis?.length))) return summary;
  const stored = new Set(automationStudioRequestRowsReads(summary, true).stored.map((row) => row.label));
  let changed = false;
  const reads = summary.reads.map((read): AutomationStudioResultReadAccount => {
    if (!read.conditions?.length) return read;
    let marked = false;
    const conditions = read.conditions.map((entry) => {
      const also = (entry.leftOutOnlyByThis ?? []).filter((row) => {
        const label = automationStudioRequestRowLabel(row);
        return label !== WITHHELD_LABEL && stored.has(label);
      });
      if (!also.length) return entry;
      marked = true;
      return { ...entry, leftOutAlsoInResult: [...new Set(also)], alsoInResult: ALSO_IN_RESULT };
    });
    if (!marked) return read;
    changed = true;
    return { ...read, conditions };
  });
  return changed ? { ...summary, reads } : summary;
}
