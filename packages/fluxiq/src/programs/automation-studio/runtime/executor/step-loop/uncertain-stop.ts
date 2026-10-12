import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { emitAutomationStudioActivityThought } from "../../activity/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../contracts.ts";
import { automationStudioAssessAttemptFault, automationStudioRunEffectCheck, type AutomationStudioEffectCheckResult } from "../defensive/index.ts";
import { automationStudioHostEffectCheck } from "../transition-comparison.ts";
import { automationStudioRecordDefendedFault } from "./defended-fault.ts";
import { automationStudioEndedTrace } from "./ended-trace.ts";
import { automationStudioStepStampFailureClass } from "./lifecycle-stamps.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";

/**
 * The trace of a run stopped as Outcome uncertain: a lasting act may have
 * landed and nothing settled whether it did, so nothing moves the run past it
 * (C6 step 4). Both ways a run stops so -- the failed attempt's effect check
 * answering `unknown` (`./failed-attempt.ts`) and a handler meeting that Core
 * stop (`./lifecycle-dispatch.ts`) -- end through here, and so does a required
 * run whose command's outcome stayed unknown (below).
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

/** Why the run stopped, then what the page showed, as a person reads it. */
const STOPPED = "The step's answer never came back, and a run that must prove every act stops when one cannot be proved.";
const PAGE_SAYS: Readonly<Record<AutomationStudioEffectCheckResult, string>> = {
  landed: "The page shows the step took effect; it was not done again.",
  not_landed: "The page shows the step did not take effect; it was not tried again, because this run makes each act at most once.",
  unknown: "Nothing on the page shows whether the step took effect; it was not done again."
};

/**
 * A required-mode run whose command's outcome stayed unknown -- its attempt
 * failed with `executor.required_outcome_unknown` (`../command-scope/`) --
 * stops here, as Outcome uncertain (state-aware recovery plan C6 step 4, C8;
 * t427).
 *
 * The run is latched: its command ledger holds the outcome `unknown`, and no
 * command, checkpoint or consumption succeeds after it, which is what keeps a
 * required run exactly-once. So nothing below runs -- no retry, handler, route,
 * continuation or repair -- and no checkpoint is asked. The page's effect check
 * still runs, only to say what the page showed: its result stays on the
 * attempt, and the stop's reason says it in plain words. It never moves the
 * run on, whatever it found.
 */
export async function automationStudioStepRequiredOutcomeStop(ctx: AutomationStudioStepLoopContext, node: AutomationStudioFlowNode, attemptIndex: number): Promise<AutomationStudioGraphExecutionTrace> {
  const { attempts, options, runState, now } = ctx;
  const result = await automationStudioRunEffectCheck(automationStudioHostEffectCheck(node, options), attempts[attemptIndex]!, ctx.arrival.attempts);
  attempts[attemptIndex] = { ...attempts[attemptIndex]!, effectCheck: { result, checkedAt: now() } };
  const reason = `${STOPPED} ${PAGE_SAYS[result]}`;
  emitAutomationStudioActivityThought({ phase: "repairing", title: "Outcome uncertain", text: reason, ref: node.id });
  automationStudioStepStampFailureClass(ctx, attemptIndex, { uncertainAct: true, onFail: [] });
  const fault = automationStudioAssessAttemptFault(attempts[attemptIndex]!, node, now());
  automationStudioRecordDefendedFault(runState, node.id, attempts[attemptIndex]!, ctx.arrival.attempts, fault ? { ...fault, reason } : undefined, "stopped", 0);
  return automationStudioOutcomeUncertainTrace(ctx, node.id, `Outcome uncertain: ${reason}`);
}
