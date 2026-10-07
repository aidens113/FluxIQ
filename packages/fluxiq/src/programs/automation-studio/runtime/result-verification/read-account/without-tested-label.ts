// A summary as a model is shown it: no read condition carries `testedLabel`.
//
// `testedLabel` is Core's own bookkeeping (`./accounts.ts`): it says which
// conditions tested the row's own label, so `../request-rows/` may flag the rows
// such a condition alone left out (live run `run-mux6naez-6c20f26e`). No model
// instruction describes it, so no model is shown it: the result judge's copy
// drops it (`./judge-paging.ts`, after the rows are flagged, `../verify.ts`),
// and so does the summary a refuted run's repair is handed
// (`../../recovery/annotation/annotate.ts`). The summary given is never changed.
import type { AutomationStudioRunResultSummary } from "../contracts.ts";

/** The summary with no read condition's `testedLabel`; the same object when none carries one. */
export function automationStudioResultSummaryWithoutTestedLabel(summary: AutomationStudioRunResultSummary): AutomationStudioRunResultSummary {
  if (!summary.reads?.some((read) => read.conditions?.some((condition) => condition.testedLabel !== undefined))) return summary;
  return {
    ...summary,
    reads: summary.reads.map((read) => read.conditions?.some((condition) => condition.testedLabel !== undefined)
      ? { ...read, conditions: read.conditions.map(({ testedLabel: _tested, ...condition }) => condition) }
      : read)
  };
}
