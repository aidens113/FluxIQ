import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
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
  // Node results come from built-in, importer, and trusted-local code, so the
  // failure record is parsed here, where results become attempts. A record on
  // a success contradicts it, and one that does not parse is dropped whole.
  const failure = finishedStatus === "succeeded" ? null : parseAutomationStudioFailureRecord(result.failure);
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
    effects: result.effects ?? [],
    ...(result.message ? { message: result.message } : {}),
    ...(failure ? { failure } : {}),
    ...(result.targetResolution ? { targetResolution: result.targetResolution } : {})
  };
  return { ...attempt, transitionComparison: compareAutomationStudioTransition(node, attempt) };
}
