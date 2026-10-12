import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioStepLifecycle, type AutomationStudioStepLifecycleOutcome } from "./lifecycle-dispatch.ts";
import { automationStudioStepOpenIncident } from "./lifecycle-incident.ts";
import { automationStudioStepStampFailureClass, automationStudioStepStampLifecycle } from "./lifecycle-stamps.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";

/**
 * On Retry (C3, C6 step 5): Core has permitted another attempt of `node`
 * after `attempt` failed, so the incident opens here if it has not already,
 * and the retry handlers in scope are dispatched before the wait. Whatever
 * they come to, a handler's record goes on the failed attempt when `attemptIndex`
 * names it; an attempt that was never kept (a readiness gate that did not
 * hold, before dispatch) hands it to the next attempt instead.
 *
 * Returns the incident with the outcome, so the caller can classify the
 * failed attempt against it.
 */
export async function automationStudioStepOnRetry(
  ctx: AutomationStudioStepLoopContext,
  node: AutomationStudioFlowNode,
  attempt: AutomationStudioNodeAttemptTrace,
  attemptIndex: number | undefined
): Promise<{ outcome: AutomationStudioStepLifecycleOutcome; incidentId: string | undefined }> {
  const incidentId = automationStudioStepOpenIncident(ctx, node, attempt);
  const outcome = await automationStudioStepLifecycle(ctx, {
    event: "retry",
    node,
    attemptNumber: ctx.arrival.attempts,
    attemptId: attempt.attemptId,
    outputsSoFar: attempt.outputs,
    lastingActStatus: "none",
    ...(incidentId ? { incidentId } : {})
  });
  const lifecycle = outcome.lifecycle;
  if (attemptIndex !== undefined) automationStudioStepStampLifecycle(ctx, attemptIndex, lifecycle);
  else if (lifecycle) ctx.lifecycle.pending = lifecycle;
  // A route to a calling frame's checkpoint ends this frame here: the failed attempt was a planned fail.
  if (outcome.kind === "return" && outcome.trace.checkpointRoute && attemptIndex !== undefined) {
    automationStudioStepStampFailureClass(ctx, attemptIndex, { uncertainAct: false, onFail: [{ kind: "handler", handlerId: lifecycle?.handlerId ?? "", when: "true", outcome: "route" }] }, incidentId);
  }
  return { outcome, incidentId };
}
