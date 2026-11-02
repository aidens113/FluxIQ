import type { TrialNotRunHistory } from "./not-run-history.ts";

/**
 * One step of a trial not run on some passes, as a part's proof names it (t796, the trial's act ledger,
 * `../../service/candidate-trial/act-ledger.ts`): its node and label, why (`guarded`: a guard routed past it because the
 * optional step it runs only after, `after` by its label, was skipped; `unreached`: the pass never got to it), the passes
 * it was not run on, and `of`, its repeat's passes (absent outside a repeat, where `passes` is `[1]`).
 */

export type TrialNotRun = Omit<TrialNotRunHistory, "label" | "passes"> & { label: string; passes: number[] };
