// The read of what a live trial changed, after its end view (t775 D1): the
// trial request's `siteChange`, handed the trial's acts (`./acts.ts`). The
// whole-candidate and subflow trial ports both read it this way, inside the
// judge's summary (`../../service/candidate-trial/summary.ts`). A look that
// fails leaves its witness unread (`./readings.ts`); anything else that fails
// here propagates, so the trial's evidence is said unreadable rather than
// judged without the change it should show.
//
// **With the steps it never ran (t796).** A port that read the trial's act
// ledger (`../../service/candidate-trial/not-run.ts`) hands its steps not run on
// some passes too; they go with the acts as `not_run` entries, which only the
// part proofs read (`./part-acting.ts`, `./proof.ts`). A port that hands none
// reads as before.

import { automationStudioTrialChangeActs } from "./acts.ts";
import type { AutomationStudioTrialChangeAct, AutomationStudioTrialChangeNotRunAct, AutomationStudioTrialChangeOutcome } from "./contracts.ts";

/** A step the trial never ran on some passes, as the trial's act ledger says it (`AutomationStudioTrialNotRunStep`, structurally). */
type NotRunStep = { nodeId: string; definitionId: string; label: string; key?: string | undefined; reason: "guarded" | "unreached"; after?: string | undefined; passes: readonly number[]; of?: number | undefined; lasting: boolean };

/** The read (header), for a request that carries `siteChange`. */
export function automationStudioTrialChangeAfterRead(
  request: { signal: AbortSignal; siteChange: (acts: readonly AutomationStudioTrialChangeAct[], signal?: AbortSignal) => Promise<AutomationStudioTrialChangeOutcome> },
  landed: Parameters<typeof automationStudioTrialChangeActs>[0],
  already: Parameters<typeof automationStudioTrialChangeActs>[1],
  notRun: readonly NotRunStep[] = []
): () => Promise<AutomationStudioTrialChangeOutcome | undefined> {
  return async () => await request.siteChange([...automationStudioTrialChangeActs(landed, already), ...notRun.map(notRunAct)], request.signal);
}

/** A step not run, as an act entry (header). */
function notRunAct(step: NotRunStep): AutomationStudioTrialChangeNotRunAct {
  return {
    outcome: "not_run", definitionId: step.definitionId, ...(step.key !== undefined ? { key: step.key } : {}), lasting: step.lasting,
    notRun: { nodeId: step.nodeId, label: step.label, reason: step.reason, ...(step.after !== undefined ? { after: step.after } : {}), passes: [...step.passes], ...(step.of !== undefined ? { of: step.of } : {}) }
  };
}
