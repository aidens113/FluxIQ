import { describe, expect, it } from "vitest";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowAdaptation } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import type { AutomationStudioTrainingModeSettings } from "../../training-modes.ts";
import { decideAutomationStudioRuntimeLlmInvocation } from "../llm-invocation.ts";

// Fix 4: `decideAutomationStudioLlmInvocationGate` implemented deterministic-first
// correctly and had zero production callers, so the model was asked even when a
// deterministic recovery was sitting in the attempt. This is the seam that calls it.
describe("decideAutomationStudioRuntimeLlmInvocation", () => {
  it("refuses the model when the failed attempt carries a deterministic recovery candidate", () => {
    const decision = decideAutomationStudioRuntimeLlmInvocation({
      ...runIdentity(),
      settings: settings(),
      policy: policy(),
      failedAttempt: failedAttempt([{ kind: "deterministic_path", priority: 1, label: "Retry the step", reason: "A retry path exists." }])
    });

    expect(decision).toMatchObject({ invoke: false, requiredPriorAction: "known_recovery", knownRecoveryAvailable: true });
  });

  it("refuses the model when a deterministic reroute is available", () => {
    const decision = decideAutomationStudioRuntimeLlmInvocation({
      ...runIdentity(),
      settings: settings(),
      policy: policy(),
      failedAttempt: failedAttempt([{ kind: "reroute", priority: 1, label: "Route around the step", reason: "An alternative edge exists." }])
    });

    expect(decision).toMatchObject({ invoke: false, rerouteAvailable: true });
    expect(decision.requiredPriorAction).toBe("known_recovery");
  });

  it("allows the model when nothing deterministic is available", () => {
    const decision = decideAutomationStudioRuntimeLlmInvocation({
      ...runIdentity(),
      settings: settings(),
      policy: policy(),
      failedAttempt: failedAttempt([])
    });

    expect(decision).toMatchObject({ invoke: true, requiredPriorAction: "none", knownRecoveryAvailable: false });
  });

  it("allows the model when there is no failed attempt to classify", () => {
    expect(decideAutomationStudioRuntimeLlmInvocation({ ...runIdentity(), settings: settings(), policy: policy() })).toMatchObject({ invoke: true });
  });

  // The mode, budget and approval-mode refusals the gate also makes are already
  // enforced at the call site, so this seam acts only on the two it adds.
  it("does not re-apply the approval-mode refusal the call site already enforces", () => {
    const decision = decideAutomationStudioRuntimeLlmInvocation({
      ...runIdentity(),
      settings: settings({ proposalApprovalMode: "manual" }),
      policy: policy(),
      failedAttempt: failedAttempt([])
    });

    expect(decision.invoke).toBe(true);
  });

  it("reports a known adaptation match when the adaptations it is given cover the failure", () => {
    const decision = decideAutomationStudioRuntimeLlmInvocation({
      ...runIdentity(),
      settings: settings(),
      policy: policy(),
      failedAttempt: failedAttempt([]),
      adaptations: [knownAdaptation()]
    });

    expect(decision.knownAdaptationAvailable).toBe(true);
  });
});

function runIdentity(): { projectId: string; flowId: string; runId: string } {
  return { projectId: "project.gate", flowId: "flow.gate", runId: "run.gate" };
}

function failedAttempt(candidates: NonNullable<AutomationStudioNodeAttemptTrace["recoveryDecision"]>["candidates"]): AutomationStudioNodeAttemptTrace {
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
    message: "The action failed."
  };
  return candidates.length
    ? { ...trace, recoveryDecision: { lookup: { nodeId: "node.action", definitionId: "builtin.policy.action", attemptId: "node.action.attempt.1", comparisonStatus: "action_failed" }, candidates } }
    : trace;
}

function knownAdaptation(): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId: "adaptation.known",
    flowId: "flow.gate",
    projectId: "project.gate",
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

function settings(overrides: Partial<AutomationStudioTrainingModeSettings> = {}): AutomationStudioTrainingModeSettings {
  return {
    mode: "continuous_adaptive",
    allowLlmIntervention: true,
    allowRuntimeRecovery: true,
    allowAdaptationCreation: true,
    proposalApprovalMode: "auto",
    allowPromotion: true,
    ...overrides
  };
}

function policy(overrides: Partial<AutomationStudioAdaptationPolicy> = {}): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.gate",
    scope: { kind: "flow", flowId: "flow.gate" },
    preset: "adaptive",
    proposalMode: "auto",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}
