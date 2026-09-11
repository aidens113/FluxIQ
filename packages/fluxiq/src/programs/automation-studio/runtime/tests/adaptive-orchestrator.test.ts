import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptation } from "../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor.ts";
import { classifyAutomationStudioAdaptiveFailure, compactAutomationStudioAdaptiveFailure, type AutomationStudioAdaptiveFailureClass } from "../adaptive-orchestrator.ts";

describe("Automation Studio adaptive failure classifier", () => {
  it("classifies missing expected state as a wait/retry adaptation opportunity", () => {
    const failure = classifyAutomationStudioAdaptiveFailure({
      projectId: "project.adaptive",
      flowId: "flow.checkout",
      runId: "run.failed",
      subflowId: "subflow.primary",
      attempt: failedAttempt({
        transitionComparison: {
          comparisonId: "comparison.1",
          nodeId: "submit",
          attemptId: "submit.attempt.1",
          status: "missing_expected_state",
          expected: { transitionId: "expected", nodeId: "submit", definitionId: "builtin.policy.action" },
          actual: { transitionId: "actual", nodeId: "submit", definitionId: "builtin.policy.action", status: "failed", outputs: {}, effects: [], startedAt: 1 },
          diffSummary: { missingOutputIds: [], unexpectedOutputIds: [], missingEffectTypes: [], unexpectedEffectTypes: [], routeMatched: false, statusMatched: false, stateCheckCount: 1 }
        }
      })
    });

    expect(failure).toMatchObject({
      failureClass: "expected_state_missing",
      candidateKind: "expectation_wait_retry",
      llmEligibility: { eligible: true }
    });
    expect(failure.signature).toHaveLength(24);
    expect(compactAutomationStudioAdaptiveFailure(failure)).toMatchObject({ failureClass: "expected_state_missing", candidateKind: "expectation_wait_retry" });
  });

  it("blocks LLM eligibility when deterministic recovery is available", () => {
    const failure = classifyAutomationStudioAdaptiveFailure({
      projectId: "project.adaptive",
      flowId: "flow.checkout",
      runId: "run.failed",
      attempt: failedAttempt({
        recoveryDecision: {
          lookup: { nodeId: "submit", definitionId: "builtin.policy.action", attemptId: "submit.attempt.1", comparisonStatus: "action_failed" },
          candidates: [
            { kind: "deterministic_path", priority: 1, label: "Failure edge", targetNodeId: "recover", edgeId: "submit.recover", reason: "A failure path exists." },
            { kind: "llm_diagnosis", priority: 99, label: "LLM diagnosis", reason: "Fallback." }
          ]
        }
      })
    });

    expect(failure.deterministicRecoveryCandidates).toHaveLength(1);
    expect(failure.llmEligibility).toMatchObject({
      eligible: false,
      knownRecoveryAvailable: true
    });
  });

  it("matches known adaptations before LLM intervention", () => {
    const adaptation: AutomationStudioFlowAdaptation = {
      schemaVersion: "0.1",
      adaptationId: "adaptation.submit",
      flowId: "flow.checkout",
      projectId: "project.adaptive",
      subflowId: "subflow.primary",
      sourceRunId: "run.previous",
      trigger: "Previous action failed",
      failedAction: { nodeId: "submit", definitionId: "builtin.policy.action" },
      diagnosis: "Submit target drifted.",
      patch: [{ kind: "edit_action_target", targetId: "submit", summary: "Use visible submit button." }],
      status: "validated",
      author: "runtime",
      riskLevel: "low",
      createdAt: 1,
      updatedAt: 2
    };

    const failure = classifyAutomationStudioAdaptiveFailure({
      projectId: "project.adaptive",
      flowId: "flow.checkout",
      runId: "run.failed",
      subflowId: "subflow.primary",
      attempt: failedAttempt(),
      adaptations: [adaptation]
    });

    expect(failure.knownAdaptationMatches).toEqual([{ adaptationId: "adaptation.submit", status: "validated", riskLevel: "low" }]);
    expect(failure.llmEligibility).toMatchObject({
      eligible: false,
      knownAdaptationAvailable: true
    });
  });

  it("classifies policy and graph failures as diagnosis-only or structural fixes", () => {
    expect(classifyAutomationStudioAdaptiveFailure({
      projectId: "project.adaptive",
      flowId: "flow.checkout",
      runId: "run.failed",
      attempt: failedAttempt({ message: "Region browser requires runtime capability io." })
    })).toMatchObject({ failureClass: "blocked_by_capability_or_policy", candidateKind: "diagnosis_only", llmEligibility: { eligible: false } });

    expect(classifyAutomationStudioAdaptiveFailure({
      projectId: "project.adaptive",
      flowId: "flow.checkout",
      runId: "run.failed",
      attempt: failedAttempt({ message: "Unknown node implementation missing." })
    })).toMatchObject({ failureClass: "graph_validation_or_unknown_node", candidateKind: "subflow_edit_or_create", llmEligibility: { eligible: false } });
  });

  it("classifies a timed-out action from its structured failure even when the message never says so", () => {
    expect(classify(failedAttempt({
      message: "The client did not answer.",
      failure: { category: "timeout", code: "output_dispatch.timed_out", retryable: true }
    }))).toMatchObject({ failureClass: "timeout", candidateKind: "expectation_wait_retry", llmEligibility: { eligible: true } });
  });

  it("still classifies legacy attempts without a failure record by their message", () => {
    expect(classify(failedAttempt({ message: "Client action timed out after 5000ms." }))).toMatchObject({ failureClass: "timeout", candidateKind: "expectation_wait_retry" });
    expect(classify(failedAttempt({ message: "The client did not answer." }))).toMatchObject({ failureClass: "action_failed" });
  });

  it("prefers the structured failure over a contradicting message and ignores a malformed record", () => {
    expect(classify(failedAttempt({
      message: "Region browser requires runtime capability io.",
      failure: { category: "target_not_found", code: "web.target.selector_miss", retryable: true }
    }))).toMatchObject({ failureClass: "target_not_found", candidateKind: "action_target_override" });
    expect(classify(failedAttempt({
      message: "Client action timed out after 5000ms.",
      failure: { category: "not_a_class", code: "x", retryable: true } as never
    }))).toMatchObject({ failureClass: "timeout" });
  });

  it("routes the Week 1 classes to candidate kinds and keeps human-only failures from the LLM", () => {
    const expectations: Array<[AutomationStudioAdaptiveFailureClass, string, boolean]> = [
      ["target_ambiguous", "action_target_override", true],
      ["navigation_unexpected", "recovery_path_or_reroute", true],
      ["page_changed", "recovery_path_or_reroute", true],
      ["output_not_observed", "expectation_wait_retry", true],
      ["auth_required", "diagnosis_only", false],
      ["user_intervention_required", "diagnosis_only", false]
    ];
    for (const [category, candidateKind, eligible] of expectations) {
      expect(classify(failedAttempt({ failure: { category, code: `test.${category}`, retryable: false } }))).toMatchObject({ failureClass: category, candidateKind, llmEligibility: { eligible } });
    }
  });

  it("reads the target comparison statuses when the attempt has no failure record", () => {
    expect(classify(failedAttempt({
      transitionComparison: {
        comparisonId: "comparison.target",
        nodeId: "submit",
        attemptId: "submit.attempt.1",
        status: "target_ambiguous",
        expected: { transitionId: "expected", nodeId: "submit", definitionId: "builtin.policy.action" },
        actual: { transitionId: "actual", nodeId: "submit", definitionId: "builtin.policy.action", status: "failed", outputs: {}, effects: [], startedAt: 1 },
        diffSummary: { missingOutputIds: [], unexpectedOutputIds: [], missingEffectTypes: [], unexpectedEffectTypes: [], routeMatched: true, statusMatched: false, stateCheckCount: 0 }
      }
    }))).toMatchObject({ failureClass: "target_ambiguous", comparisonStatus: "target_ambiguous" });
  });
});

function classify(attempt: AutomationStudioNodeAttemptTrace) {
  return classifyAutomationStudioAdaptiveFailure({ projectId: "project.adaptive", flowId: "flow.checkout", runId: "run.failed", attempt });
}

function failedAttempt(overrides: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "submit.attempt.1",
    nodeId: "submit",
    definitionId: "builtin.policy.action",
    startedAt: 1,
    finishedAt: 2,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    message: "Action failed.",
    ...overrides
  };
}
