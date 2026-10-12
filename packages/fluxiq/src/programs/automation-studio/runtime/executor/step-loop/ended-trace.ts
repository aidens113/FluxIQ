import type { AutomationStudioGraphExecutionTrace } from "../contracts.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";

/** The trace of a run the step loop ended at `currentNodeId`, cancelled or failed, saying why. */
export function automationStudioEndedTrace(
  ctx: AutomationStudioStepLoopContext,
  status: "cancelled" | "failed",
  currentNodeId: string,
  message: string
): AutomationStudioGraphExecutionTrace {
  return { status, startedAt: ctx.startedAt, finishedAt: ctx.now(), currentNodeId, attempts: ctx.attempts, values: ctx.values, effects: ctx.effects, regionTransitions: ctx.regionTransitions, message };
}
