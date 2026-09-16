import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES, type AutomationStudioAdaptiveFailureClass } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowAdaptation } from "../../../model/index.ts";
import { classifyAutomationStudioAdaptiveFailure } from "../../adaptive-orchestrator.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import {
  automationStudioRuntimeDiagnosisResolution,
  buildAutomationStudioRuntimeDeterministicDiagnosis
} from "../deterministic-diagnosis.ts";

// Decision L5: the model is not asked when something cheaper and more reliable
// already answers. These are the four answers, and the guard that stops the new
// vocabulary drifting away from the classifier that carries the authority.
describe("buildAutomationStudioRuntimeDeterministicDiagnosis", () => {
  it("resolves a failure with a deterministic candidate without needing the model", () => {
    const diagnosis = buildAutomationStudioRuntimeDeterministicDiagnosis({
      ...runIdentity(),
      failedAttempt: attempt({ candidates: [{ kind: "deterministic_path", priority: 1, label: "Retry the step", reason: "A retry path exists." }] })
    });

    expect(diagnosis).toMatchObject({
      resolution: "deterministic_recovery",
      modelNeeded: false,
      requiredPriorAction: "known_recovery",
      deterministicRecoveryAvailable: true,
      stillAchievable: "yes"
    });
  });

  it("names a reroute as the prior action when the deterministic candidate is one", () => {
    const diagnosis = buildAutomationStudioRuntimeDeterministicDiagnosis({
      ...runIdentity(),
      failedAttempt: attempt({ candidates: [{ kind: "reroute", priority: 1, label: "Route around it", reason: "An alternative edge exists." }] })
    });

    expect(diagnosis).toMatchObject({ resolution: "deterministic_recovery", rerouteAvailable: true, requiredPriorAction: "reroute" });
  });

  it("resolves to the known adaptation when one already matched this failure, and does not ask", () => {
    const diagnosis = buildAutomationStudioRuntimeDeterministicDiagnosis({
      ...runIdentity(),
      failedAttempt: attempt({}),
      adaptations: [knownAdaptation()]
    });

    expect(diagnosis).toMatchObject({
      resolution: "known_adaptation",
      modelNeeded: false,
      requiredPriorAction: "known_adaptation",
      knownAdaptationIds: ["adaptation.known"],
      stillAchievable: "yes"
    });
  });

  // The four classes L5 names, plus the graph one. Asking a model about any of
  // them is asking it to work around a control or to repair something only an
  // edit to the Flow fixes.
  it.each([
    ["blocked_by_capability_or_policy" as const, "unknown" as const],
    ["external_side_effect_denied" as const, "unknown" as const],
    ["auth_required" as const, "no" as const],
    ["user_intervention_required" as const, "no" as const],
    ["graph_validation_or_unknown_node" as const, "unknown" as const]
  ])("refuses the model outright for a %s failure", (category, stillAchievable) => {
    const diagnosis = buildAutomationStudioRuntimeDeterministicDiagnosis({ ...runIdentity(), failedAttempt: attempt({ category }) });

    expect(diagnosis).toMatchObject({ failureClass: category, resolution: "manual_intervention", modelNeeded: false, requiredPriorAction: "manual_intervention", stillAchievable });
  });

  it("asks the model only when nothing deterministic answers", () => {
    const diagnosis = buildAutomationStudioRuntimeDeterministicDiagnosis({ ...runIdentity(), failedAttempt: attempt({ category: "target_not_found" }) });

    expect(diagnosis).toMatchObject({
      resolution: "model_required",
      modelNeeded: true,
      requiredPriorAction: "none",
      candidateKind: "action_target_override",
      stillAchievable: "unknown"
    });
  });

  // The classifier owns the authority and this module owns the vocabulary. If
  // the two ever disagree about whether a class reaches a model, one of them is
  // silently wrong and a run would be gated on the wrong answer.
  it("agrees with the classifier's own eligibility for every failure class, in every combination", () => {
    const disagreements: string[] = [];
    for (const category of AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES) {
      for (const withCandidate of [false, true]) {
        for (const withAdaptation of [false, true]) {
          const failedAttempt = attempt({
            category,
            ...(withCandidate ? { candidates: [{ kind: "deterministic_path" as const, priority: 1, label: "Retry", reason: "A retry path exists." }] } : {})
          });
          const failure = classifyAutomationStudioAdaptiveFailure({
            ...runIdentity(),
            attempt: failedAttempt,
            ...(withAdaptation ? { adaptations: [knownAdaptation()] } : {})
          });
          const resolution = automationStudioRuntimeDiagnosisResolution({
            failureClass: failure.failureClass,
            deterministicRecoveryAvailable: failure.llmEligibility.knownRecoveryAvailable,
            knownAdaptationAvailable: failure.llmEligibility.knownAdaptationAvailable
          });
          if ((resolution === "model_required") !== failure.llmEligibility.eligible) {
            disagreements.push(`${category} candidate=${withCandidate} adaptation=${withAdaptation}: resolution ${resolution}, classifier eligible ${failure.llmEligibility.eligible}`);
          }
        }
      }
    }

    expect(disagreements).toEqual([]);
    expect(AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES.length).toBeGreaterThan(10);
  });
});

function runIdentity(): { projectId: string; flowId: string; runId: string } {
  return { projectId: "project.diagnosis", flowId: "flow.diagnosis", runId: "run.diagnosis" };
}

function attempt(input: {
  category?: AutomationStudioAdaptiveFailureClass;
  candidates?: NonNullable<AutomationStudioNodeAttemptTrace["recoveryDecision"]>["candidates"];
}): AutomationStudioNodeAttemptTrace {
  const trace: AutomationStudioNodeAttemptTrace = {
    attemptId: "node.action.attempt.1",
    nodeId: "node.action",
    definitionId: "builtin.policy.action",
    startedAt: 1,
    finishedAt: 2,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    message: "The action failed.",
    // A structured record names its own category, which is how a domain reports
    // one and how this test reaches every class without inventing prose that
    // happens to match the legacy message regexes.
    ...(input.category ? { failure: { category: input.category, code: "test.failure", retryable: false } } : {})
  };
  return input.candidates?.length
    ? { ...trace, recoveryDecision: { lookup: { nodeId: "node.action", definitionId: "builtin.policy.action", attemptId: "node.action.attempt.1", comparisonStatus: "action_failed" }, candidates: input.candidates } }
    : trace;
}

function knownAdaptation(): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId: "adaptation.known",
    flowId: "flow.diagnosis",
    projectId: "project.diagnosis",
    trigger: "A known repair for this action.",
    failedAction: { nodeId: "node.action", definitionId: "builtin.policy.action" },
    patch: [{ kind: "edit_expectation", targetId: "node.action", summary: "Wait longer." }],
    validationResults: [{ runId: "run.earlier", status: "succeeded", checkedAt: 1 }],
    status: "applied",
    author: "runtime",
    riskLevel: "low",
    createdAt: 1,
    updatedAt: 2
  };
}
