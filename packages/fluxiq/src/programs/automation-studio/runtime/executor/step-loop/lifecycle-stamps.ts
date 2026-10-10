import type { AutomationStudioLifecycleTrace } from "../contracts.ts";
import type { AutomationStudioFailureClass } from "../lifecycle/index.ts";
import { automationStudioLifecycleHasHandlers, markAutomationStudioIncidentFailure, type AutomationStudioFailureFacts } from "../lifecycle-run/index.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";

/**
 * Classifies the failed attempt at `attemptIndex` once the run has decided
 * what it came to (C6, "What counts as a true failure"), and marks its
 * incident a true failure when it is one: that mark is the only trigger for
 * in-run repair, so it is made in every run.
 *
 * The attempt's trace `failureClass` is stamped only in a run that has a
 * Handler in scope (`automationStudioLifecycleHasHandlers`), so a Flow without
 * Handlers is traced exactly as it was before handlers existed.
 *
 * Returns the verdict, which the step loop reads to decide whether the
 * failure may ask for an in-run repair; nothing when the run is unframed.
 */
export function automationStudioStepStampFailureClass(
  ctx: AutomationStudioStepLoopContext,
  attemptIndex: number,
  facts: AutomationStudioFailureFacts,
  incidentId?: string
): AutomationStudioFailureClass | undefined {
  const run = ctx.options.invocation?.run;
  if (!run) return undefined;
  const { verdict, failureClass } = markAutomationStudioIncidentFailure(run, incidentId, facts);
  if (failureClass && automationStudioLifecycleHasHandlers(run)) ctx.attempts[attemptIndex] = { ...ctx.attempts[attemptIndex]!, failureClass };
  return verdict;
}

/** Stamps the record of the handler that ran at this attempt's boundary, when one ran. */
export function automationStudioStepStampLifecycle(ctx: AutomationStudioStepLoopContext, attemptIndex: number, lifecycle: AutomationStudioLifecycleTrace | undefined): void {
  if (!lifecycle) return;
  ctx.attempts[attemptIndex] = { ...ctx.attempts[attemptIndex]!, lifecycle };
}
