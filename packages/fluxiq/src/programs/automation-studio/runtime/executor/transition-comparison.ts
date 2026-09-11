import type { AutomationStudioAdaptiveFailureClass, AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import { actualTransitionForAttempt } from "./actual-transition.ts";
import type { AutomationStudioActualTransition, AutomationStudioExpectedTransition, AutomationStudioNodeAttemptTrace, AutomationStudioTransitionComparison, AutomationStudioTransitionComparisonStatus } from "./contracts.ts";
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

export function compareAutomationStudioTransition(node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace): AutomationStudioTransitionComparison {
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
  const stateCheckCount = Object.keys(expected.expectedState ?? {}).length;
  const status = classifyTransitionComparisonStatus({
    expected,
    actual,
    failure: attempt.failure,
    missingOutputIds,
    missingEffectTypes,
    routeMatched,
    statusMatched,
    stateCheckCount
  });
  const message = comparisonMessage(status, expected, actual, missingOutputIds, missingEffectTypes);
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

function classifyTransitionComparisonStatus(input: {
  expected: AutomationStudioExpectedTransition;
  actual: AutomationStudioActualTransition;
  failure: AutomationStudioFailureRecord | undefined;
  missingOutputIds: string[];
  missingEffectTypes: string[];
  routeMatched: boolean;
  statusMatched: boolean;
  stateCheckCount: number;
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
  if (input.stateCheckCount > 0 && (input.actual.route === "failed" || input.actual.outputs.failed === true)) return "missing_expected_state";
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
