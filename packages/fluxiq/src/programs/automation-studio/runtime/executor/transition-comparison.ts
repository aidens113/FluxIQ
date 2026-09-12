import type { AutomationStudioAdaptiveFailureClass, AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationNodeExpectationEvaluation } from "../../nodes/index.ts";
import { hostExpectationEvaluator, type AutomationStudioHostStateSnapshotRef } from "../host-runtime.ts";
import { actualTransitionForAttempt } from "./actual-transition.ts";
import type { AutomationStudioActualTransition, AutomationStudioExpectedTransition, AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace, AutomationStudioTransitionComparison, AutomationStudioTransitionComparisonStatus } from "./contracts.ts";
import { expectedTransitionForNode } from "./expected-transition.ts";

// How a structured failure category reads as a transition comparison for a
// failed attempt. Typed as exhaustive, so a new category cannot ship without
// a comparison status.
const COMPARISON_STATUS_FOR_FAILURE: Readonly<Record<AutomationStudioAdaptiveFailureClass, AutomationStudioTransitionComparisonStatus>> = {
  action_failed: "action_failed",
  expected_state_missing: "missing_expected_state",
  unexpected_state: "unexpected_state",
  timeout: "timeout",
  blocked_by_capability_or_policy: "blocked",
  missing_router_or_subflow_target: "action_failed",
  graph_validation_or_unknown_node: "action_failed",
  external_side_effect_denied: "blocked",
  ambiguous_or_unknown: "action_failed",
  target_not_found: "target_not_found",
  target_ambiguous: "target_ambiguous",
  navigation_unexpected: "unexpected_state",
  output_not_observed: "missing_expected_state",
  page_changed: "unexpected_state",
  auth_required: "blocked",
  user_intervention_required: "blocked"
};

/**
 * Compares one attempt against what the node was expected to do. `evaluation`
 * is the host's verdict on `expectedState`; with none, expected state is read
 * from the attempt's own route as it always was.
 */
export function compareAutomationStudioTransition(node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace, evaluation?: AutomationNodeExpectationEvaluation): AutomationStudioTransitionComparison {
  const expected = expectedTransitionForNode(node, attempt);
  const actual = actualTransitionForAttempt(attempt);
  const expectedOutputIds = Object.keys(expected.expectedOutputs ?? {});
  const actualOutputIds = Object.keys(actual.outputs);
  const expectedEffectTypes = (expected.expectedEffects ?? []).map((effect) => effect.type);
  const actualEffectTypes = actual.effects.map((effect) => effect.type);
  const missingOutputIds = expectedOutputIds.filter((id) => actual.outputs[id] === undefined);
  const unexpectedOutputIds = actualOutputIds.filter((id) => !expectedOutputIds.includes(id));
  const missingEffectTypes = uniqueStrings(expectedEffectTypes.filter((type) => !actualEffectTypes.includes(type)));
  const unexpectedEffectTypes = uniqueStrings(actualEffectTypes.filter((type) => !expectedEffectTypes.includes(type)));
  const routeMatched = expected.expectedRoute === undefined
    || actual.route === expected.expectedRoute
    || Boolean(expected.tolerance?.toleratedRoutes?.includes(actual.route ?? ""));
  const statusMatched = expected.expectedStatus === undefined || actual.status === expected.expectedStatus || (expected.tolerance?.allowWaiting === true && actual.status === "waiting");
  // A host that evaluated the expectation reports what it checked; only
  // without one does Core fall back to counting expected-state keys.
  const stateCheckCount = evaluation?.checkedConditionCount ?? Object.keys(expected.expectedState ?? {}).length;
  const status = classifyTransitionComparisonStatus({
    expected,
    actual,
    failure: attempt.failure,
    missingOutputIds,
    missingEffectTypes,
    routeMatched,
    statusMatched,
    stateCheckCount,
    evaluation
  });
  const message = (status === "missing_expected_state" ? evaluation?.message : undefined)
    ?? comparisonMessage(status, expected, actual, missingOutputIds, missingEffectTypes);
  return {
    comparisonId: `${attempt.attemptId}.comparison`,
    nodeId: attempt.nodeId,
    attemptId: attempt.attemptId,
    status,
    expected,
    actual,
    diffSummary: {
      missingOutputIds,
      unexpectedOutputIds,
      missingEffectTypes,
      unexpectedEffectTypes,
      routeMatched,
      statusMatched,
      stateCheckCount
    },
    ...(message ? { message } : {})
  };
}

/**
 * Asks the bound host to evaluate the attempt's `expectedState` against its
 * current snapshot, then recompares with that verdict. Returns the attempt
 * untouched when no evaluator is bound, so an unbound host is unchanged.
 */
export async function attemptWithHostExpectationEvaluation(
  node: AutomationStudioFlowNode,
  attempt: AutomationStudioNodeAttemptTrace,
  options: AutomationStudioGraphExecutionOptions
): Promise<AutomationStudioNodeAttemptTrace> {
  const evaluate = hostExpectationEvaluator(options.hostRuntime);
  const expectedState = attempt.transitionComparison?.expected.expectedState;
  // A failed or waiting attempt is classified from its own outcome, and the
  // expectation node already asked the host itself, so neither is asked twice.
  if (!evaluate || !expectedState || attempt.status !== "succeeded" || node.definitionId === "builtin.policy.expectation") return attempt;
  const request = expectationRequest(expectedState);
  const stateRef = currentStateRef(attempt);
  let evaluation: AutomationNodeExpectationEvaluation;
  try {
    evaluation = await evaluate(request.conditions, request.mode, request.timeoutMs, {
      source: "transition_comparison",
      nodeId: attempt.nodeId,
      attemptId: attempt.attemptId,
      ...(stateRef ? { stateRef } : {}),
      ...(options.signal ? { signal: options.signal } : {})
    });
  } catch {
    return attempt;
  }
  return { ...attempt, transitionComparison: compareAutomationStudioTransition(node, attempt, evaluation) };
}

// An expected state is either a list of conditions the host understands or one
// condition object. Only the expected state names the wait; a node's own
// timeout bounds its action, not the check that follows it.
function expectationRequest(expectedState: JsonObject): { conditions: JsonValue[]; mode: string; timeoutMs: number } {
  const conditions = Array.isArray(expectedState.conditions) ? expectedState.conditions : [expectedState as JsonValue];
  const mode = typeof expectedState.mode === "string" ? expectedState.mode : "all";
  return { conditions, mode, timeoutMs: typeof expectedState.timeoutMs === "number" ? expectedState.timeoutMs : 0 };
}

function currentStateRef(attempt: AutomationStudioNodeAttemptTrace): string | undefined {
  const refs: AutomationStudioHostStateSnapshotRef | undefined = attempt.stateRefs?.afterAction ?? attempt.stateRefs?.beforeAction;
  return refs?.stateRef;
}

function classifyTransitionComparisonStatus(input: {
  expected: AutomationStudioExpectedTransition;
  actual: AutomationStudioActualTransition;
  failure: AutomationStudioFailureRecord | undefined;
  missingOutputIds: string[];
  missingEffectTypes: string[];
  routeMatched: boolean;
  statusMatched: boolean;
  stateCheckCount: number;
  evaluation: AutomationNodeExpectationEvaluation | undefined;
}): AutomationStudioTransitionComparisonStatus {
  if (input.actual.status === "waiting") return input.expected.tolerance?.allowWaiting ? "tolerated" : "blocked";
  if (input.actual.status === "cancelled") return "blocked";
  if (input.actual.status === "failed") {
    // Structured first: the failure record names the category. Matching
    // "timeout" in the route or message serves only attempts without one.
    const structured = input.failure ? COMPARISON_STATUS_FOR_FAILURE[input.failure.category] : undefined;
    if (structured) return structured;
    const text = `${input.actual.route ?? ""} ${input.actual.message ?? ""}`.toLowerCase();
    return text.includes("timeout") || text.includes("timed out") ? "timeout" : "action_failed";
  }
  if (!input.statusMatched || !input.routeMatched) return "unexpected_state";
  // The host is the only authority on whether expected state holds. Reading the
  // attempt's own route for it is the fallback for an unevaluated expectation.
  if (input.evaluation) {
    if (!input.evaluation.passed) {
      return input.evaluation.failure ? COMPARISON_STATUS_FOR_FAILURE[input.evaluation.failure.category] : "missing_expected_state";
    }
  } else if (input.stateCheckCount > 0 && (input.actual.route === "failed" || input.actual.outputs.failed === true)) {
    return "missing_expected_state";
  }
  if (input.missingOutputIds.length || input.missingEffectTypes.length) return "missing_expected_state";
  if (input.actual.status !== "succeeded") return "unknown";
  return "matched";
}

function comparisonMessage(status: AutomationStudioTransitionComparisonStatus, expected: AutomationStudioExpectedTransition, actual: AutomationStudioActualTransition, missingOutputIds: string[], missingEffectTypes: string[]): string | undefined {
  if (status === "matched") return undefined;
  if (status === "tolerated") return "The transition did not finish, but waiting is tolerated for this node.";
  if (status === "blocked") return actual.message ?? "The transition is blocked or waiting without a tolerated wait policy.";
  if (status === "timeout") return actual.message ?? "The transition timed out.";
  if (status === "action_failed") return actual.message ?? "The node action failed.";
  if (status === "target_not_found") return actual.message ?? "No candidate matched the action target.";
  if (status === "target_ambiguous") return actual.message ?? "More than one candidate matched the action target.";
  if (status === "unexpected_state") return `Expected route/status did not match actual route/status (${expected.expectedRoute ?? "any"} -> ${actual.route ?? "none"}).`;
  if (status === "missing_expected_state") {
    const missing = [...missingOutputIds, ...missingEffectTypes.map((type) => `effect:${type}`)];
    return missing.length ? `Missing expected transition evidence: ${missing.join(", ")}.` : "Expected state was not confirmed.";
  }
  if (status === "ambiguous") return "The transition result is ambiguous.";
  return "The transition result is unknown.";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort();
}
