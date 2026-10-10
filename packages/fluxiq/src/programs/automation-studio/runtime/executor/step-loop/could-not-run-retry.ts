import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioNodeRetryPolicy } from "../retry-policy.ts";
import { automationStudioAbsentStepSkip } from "../step-skip/index.ts";
import type { AutomationStudioStepLifecycleOutcome } from "./lifecycle-dispatch.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";
import { automationStudioStepOnRetry } from "./on-retry.ts";

/**
 * On Retry for a step that could not run (C6 step 5), before safe state
 * routing: the Flow's declared way past an optional step comes first and is
 * left to state routing, and a step with no attempt left is not retried, so
 * neither dispatches. Otherwise the retry handlers in scope run first, and
 * state routing runs only when none of them took the run on.
 *
 * `attemptIndex` names the failed attempt when the step was dispatched; a
 * readiness gate that did not hold has none, and the handler's record then
 * goes on the attempt that follows. `undefined` when nothing was dispatched.
 */
export async function automationStudioStepRetryBeforeRouting(
  ctx: AutomationStudioStepLoopContext,
  step: { node: AutomationStudioFlowNode; attempt: AutomationStudioNodeAttemptTrace; attemptIndex: number | undefined; retryPolicy: AutomationStudioNodeRetryPolicy }
): Promise<{ outcome: AutomationStudioStepLifecycleOutcome; incidentId: string | undefined } | undefined> {
  const { node, attempt } = step;
  if (!ctx.options.invocation || automationStudioAbsentStepSkip(ctx.flow, node, attempt)) return undefined;
  if (ctx.arrival.attempts >= step.retryPolicy.maxAttempts) return undefined;
  return await automationStudioStepOnRetry(ctx, node, attempt, step.attemptIndex);
}
