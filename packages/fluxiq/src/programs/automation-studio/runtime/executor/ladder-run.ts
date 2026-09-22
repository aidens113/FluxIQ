import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../model/index.ts";
import { hostExpectationEvaluator } from "../host-runtime.ts";
import { AUTOMATION_STUDIO_LADDER_RUNG_KINDS, type AutomationStudioGraphExecutionOptions, type AutomationStudioLadderRungKind, type AutomationStudioNodeAttemptTrace, type AutomationStudioRecoveryDecision } from "./contracts.ts";
import { automationStudioExpectationRequest, automationStudioNodeReadinessState, automationStudioReadinessCeilingMs, automationStudioRecordedState } from "./recorded-state.ts";
import { chooseAutomationStudioRecovery, type AutomationStudioLadderState } from "./recovery-ladder.ts";
import { automationStudioAttemptIsRetryable, automationStudioRetryBackoffMs, type AutomationStudioNodeRetryPolicy } from "./retry-policy.ts";
import { automationStudioExpectationSatisfiedAfterFailure } from "./transition-comparison.ts";

/** The node metadata that marks a Flow node as one whose job is to clear interference: an overlay, a consent wall, a timed prompt. */
const CLEARS_INTERFERENCE_METADATA_KEY = "clearsInterference";

const LADDER_RUNG_KINDS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_LADDER_RUNG_KINDS);

/**
 * What the ladder decided, and the decision to record on the failed attempt.
 *
 * The decision handed back is the one taken **after** every rung that ran was
 * consumed, so a run that reaches the end of the ladder leaves the model's rung
 * as the only candidate still standing. Recording an earlier decision would
 * leave a deterministic candidate on the attempt and suppress escalation for
 * good.
 */
export type AutomationStudioLadderOutcome =
  | { kind: "retry"; rung: AutomationStudioLadderRungKind; backoffMs: number; decision: AutomationStudioRecoveryDecision }
  | { kind: "satisfied"; rung: "skip_satisfied_node"; decision: AutomationStudioRecoveryDecision }
  | { kind: "stop"; decision: AutomationStudioRecoveryDecision };

export type AutomationStudioLadderRunInput = {
  flow: AutomationStudioFlowDocument;
  node: AutomationStudioFlowNode;
  attempt: AutomationStudioNodeAttemptTrace;
  failedEdge: AutomationStudioFlowEdge | null;
  options: AutomationStudioGraphExecutionOptions;
  budgetState: { failedAttemptsForAction: number; recoveryAttemptsForSubflow: number; reroutesForRun: number; llmAttemptsForRun: number };
  policy: AutomationStudioNodeRetryPolicy;
  /** How many times this node has been attempted at this arrival, the failed attempt included. */
  attemptsForNode: number;
  /** Rungs already run at this arrival. Mutated as rungs are consumed, so the caller sees what was spent. */
  consumed: Set<AutomationStudioLadderRungKind>;
  /** Runs one Flow node outside the step loop, for the rung that clears interference. */
  executeNode: (node: AutomationStudioFlowNode) => Promise<AutomationStudioNodeAttemptTrace>;
};

/**
 * Walks the deterministic rungs of the ladder, cheapest first, stopping at the
 * first one that resolves the failure.
 *
 * Each rung that runs is consumed before the next decision is taken, so the
 * ladder cannot offer the same answer twice and cannot leave a spent answer on
 * the list. When nothing deterministic is left, the decision returned is
 * whatever the Flow and the policy still offer -- an authored failed route, a
 * recovery node, or the model.
 */
export async function runAutomationStudioRecoveryLadder(input: AutomationStudioLadderRunInput): Promise<AutomationStudioLadderOutcome> {
  let attemptsForNode = input.attemptsForNode;
  for (;;) {
    const decision = chooseAutomationStudioRecovery(
      input.flow,
      input.node,
      input.attempt,
      input.attempt.transitionComparison,
      input.failedEdge,
      input.options,
      input.budgetState,
      ladderState(input, attemptsForNode)
    );
    const selected = decision.selected;
    if (!selected || !LADDER_RUNG_KINDS.has(selected.kind)) return { kind: "stop", decision };
    const rung = selected.kind as AutomationStudioLadderRungKind;
    if (rung === "skip_satisfied_node") {
      input.consumed.add(rung);
      return { kind: "satisfied", rung, decision: finalDecision(input, attemptsForNode) };
    }
    if (rung === "retry_node") {
      // The retry rung leaves the list by exhausting the allowance, not by
      // being consumed, so nothing is added here.
      return { kind: "retry", rung, backoffMs: automationStudioRetryBackoffMs(input.policy, attemptsForNode + 1), decision: finalDecision(input, attemptsForNode) };
    }
    input.consumed.add(rung);
    const resolved = rung === "await_recorded_state"
      ? await awaitRecordedState(input)
      : await clearInterference(input, selected.targetNodeId);
    if (resolved) return { kind: "retry", rung, backoffMs: 0, decision: finalDecision(input, attemptsForNode) };
    attemptsForNode = input.attemptsForNode;
  }
}

/** The decision as it stands once every rung that ran has been consumed: what the attempt records. */
function finalDecision(input: AutomationStudioLadderRunInput, attemptsForNode: number): AutomationStudioRecoveryDecision {
  return chooseAutomationStudioRecovery(
    input.flow,
    input.node,
    input.attempt,
    input.attempt.transitionComparison,
    input.failedEdge,
    input.options,
    input.budgetState,
    ladderState(input, attemptsForNode)
  );
}

function ladderState(input: AutomationStudioLadderRunInput, attemptsForNode: number): AutomationStudioLadderState {
  const interferenceNodeId = interferenceNode(input.flow, input.node)?.id;
  return {
    consumed: input.consumed,
    attemptsForNode,
    maxAttempts: input.policy.maxAttempts,
    retryable: automationStudioAttemptIsRetryable(input.attempt),
    expectationSatisfied: automationStudioExpectationSatisfiedAfterFailure(input.attempt.transitionComparison),
    // Waiting again is only worth offering when the run did not already see the
    // state before it attempted: if readiness held and the node still failed,
    // the failure is not this node waiting for the page.
    readinessAvailable: Boolean(automationStudioNodeReadinessState(input.node)) && Boolean(hostExpectationEvaluator(input.options.hostRuntime)) && input.attempt.readiness?.satisfied !== true,
    ...(interferenceNodeId ? { interferenceNodeId } : {})
  };
}

/** Rung 2: wait for the state the node expected to start from, up to its recorded wait ceiling. */
async function awaitRecordedState(input: AutomationStudioLadderRunInput): Promise<boolean> {
  const outcome = await automationStudioAwaitNodeReadiness(input.node, input.options, input.attempt.attemptId);
  return outcome?.satisfied === true;
}

/** Rung 5: run the Flow's own node for clearing interference, and retry only if it worked. */
async function clearInterference(input: AutomationStudioLadderRunInput, targetNodeId: string | undefined): Promise<boolean> {
  const node = input.flow.nodes.find((candidate) => candidate.id === targetNodeId);
  if (!node) return false;
  const attempt = await input.executeNode(node);
  return attempt.status === "succeeded";
}

/**
 * The node this Flow uses to clear interference, when it holds one.
 *
 * A dismissal the Flow already records is the cheapest answer to the commonest
 * live-site obstruction, and it is deterministic. The marker is the node's own
 * metadata rather than a guess from its label, so nothing is dismissed because
 * Core thought a button looked like a cookie banner.
 */
function interferenceNode(flow: AutomationStudioFlowDocument, failedNode: AutomationStudioFlowNode): AutomationStudioFlowNode | undefined {
  return flow.nodes.find((candidate) => candidate.id !== failedNode.id && candidate.metadata?.[CLEARS_INTERFERENCE_METADATA_KEY] === true);
}

/** What a readiness wait observed, or nothing when the node names no state to wait for. */
export type AutomationStudioReadinessOutcome = NonNullable<AutomationStudioNodeAttemptTrace["readiness"]>;

/**
 * Waits for the state a node expects to find before it runs, for at most the
 * ceiling its recorded gap sets.
 *
 * The state arriving sooner returns sooner, so a replay on a fast page is
 * faster than the recording that produced it. The deadline passing is **not** a
 * failure: the recording is evidence the action was possible at that point, so
 * the caller attempts the node anyway and the mark on the attempt says the
 * state was never seen.
 */
export async function automationStudioAwaitNodeReadiness(
  node: AutomationStudioFlowNode,
  options: AutomationStudioGraphExecutionOptions,
  attemptId: string
): Promise<AutomationStudioReadinessOutcome | undefined> {
  const readyState = automationStudioNodeReadinessState(node);
  const evaluate = hostExpectationEvaluator(options.hostRuntime);
  if (!readyState || !evaluate) return undefined;
  const ceilingMs = automationStudioReadinessCeilingMs(automationStudioRecordedState(node).recordedGapMs);
  const request = automationStudioExpectationRequest(readyState, ceilingMs);
  const now = options.now ?? Date.now;
  const startedAt = now();
  try {
    const evaluation = await evaluate(request.conditions, request.mode, request.timeoutMs, {
      source: "transition_comparison",
      nodeId: node.id,
      attemptId,
      ...(options.signal ? { signal: options.signal } : {})
    });
    return {
      ceilingMs,
      waitedMs: Math.max(0, now() - startedAt),
      satisfied: evaluation.passed,
      checkedConditionCount: evaluation.checkedConditionCount ?? 0,
      ...(evaluation.message ? { message: evaluation.message } : {})
    };
  } catch (error) {
    // A gate that broke says nothing about the page, so the node is attempted
    // as it would have been without one.
    return { ceilingMs, waitedMs: Math.max(0, now() - startedAt), satisfied: false, checkedConditionCount: 0, message: error instanceof Error ? error.message : "The readiness gate could not be evaluated." };
  }
}
