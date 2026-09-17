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

    expect(failure.knownAdaptationMatches).toEqual([{ adaptationId: "adaptation.submit", status: "validated", riskLevel: "low", matchedBy: "node_identity", known: true }]);
    expect(failure.llmEligibility).toMatchObject({
      eligible: false,
      knownAdaptationAvailable: true
    });
  });

  // D-2: an applied change is already in the Flow. Its node failing again is
  // the evidence that it did not hold, not a known answer to the failure.
  it("still lists an applied adaptation that matches, and keeps the failure eligible for the model", () => {
    const failure = classify(failedAttempt(), [adaptation({ status: "applied" })]);

    expect(failure.knownAdaptationMatches).toEqual([{ adaptationId: "adaptation.submit", status: "applied", riskLevel: "low", matchedBy: "node_identity", known: false }]);
    expect(failure.llmEligibility).toMatchObject({ eligible: true, knownAdaptationAvailable: false });
    expect(failure.llmEligibility.reason).toContain("applied");
    expect(compactAutomationStudioAdaptiveFailure(failure)).toMatchObject({ knownAdaptationIds: ["adaptation.submit"], llmEligibility: { eligible: true } });
  });

  it("matches a record that carries a failure signature by that signature alone", () => {
    const targetMiss = failedAttempt({ failure: { category: "target_not_found", code: "web.target.selector_miss", retryable: true } });
    const timeout = failedAttempt({ failure: { category: "timeout", code: "output_dispatch.timed_out", retryable: true } });
    const signed = adaptation({ status: "validated", metadata: { failureSignature: classify(targetMiss).signature } });

    expect(classify(targetMiss, [signed])).toMatchObject({
      knownAdaptationMatches: [{ adaptationId: "adaptation.submit", matchedBy: "failure_signature", known: true }],
      llmEligibility: { eligible: false, knownAdaptationAvailable: true }
    });
    // Same node and definition, different failure: the signed record does not
    // fall back to node identity.
    expect(classify(timeout, [signed])).toMatchObject({ knownAdaptationMatches: [], llmEligibility: { eligible: true, knownAdaptationAvailable: false } });
  });

  it("matches a record without a signature by node identity only", () => {
    const otherNode = adaptation({ status: "validated", failedAction: { nodeId: "elsewhere", definitionId: "builtin.policy.action" } });
    const otherDefinition = adaptation({ status: "validated", failedAction: { nodeId: "submit", definitionId: "builtin.policy.other" } });
    const otherSubflow = adaptation({ status: "validated", subflowId: "subflow.other" });
    // The old heuristic matched any node in the Subflow whose trigger text named
    // the failure class. That is not node identity, and it no longer matches.
    const triggerOnly = adaptation({ status: "validated", subflowId: "subflow.primary", trigger: "Previous action failed", failedAction: { nodeId: "elsewhere", definitionId: "builtin.policy.action" } });

    for (const record of [otherNode, otherDefinition, otherSubflow, triggerOnly]) {
      expect(classifyAutomationStudioAdaptiveFailure({ ...runIdentity(), subflowId: "subflow.primary", attempt: failedAttempt(), adaptations: [record] }))
        .toMatchObject({ failureClass: "action_failed", knownAdaptationMatches: [], llmEligibility: { eligible: true } });
    }
    expect(classify(failedAttempt(), [adaptation({ status: "validated", subflowId: "subflow.other" })]))
      .toMatchObject({ knownAdaptationMatches: [{ matchedBy: "node_identity", known: true }] });
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

function classify(attempt: AutomationStudioNodeAttemptTrace, adaptations?: AutomationStudioFlowAdaptation[]) {
  return classifyAutomationStudioAdaptiveFailure({ ...runIdentity(), attempt, ...(adaptations ? { adaptations } : {}) });
}

function runIdentity(): { projectId: string; flowId: string; runId: string } {
  return { projectId: "project.adaptive", flowId: "flow.checkout", runId: "run.failed" };
}

function adaptation(overrides: Pick<AutomationStudioFlowAdaptation, "status"> & Partial<AutomationStudioFlowAdaptation>): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId: "adaptation.submit",
    flowId: "flow.checkout",
    projectId: "project.adaptive",
    sourceRunId: "run.previous",
    trigger: "A repair for the submit action.",
    failedAction: { nodeId: "submit", definitionId: "builtin.policy.action" },
    patch: [{ kind: "edit_action_target", targetId: "submit", summary: "Use visible submit button." }],
    author: "runtime",
    riskLevel: "low",
    createdAt: 1,
    updatedAt: 2,
    ...overrides
  };
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
