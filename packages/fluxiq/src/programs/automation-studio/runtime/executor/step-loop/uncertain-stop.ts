import type { AutomationStudioGraphExecutionTrace } from "../contracts.ts";
import { automationStudioEndedTrace } from "./ended-trace.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";

/**
 * The trace of a run stopped as Outcome uncertain: a lasting act may have
 * landed and nothing settled whether it did, so nothing moves the run past it
 * (C6 step 4). Both ways a run stops so -- the failed attempt's effect check
 * answering `unknown` (`./failed-attempt.ts`) and a handler meeting that Core
 * stop (`./lifecycle-dispatch.ts`) -- end through here.
 *
 * `message` is the plain sentence for people. `failure` is the closed code a
 * program checks, `run.outcome_uncertain`, because the failed attempt's own
 * failure (a timeout, say) says how the act went wrong, not why the run
 * stopped there.
 */
export function automationStudioOutcomeUncertainTrace(ctx: AutomationStudioStepLoopContext, nodeId: string, message: string): AutomationStudioGraphExecutionTrace {
  return {
    ...automationStudioEndedTrace(ctx, "failed", nodeId, message),
    failure: { category: "ambiguous_or_unknown", code: "run.outcome_uncertain", retryable: false, stage: "confirmation", effect: "ambiguous" }
  };
}
