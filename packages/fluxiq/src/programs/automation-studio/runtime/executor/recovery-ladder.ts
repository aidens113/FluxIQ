import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioLadderRungKind, AutomationStudioNodeAttemptTrace, AutomationStudioRecoveryCandidate, AutomationStudioRecoveryDecision, AutomationStudioRecoveryLookupInput, AutomationStudioTransitionComparison } from "./contracts.ts";
import { recoveryBudgetExhaustion } from "./recovery-budget.ts";

/**
 * What the executor already knows about this failure, which decides which
 * deterministic rungs are worth offering.
 *
 * `consumed` is the heart of it. Every candidate still on the list that is not
 * `llm_diagnosis` tells the adaptive classifier a deterministic answer is
 * available and stops the model being consulted at all, so a rung that has
 * already run has to leave the list rather than sit on it.
 */
export type AutomationStudioLadderState = {
  /** Rungs already run for this arrival at the node. */
  consumed: ReadonlySet<AutomationStudioLadderRungKind>;
  /** How many times this node has been attempted at this arrival, the failed one included. */
  attemptsForNode: number;
  maxAttempts: number;
  /** Whether the failure record says the same attempt, unchanged, could succeed. */
  retryable: boolean;
  /** Whether the host confirmed the state this node was to produce despite the failure. */
  expectationSatisfied: boolean;
  /** Whether there is a state the host could be asked to wait for before attempting again. */
  readinessAvailable: boolean;
  /** A Flow node that clears known interference, when the Flow holds one. */
  interferenceNodeId?: string;
};

/** Ladder order, cheapest first. The authored failed route and the model both sit below every deterministic rung. */
const LADDER_PRIORITY: Readonly<Record<AutomationStudioLadderRungKind, number>> = {
  skip_satisfied_node: 1,
  await_recorded_state: 2,
  clear_interference: 3,
  retry_node: 4
};

const DETERMINISTIC_PATH_PRIORITY = 5;
const APPROVED_PATCH_PRIORITY = 6;
const REROUTE_PRIORITY = 7;
const LLM_PRIORITY = 8;

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
  },
  ladder?: AutomationStudioLadderState
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
  const candidates: AutomationStudioRecoveryCandidate[] = ladderCandidates(node, ladder);
  const budgetExhausted = recoveryBudgetExhaustion(budget, budgetState);
  if (failedEdge && !budgetExhausted.recovery && !budgetExhausted.reroute) {
    candidates.push({
      kind: "deterministic_path",
      priority: DETERMINISTIC_PATH_PRIORITY,
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
      priority: approvedPatchNodeIds.has(recoveryNode.id) ? APPROVED_PATCH_PRIORITY : REROUTE_PRIORITY,
      label: approvedPatchNodeIds.has(recoveryNode.id) ? "Apply approved recovery patch" : "Reroute to recovery node",
      targetNodeId: recoveryNode.id,
      ...(incoming ? { edgeId: incoming.id } : {}),
      reason: incoming ? `Recovery node ${recoveryNode.id} is already connected from ${node.id}.` : `Recovery node ${recoveryNode.id} is available in this Flow.`
    });
  }
  if (options.allowLlmDiagnosis !== false && !budgetExhausted.llm) {
    candidates.push({
      kind: "llm_diagnosis",
      priority: LLM_PRIORITY,
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
      ...(ladder ? { ladderConsumed: [...ladder.consumed], attemptsForNode: ladder.attemptsForNode, maxAttempts: ladder.maxAttempts } : {}),
      ...(budgetExhausted.message ? { budgetExhausted: budgetExhausted.message } : {})
    }
  };
}

/**
 * The deterministic rungs still on offer: cheapest first, each dropped once it
 * has been run or once the evidence for it is gone.
 *
 * Re-resolving the target -- fingerprint, then equivalence anchors, then
 * accessible name, then selector, then visible text -- is not a rung here
 * because it has already happened, inside the host's own target resolution,
 * before the action was ever reported as failed.
 */
function ladderCandidates(node: AutomationStudioFlowNode, ladder: AutomationStudioLadderState | undefined): AutomationStudioRecoveryCandidate[] {
  if (!ladder) return [];
  const attemptsLeft = ladder.attemptsForNode < ladder.maxAttempts;
  const candidates: AutomationStudioRecoveryCandidate[] = [];
  if (ladder.expectationSatisfied && !ladder.consumed.has("skip_satisfied_node")) {
    candidates.push({
      kind: "skip_satisfied_node",
      priority: LADDER_PRIORITY.skip_satisfied_node,
      label: "Skip the node whose state already holds",
      targetNodeId: node.id,
      reason: `The state ${node.id} was recorded to produce already holds, so the action it would repeat has already happened.`
    });
  }
  if (ladder.readinessAvailable && ladder.retryable && attemptsLeft && !ladder.consumed.has("await_recorded_state")) {
    candidates.push({
      kind: "await_recorded_state",
      priority: LADDER_PRIORITY.await_recorded_state,
      label: "Wait for the recorded state, then attempt again",
      targetNodeId: node.id,
      reason: `${node.id} carries a recorded state to wait for, and most failures on a site nobody controls are timing.`
    });
  }
  if (ladder.interferenceNodeId && ladder.retryable && attemptsLeft && !ladder.consumed.has("clear_interference")) {
    candidates.push({
      kind: "clear_interference",
      priority: LADDER_PRIORITY.clear_interference,
      label: "Clear known interference, then attempt again",
      targetNodeId: ladder.interferenceNodeId,
      reason: `Flow node ${ladder.interferenceNodeId} clears interference this Flow has already met.`
    });
  }
  // The retry rung needs no consumption mark: it leaves the list when the
  // node's attempt allowance is spent, which is the same thing and cannot
  // disagree with the count the executor is working from.
  if (ladder.retryable && attemptsLeft) {
    candidates.push({
      kind: "retry_node",
      priority: LADDER_PRIORITY.retry_node,
      label: "Attempt the node again",
      targetNodeId: node.id,
      reason: `The failure is marked retryable and ${node.id} has used ${ladder.attemptsForNode} of ${ladder.maxAttempts} attempts.`
    });
  }
  return candidates;
}

export function failureMessageForRecoveryStop(recoveryDecision: AutomationStudioRecoveryDecision, attempt: AutomationStudioNodeAttemptTrace): string | undefined {
  if (recoveryDecision.selected?.kind === "llm_diagnosis") return "Recovery ladder reached LLM diagnosis fallback before a configured provider was invoked.";
  if (recoveryDecision.metadata?.budgetExhausted) return String(recoveryDecision.metadata.budgetExhausted);
  return attempt.message;
}
