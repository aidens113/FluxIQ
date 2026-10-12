// Which frames an attempt ran in (state-aware recovery plan, C1, C11).

import type { AutomationStudioGraphExecutionTrace } from "../contracts.ts";
import type { AutomationStudioInvocationOptions } from "./invocation-options.ts";

/**
 * The trace with `framePath` stamped on every attempt its own frame produced:
 * the invocation ids from the run's outermost frame down to this one. An
 * attempt that already carries a path -- one a resumed run's seed brought
 * back -- keeps it. A child's attempts sit in its own trace, which the child's
 * frame stamped, so a parent never restamps them.
 */
export function automationStudioTraceInFrame(
  trace: AutomationStudioGraphExecutionTrace,
  invocation: AutomationStudioInvocationOptions | undefined
): AutomationStudioGraphExecutionTrace {
  if (!invocation || trace.attempts.every((attempt) => attempt.framePath)) return trace;
  const { stack } = invocation.run;
  const at = stack.indexOf(invocation.frame);
  const framePath = (at >= 0 ? stack.slice(0, at + 1) : [...stack, invocation.frame]).map((frame) => frame.invocationId);
  return { ...trace, attempts: trace.attempts.map((attempt) => attempt.framePath ? attempt : { ...attempt, framePath }) };
}
