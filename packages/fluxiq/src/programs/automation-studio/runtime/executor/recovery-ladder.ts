import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace, AutomationStudioRecoveryCandidate, AutomationStudioRecoveryDecision, AutomationStudioRecoveryLookupInput, AutomationStudioTransitionComparison } from "./contracts.ts";
import { recoveryBudgetExhaustion } from "./recovery-budget.ts";

export function chooseAutomationStudioRecovery(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  attempt: AutomationStudioNodeAttemptTrace,
  comparison: AutomationStudioTransitionComparison | undefined,
  failedEdge: AutomationStudioFlowEdge | null,
  options: AutomationStudioGraphExecutionOptions,
  budgetState: {
    failedAttemptsForAction: number;
    recoveryAttemptsForSubflow: number;
    reroutesForRun: number;
    llmAttemptsForRun: number;
  }
): AutomationStudioRecoveryDecision {
  const lookup: AutomationStudioRecoveryLookupInput = {
    nodeId: node.id,
    definitionId: node.definitionId,
    attemptId: attempt.attemptId,
    comparisonStatus: comparison?.status ?? "unknown",
    ...(options.currentSubflowId ? { currentSubflowId: options.currentSubflowId } : {}),
    ...(attempt.route ? { failedRoute: attempt.route } : {})
  };
  const approvedPatchNodeIds = new Set(options.approvedRuntimePatchNodeIds ?? []);
  const budget = options.recoveryBudget ?? {};
  const candidates: AutomationStudioRecoveryCandidate[] = [];
  const budgetExhausted = recoveryBudgetExhaustion(budget, budgetState);
  if (failedEdge && !budgetExhausted.retry && !budgetExhausted.recovery && !budgetExhausted.reroute) {
    candidates.push({
      kind: "deterministic_path",
      priority: 1,
      label: "Follow failed route",
      targetNodeId: failedEdge.targetNodeId,
      edgeId: failedEdge.id,
      reason: `Flow edge ${failedEdge.id} handles route ${failedEdge.sourcePortId ?? "failed"}.`
    });
  }
  for (const recoveryNode of flow.nodes.filter((candidate) => candidate.definitionId === "builtin.policy.recovery")) {
    if (recoveryNode.id === node.id) continue;
    const incoming = flow.edges.find((edge) => edge.sourceNodeId === node.id && edge.targetNodeId === recoveryNode.id);
    if (budgetExhausted.recovery || (!approvedPatchNodeIds.has(recoveryNode.id) && budgetExhausted.reroute)) continue;
    candidates.push({
      kind: approvedPatchNodeIds.has(recoveryNode.id) ? "approved_runtime_patch" : "reroute",
      priority: approvedPatchNodeIds.has(recoveryNode.id) ? 2 : 3,
      label: approvedPatchNodeIds.has(recoveryNode.id) ? "Apply approved recovery patch" : "Reroute to recovery node",
      targetNodeId: recoveryNode.id,
      ...(incoming ? { edgeId: incoming.id } : {}),
      reason: incoming ? `Recovery node ${recoveryNode.id} is already connected from ${node.id}.` : `Recovery node ${recoveryNode.id} is available in this Flow.`
    });
  }
  if (!budgetExhausted.llm) {
    candidates.push({
      kind: "llm_diagnosis",
      priority: 4,
      label: "Request LLM diagnosis",
      reason: "No lower-priority deterministic recovery fully resolved the failed transition."
    });
  }
  candidates.sort((left, right) => left.priority - right.priority || left.label.localeCompare(right.label));
  const selected = candidates[0];
  return {
    lookup,
    candidates,
    ...(selected ? { selected } : {}),
    metadata: {
      budgetState,
      ...(budgetExhausted.message ? { budgetExhausted: budgetExhausted.message } : {})
    }
  };
}

export function failureMessageForRecoveryStop(recoveryDecision: AutomationStudioRecoveryDecision, attempt: AutomationStudioNodeAttemptTrace): string | undefined {
  if (recoveryDecision.selected?.kind === "llm_diagnosis") return "Recovery ladder reached LLM diagnosis fallback before a configured provider was invoked.";
  if (recoveryDecision.metadata?.budgetExhausted) return String(recoveryDecision.metadata.budgetExhausted);
  return attempt.message;
}
