import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES, type AutomationStudioAdaptiveFailureClass } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { compareAutomationStudioTransition, type AutomationStudioNodeAttemptTrace, type AutomationStudioTransitionComparisonStatus } from "../index.ts";

const node: AutomationStudioFlowNode = { id: "click", definitionId: "builtin.policy.action", parameterValues: {} };

describe("compareAutomationStudioTransition", () => {
  it("reads a failed attempt's structured failure before matching text", () => {
    expect(compare(failedAttempt({ failure: failure("timeout"), message: "The client did not answer." }))).toBe("timeout");
    expect(compare(failedAttempt({ failure: failure("target_not_found"), message: "Request timed out." }))).toBe("target_not_found");
  });

  it("maps every failure category to a comparison status", () => {
    const expected: Record<AutomationStudioAdaptiveFailureClass, AutomationStudioTransitionComparisonStatus> = {
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
    expect(Object.keys(expected).sort()).toEqual([...AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES].sort());
    for (const category of AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES) {
      expect(compare(failedAttempt({ failure: failure(category) }))).toBe(expected[category]);
    }
  });

  it("falls back to route and message text for attempts without a failure record", () => {
    expect(compare(failedAttempt({ message: "Client action timed out after 5000ms." }))).toBe("timeout");
    expect(compare(failedAttempt({ message: "The client did not answer." }))).toBe("action_failed");
  });

  it("uses the failure record only for failed attempts", () => {
    expect(compare(failedAttempt({ status: "waiting", failure: failure("timeout") }))).toBe("blocked");
  });

  it("explains the target statuses with the attempt message or a default", () => {
    expect(compareAutomationStudioTransition(node, failedAttempt({ failure: failure("target_ambiguous") })).message).toBe("More than one candidate matched the action target.");
    expect(compareAutomationStudioTransition(node, failedAttempt({ failure: failure("target_not_found"), message: "No element matched #save." })).message).toBe("No element matched #save.");
  });
});

function compare(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioTransitionComparisonStatus {
  return compareAutomationStudioTransition(node, attempt).status;
}

function failure(category: AutomationStudioAdaptiveFailureClass) {
  return { category, code: `test.${category}`, retryable: false };
}

function failedAttempt(overrides: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "click.attempt.1",
    nodeId: "click",
    definitionId: "builtin.policy.action",
    startedAt: 1,
    finishedAt: 2,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    ...overrides
  };
}
