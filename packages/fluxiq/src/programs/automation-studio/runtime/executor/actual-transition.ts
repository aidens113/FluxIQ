import type { AutomationStudioActualTransition, AutomationStudioNodeAttemptTrace } from "./contracts.ts";

export function actualTransitionForAttempt(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioActualTransition {
  const durationMs = attempt.finishedAt === undefined ? undefined : Math.max(0, attempt.finishedAt - attempt.startedAt);
  return {
    transitionId: `${attempt.attemptId}.actual`,
    nodeId: attempt.nodeId,
    definitionId: attempt.definitionId,
    status: attempt.status,
    ...(attempt.route ? { route: attempt.route } : {}),
    outputs: attempt.outputs,
    effects: attempt.effects,
    ...(attempt.message ? { message: attempt.message } : {}),
    startedAt: attempt.startedAt,
    ...(attempt.finishedAt !== undefined ? { finishedAt: attempt.finishedAt } : {}),
    ...(durationMs !== undefined ? { durationMs } : {})
  };
}
