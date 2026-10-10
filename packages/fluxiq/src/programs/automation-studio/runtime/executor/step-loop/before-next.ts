import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioStepRecordCompletedAct } from "./already-done.ts";
import { automationStudioStepLifecycle } from "./lifecycle-dispatch.ts";
import { automationStudioStepStampLifecycle } from "./lifecycle-stamps.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";
import type { AutomationStudioStepOutcome } from "./loop-outcome.ts";

/**
 * Before Next (C3): the attempt at `attemptIndex` succeeded and was verified,
 * and the edge out of it is not chosen yet. A handler that ran leaves its
 * record on the attempt; one that routed to a checkpoint moves the run there
 * (`next`), and a Core stop ends it (`return`). Otherwise, `resume` included,
 * the step loop chooses the success edge as it always has: the action is not
 * run again. The caller fires this only on a verified success leaving by
 * `success`, never on a skipped step, a state held or an answered question.
 * A lasting act that verified success is recorded in the run's completed-act
 * ledger first, so a route back from here never repeats it (`./already-done.ts`).
 */
export async function automationStudioStepBeforeNext(
  ctx: AutomationStudioStepLoopContext,
  node: AutomationStudioFlowNode,
  attemptIndex: number
): Promise<Extract<AutomationStudioStepOutcome, { kind: "return" | "next" }> | undefined> {
  const attempt = ctx.attempts[attemptIndex]!;
  automationStudioStepRecordCompletedAct(ctx, node, attemptIndex);
  const outcome = await automationStudioStepLifecycle(ctx, {
    event: "before_next",
    node,
    attemptNumber: ctx.arrival.attempts,
    attemptId: attempt.attemptId,
    outputsSoFar: attempt.outputs,
    lastingActStatus: "none"
  });
  automationStudioStepStampLifecycle(ctx, attemptIndex, outcome.lifecycle);
  if (outcome.kind === "return") return outcome;
  return outcome.kind === "route" ? { kind: "next", node: outcome.node } : undefined;
}
