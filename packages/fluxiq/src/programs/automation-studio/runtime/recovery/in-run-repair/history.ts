// What an in-run repair is told the run already did (state-aware recovery
// plan, C6 step 8): the incident that became a true failure, the recoveries
// tried for it and before it, and the acts already completed, which a fix must
// not repeat.
//
// Ids, codes, counts and outcomes only, read off the attempts the executor
// recorded. A value the run resolved never reaches this: an attempt's inputs
// and outputs are not read, and neither is any sentence a page produced.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import type { AutomationStudioRecoveryIncident } from "../../executor/lifecycle/index.ts";
import type { AutomationStudioLlmInRunRepairAttempt, AutomationStudioLlmInRunRepairContext, AutomationStudioLlmInRunRepairRecovery } from "../../llm/index.ts";

/** The part of the in-run repair slot this builds. */
export type AutomationStudioInRunRepairHistory = Pick<AutomationStudioLlmInRunRepairContext, "incident" | "failedAttempt" | "recoveriesTried" | "actsCompleted">;

/** The incident, the recoveries already tried, and the acts already completed. */
export function automationStudioInRunRepairHistory(input: {
  incident: AutomationStudioRecoveryIncident;
  failedAttempt: AutomationStudioNodeAttemptTrace;
  attempts: readonly AutomationStudioNodeAttemptTrace[];
}): AutomationStudioInRunRepairHistory {
  const { incident, failedAttempt } = input;
  return {
    incident: {
      incidentId: incident.incidentId,
      origin: { framePath: [...incident.origin.framePath], nodeId: incident.origin.nodeId, failureCode: incident.origin.failureCode },
      handlersRun: [...incident.handlersRun],
      routes: incident.routes.map((route) => ({ checkpointId: route.checkpointId, handlerId: route.handlerId })),
      alternatives: incident.alternatives.map((alternative) => ({ handlerId: alternative.handlerId, ...(alternative.subflowId ? { subflowId: alternative.subflowId } : {}) })),
      trueFailure: incident.trueFailure === true
    },
    failedAttempt: attemptShape(failedAttempt),
    recoveriesTried: input.attempts.flatMap(recoveriesOf),
    actsCompleted: input.attempts.filter((attempt) => attempt.status === "succeeded").map((attempt) => ({
      attemptId: attempt.attemptId,
      nodeId: attempt.nodeId,
      definitionId: attempt.definitionId,
      ...(attempt.framePath?.length ? { framePath: [...attempt.framePath] } : {}),
      ...(attempt.effectCheck ? { effectCheck: attempt.effectCheck.result } : {})
    }))
  };
}

function attemptShape(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioLlmInRunRepairAttempt {
  return {
    attemptId: attempt.attemptId,
    nodeId: attempt.nodeId,
    definitionId: attempt.definitionId,
    status: attempt.status,
    ...(attempt.route ? { route: attempt.route } : {}),
    ...(attempt.failure ? { failure: { category: attempt.failure.category, code: attempt.failure.code, ...(attempt.failure.retryable !== undefined ? { retryable: attempt.failure.retryable } : {}) } } : {}),
    ...(attempt.failureClass ? { failureClass: attempt.failureClass } : {}),
    ...(attempt.framePath?.length ? { framePath: [...attempt.framePath] } : {})
  };
}

/** Every recovery one attempt records: a retry, a handler, a state route, a ladder rung, an earlier repair. */
function recoveriesOf(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioLlmInRunRepairRecovery[] {
  const at = { attemptId: attempt.attemptId, nodeId: attempt.nodeId };
  const tried: AutomationStudioLlmInRunRepairRecovery[] = [];
  if (attempt.retry) tried.push({ ...at, kind: "retry", attemptNumber: attempt.retry.attemptNumber, maxAttempts: attempt.retry.maxAttempts, rung: attempt.retry.rung });
  if (attempt.lifecycle) {
    tried.push({ ...at, kind: "handler", handlerId: attempt.lifecycle.handlerId, event: attempt.lifecycle.event, disposition: attempt.lifecycle.disposition.kind, completionCheck: attempt.lifecycle.completionCheck });
  }
  if (attempt.stateRouting) {
    tried.push({ ...at, kind: "state_route", outcome: attempt.stateRouting.outcome, ...(attempt.stateRouting.toNodeId ? { toNodeId: attempt.stateRouting.toNodeId } : {}), ...(attempt.stateRouting.refused?.length ? { refused: attempt.stateRouting.refused.map((refusal) => refusal.guard) } : {}) });
  }
  const selected = attempt.recoveryDecision?.selected;
  if (selected) tried.push({ ...at, kind: "ladder", rung: selected.kind, ...(selected.targetNodeId ? { targetNodeId: selected.targetNodeId } : {}) });
  if (attempt.repair) tried.push({ ...at, kind: "repair", outcome: attempt.repair.outcome, unit: attempt.repair.unit as unknown as JsonObject });
  if (attempt.failureClass && attempt.failureClass !== "true_failure") tried.push({ ...at, kind: "counted", failureClass: attempt.failureClass });
  return tried;
}
