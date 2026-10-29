// The attempt a step gets when the item its target came from is gone (t786,
// design D6): built without dispatching, as the not-shown attempt of a
// readiness gate is (`../state-routing/could-not-run.ts`).

import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { nodeAttemptWithAdaptationIds } from "../attempt-trace.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { AUTOMATION_STUDIO_TARGET_GONE_CODE } from "./gone-code.ts";

/**
 * Failed as `target_not_found` under `executor.target.gone`, not retryable and
 * unacted: no retry is spent on it, no in-run repair is asked for it (no change
 * to the step can bring the item back), and it goes down the step's normal
 * failure path -- On Fail, the failed route, the continuation.
 */
export function automationStudioTargetGoneAttempt(node: AutomationStudioFlowNode, attemptId: string, at: number): AutomationStudioNodeAttemptTrace {
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
    message: "The item it was for is no longer on the page.",
    failure: { category: "target_not_found", code: AUTOMATION_STUDIO_TARGET_GONE_CODE, retryable: false, stage: "target_resolution", effect: "unacted" }
  });
}
