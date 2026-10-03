import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { nodeAttemptWithAdaptationIds } from "../attempt-trace.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";

/**
 * Whether an attempt says its step **cannot run**: it failed, and the failure
 * category is `target_not_found`, the one category that says the target was
 * not on the page. That includes the attempt a readiness gate that did not
 * hold synthesizes (`automationStudioNotShownAttempt`).
 *
 * `target_ambiguous` is not: something matched, so the page has the target.
 * An action that ran and failed is not, and neither is a target covered by a
 * layer (category `unexpected_state`, stage `execution`): those keep the
 * recovery ladder, whose `clear_interference` rung owns the covered case.
 * Only Core's own failure vocabulary is read.
 */
export function automationStudioCouldNotRun(attempt: Pick<AutomationStudioNodeAttemptTrace, "status" | "failure">): boolean {
  return attempt.status === "failed" && attempt.failure?.category === "target_not_found";
}

/**
 * The attempt a step gets when its readiness gate judged at least one
 * condition and the state did not hold: failed as `target_not_found` under
 * `executor.ready_state.not_shown`, with nothing dispatched. It is built
 * before dispatch so state routing can decide on it; when routing finds no
 * way on, the node is dispatched as before and this attempt is dropped.
 */
export function automationStudioNotShownAttempt(node: AutomationStudioFlowNode, attemptId: string, at: number): AutomationStudioNodeAttemptTrace {
  return nodeAttemptWithAdaptationIds(node, {
    attemptId,
    nodeId: node.id,
    definitionId: node.definitionId,
    startedAt: at,
    finishedAt: at,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    failure: { category: "target_not_found", code: "executor.ready_state.not_shown", retryable: false, stage: "target_resolution" }
  });
}
