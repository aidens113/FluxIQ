import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationNodeExecutionResult } from "../../nodes/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "./contracts.ts";
import { compareAutomationStudioTransition } from "./transition-comparison.ts";

export function nodeAttemptFromResult(
  node: AutomationStudioFlowNode,
  startedAt: number,
  finishedAt: number,
  attemptNumber: number,
  inputs: Record<string, JsonValue>,
  result: AutomationNodeExecutionResult
): AutomationStudioNodeAttemptTrace {
  const finishedStatus = result.status === "failed" ? "failed" : result.status === "waiting" ? "waiting" : "succeeded";
  const route = result.route ?? (result.status === "failed" ? "failed" : "success");
  const attempt: AutomationStudioNodeAttemptTrace = {
    attemptId: `${node.id}.attempt.${attemptNumber}`,
    nodeId: node.id,
    definitionId: node.definitionId,
    startedAt,
    finishedAt,
    status: finishedStatus,
    route,
    inputs,
    outputs: (result.outputs ?? {}) as Record<string, JsonValue>,
    effects: result.effects ?? []
  };
  return { ...attempt, transitionComparison: compareAutomationStudioTransition(node, attempt) };
}
