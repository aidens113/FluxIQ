import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioFaultAssessment } from "../defensive/index.ts";
import type { AutomationStudioRunState } from "../run-state.ts";

/**
 * Puts one assessed fault on the run's defence ledger.
 *
 * Every fault goes on it, absorbed or not. A fault the run survived and left no
 * mark of is indistinguishable afterwards from a run that met nothing, and a
 * person debugging cannot tell a first-attempt success from a third.
 */
export function automationStudioRecordDefendedFault(
  runState: AutomationStudioRunState,
  nodeId: string,
  attempt: AutomationStudioNodeAttemptTrace,
  attemptNumber: number,
  fault: AutomationStudioFaultAssessment | undefined,
  outcome: "retried" | "continued" | "stopped",
  waitedMs: number
): void {
  if (!fault) return;
  runState.defence.record({
    nodeId,
    attemptId: attempt.attemptId,
    attemptNumber,
    outcome,
    category: fault.category,
    code: fault.code,
    source: fault.source,
    effect: fault.effect,
    reason: fault.reason,
    waitedMs,
    ...(fault.hintedWaitMs === undefined ? {} : { hintedWaitMs: fault.hintedWaitMs }),
    ...(fault.httpStatus === undefined ? {} : { httpStatus: fault.httpStatus })
  });
}
