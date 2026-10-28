// The read of what a live trial changed, after its end view (t775 D1): the
// trial request's `siteChange`, handed the trial's acts (`./acts.ts`). The
// whole-candidate and subflow trial ports both read it this way, inside the
// judge's summary (`../../service/candidate-trial/summary.ts`). A look that
// fails leaves its witness unread (`./readings.ts`); anything else that fails
// here propagates, so the trial's evidence is said unreadable rather than
// judged without the change it should show.

import { automationStudioTrialChangeActs } from "./acts.ts";
import type { AutomationStudioTrialChangeAct, AutomationStudioTrialChangeOutcome } from "./contracts.ts";

/** The read (header), for a request that carries `siteChange`. */
export function automationStudioTrialChangeAfterRead(
  request: { signal: AbortSignal; siteChange: (acts: readonly AutomationStudioTrialChangeAct[], signal?: AbortSignal) => Promise<AutomationStudioTrialChangeOutcome> },
  landed: Parameters<typeof automationStudioTrialChangeActs>[0],
  already: Parameters<typeof automationStudioTrialChangeActs>[1]
): () => Promise<AutomationStudioTrialChangeOutcome | undefined> {
  return async () => await request.siteChange(automationStudioTrialChangeActs(landed, already), request.signal);
}
