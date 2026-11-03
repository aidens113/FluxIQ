import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/runtime";
import { readRuntimeTargetActionability } from "../../../runtime/result-control/index.ts";
import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import { automationStudioNodeAdaptationIds } from "../../../flows/executable/adaptation/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { compareAutomationStudioTransition } from "../transitions/index.ts";

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
  const actionability = readRuntimeTargetActionability(result);
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
    ...(actionability.kind === "valid" ? { actionability: actionability.record } : {}),
    ...(result.targetResolution ? { targetResolution: result.targetResolution } : {})
  };
  return { ...attempt, transitionComparison: compareAutomationStudioTransition(node, attempt) };
}

/**
 * The attempt, carrying the adaptation ids its node was stamped with and no
 * others. The node's metadata, read by `automationStudioNodeAdaptationIds`, is
 * the only source: an `adaptationIds` the attempt already holds is dropped, and
 * a malformed node list yields none at all rather than a trusted part of it,
 * because a replay recorder reads this field as proof of which saved changes
 * ran. The reader hands back a fresh array, so neither the trace nor the Flow
 * document can change the other's list afterwards.
 */
export function nodeAttemptWithAdaptationIds(
  node: AutomationStudioFlowNode,
  attempt: AutomationStudioNodeAttemptTrace
): AutomationStudioNodeAttemptTrace {
  const adaptationIds = automationStudioNodeAdaptationIds(node.metadata);
  if (adaptationIds) return { ...attempt, adaptationIds };
  if (!("adaptationIds" in attempt)) return attempt;
  const unstamped = { ...attempt };
  delete unstamped.adaptationIds;
  return unstamped;
}
