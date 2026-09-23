import { describe, expect, it } from "vitest";
import type { AutomationStudioAdaptationPolicy } from "../../../model/index.ts";
import type { AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import type { AutomationStudioRuntimeDeterministicDiagnosis } from "../deterministic-diagnosis.ts";
import type { AutomationStudioRuntimeLlmInvocationDecision } from "../llm-invocation.ts";
import { planAutomationStudioRuntimeRecovery } from "../plan.ts";
import type { AutomationStudioRuntimeExploration } from "../runtime-exploration.ts";
import { automationStudioRuntimeRecoveryTrace } from "../stages.ts";

// The four stages as one run's outcome writes them. `providerCalled` is the
// deterministic-first receipt: a reader can tell from the trace alone whether
// the model was asked, and for which stage.
describe("automationStudioRuntimeRecoveryTrace", () => {
  it("records diagnosis then recovery plan and stops cleanly when a deterministic recovery answered", () => {
    const trace = automationStudioRuntimeRecoveryTrace({
      invocation: invocation({ invoke: false, reason: "A deterministic recovery path is available and must run before LLM intervention.", requiredPriorAction: "known_recovery", diagnosis: deterministic({ resolution: "deterministic_recovery", modelNeeded: false, deterministicRecoveryAvailable: true, requiredPriorAction: "known_recovery", stillAchievable: "yes" }) }),
      policy: policy()
    });

    expect(trace.stages.map((entry) => [entry.stage, entry.status, entry.providerCalled])).toEqual([
      ["diagnosis", "completed", false],
      ["recovery_plan", "completed", false],
      ["exploration", "skipped", false],
      ["resolution", "skipped", false]
    ]);
    expect(trace.stages[0]?.loopStage).toBeUndefined();
    expect(trace.stages[3]?.detail).toMatchObject({ outcome: "deterministic_recovery_required" });
  });

  it("names the validated adaptation that answered the failure, and says the model was not asked", () => {
    const known = deterministic({ resolution: "known_adaptation", modelNeeded: false, knownAdaptationAvailable: true, requiredPriorAction: "known_adaptation", stillAchievable: "yes", knownAdaptationIds: ["adaptation.validated"], reason: "A validated adaptation matches this failure." });
    const trace = automationStudioRuntimeRecoveryTrace({
      invocation: invocation({ invoke: false, reason: known.reason, requiredPriorAction: "known_adaptation", knownAdaptationAvailable: true, diagnosis: known }),
      policy: policy()
    });

    expect(trace.stages.map((entry) => [entry.stage, entry.status, entry.providerCalled])).toEqual([
      ["diagnosis", "completed", false],
      ["recovery_plan", "completed", false],
      ["exploration", "skipped", false],
      ["resolution", "skipped", false]
    ]);
    expect(trace.stages[0]?.detail).toMatchObject({ knownAdaptationIds: ["adaptation.validated"] });
    expect(trace.stages[3]).toMatchObject({ detail: { outcome: "known_adaptation_available", knownAdaptationIds: ["adaptation.validated"] } });
    expect(trace.stages[3]?.reason).toContain("adaptation.validated");
    expect(trace.stages[3]?.reason).toContain("not asked");
    expect(trace.refused).toEqual([]);
  });

  // D-2: a repair already in the Flow that did not hold is why the model is
  // asked, and the trace says which one.
  it("names the applied adaptation whose node failed again when the model is asked because of it", () => {
    const recurred = deterministic({ recurredAdaptationIds: ["adaptation.applied"], reason: "An applied adaptation matches this failure and it happened again with that change in place." });
    const trace = automationStudioRuntimeRecoveryTrace({ invocation: invocation({ diagnosis: recurred }), policy: policy(), diagnosisOk: true, patchRequested: false });

    expect(trace.stages[0]).toMatchObject({ stage: "diagnosis", status: "completed", providerCalled: true, detail: { recurredAdaptationIds: ["adaptation.applied"] } });
    expect(trace.stages[0]?.reason).toContain("applied adaptation");
    expect(trace.stages[0]?.detail).not.toHaveProperty("knownAdaptationIds");
    expect(trace.stages[3]?.detail).not.toHaveProperty("knownAdaptationIds");
  });

  it("names the loop-protocol stage each recovery stage drove, and only where one was driven", () => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(), result: diagnosisResult(), policy: policy() });
    const trace = automationStudioRuntimeRecoveryTrace({
      invocation: invocation({}),
      policy: policy(),
      plan,
      diagnosisOk: true,
      patchRequested: true,
      patchAttemptCount: 1,
      adaptationIds: ["adaptation.one"]
    });

    expect(trace.stages.map((entry) => [entry.stage, entry.loopStage ?? null])).toEqual([
      ["diagnosis", "gather"],
      ["recovery_plan", "plan"],
      ["exploration", null],
      ["resolution", "implement"]
    ]);
    expect(trace.stages.map((entry) => entry.providerCalled)).toEqual([true, false, false, true]);
  });

  it("records what was produced and never that the recovery worked", () => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(), result: diagnosisResult(), policy: policy() });
    const trace = automationStudioRuntimeRecoveryTrace({ invocation: invocation({}), policy: policy(), plan, diagnosisOk: true, patchRequested: true, patchAttemptCount: 1, adaptationIds: ["adaptation.one"] });
    const resolution = trace.stages.find((entry) => entry.stage === "resolution");

    expect(resolution).toMatchObject({ status: "completed", detail: { outcome: "adaptation_recorded", adaptationCount: 1, changeProposalCount: 0, patchAttemptCount: 1 } });
    expect(JSON.stringify(trace)).not.toContain("succeeded");
    expect(resolution?.reason).toContain("decided from evidence observed afterwards");
  });

  it("marks the resolution skipped, with no loop stage, when no patch call was made", () => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(), result: diagnosisResult({ patchNeeded: false }), policy: policy() });
    const trace = automationStudioRuntimeRecoveryTrace({ invocation: invocation({}), policy: policy(), plan, diagnosisOk: true, patchRequested: false, patchSkippedCode: "llm.runtime_patch_not_requested" });
    const resolution = trace.stages.find((entry) => entry.stage === "resolution");

    expect(resolution).toMatchObject({ status: "skipped", providerCalled: false, detail: { outcome: "no_change_produced", skipCode: "llm.runtime_patch_not_requested" } });
    expect(resolution?.loopStage).toBeUndefined();
  });

  it("records a categorical patch failure instead of claiming no change was produced", () => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(), result: diagnosisResult(), policy: policy() });
    const trace = automationStudioRuntimeRecoveryTrace({ invocation: invocation({}), policy: policy(), plan, diagnosisOk: true, patchRequested: true, patchFailureCode: "llm.provider_output_invalid" });
    const resolution = trace.stages.find((entry) => entry.stage === "resolution");

    expect(resolution).toMatchObject({ status: "failed", providerCalled: true, loopStage: "implement", detail: { outcome: "patch_failed", failureCode: "llm.provider_output_invalid", patchAttemptCount: 0 } });
    expect(resolution?.reason).toContain("failed before it produced a usable repair");
  });

  it("records a failed diagnosis stage when the provider call did not produce one", () => {
    const trace = automationStudioRuntimeRecoveryTrace({ invocation: invocation({}), policy: policy(), diagnosisOk: false });

    expect(trace.stages[0]).toMatchObject({ stage: "diagnosis", status: "failed", providerCalled: true });
    expect(trace.stages[3]?.detail).toMatchObject({ outcome: "diagnosis_failed" });
  });

  it("records a failed diagnosis stage, with no provider called, when something stopped it first", () => {
    const trace = automationStudioRuntimeRecoveryTrace({ invocation: invocation({}), policy: policy(), diagnosisFailure: "LLM provider resolution failed." });

    expect(trace.stages[0]).toMatchObject({ stage: "diagnosis", status: "failed", providerCalled: false, reason: "LLM provider resolution failed." });
  });

  it("says the exploration stage was asked for and nothing ran it", () => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(), result: diagnosisResult({ explorationNeeded: true }), policy: policy() });
    const trace = automationStudioRuntimeRecoveryTrace({ invocation: invocation({}), policy: policy(), plan, diagnosisOk: true, patchRequested: true });

    expect(trace.stages[2]).toMatchObject({ stage: "exploration", status: "skipped", detail: { requested: true }, reason: expect.stringContaining("none was run") });
    expect(trace.stages[2]?.loopStage).toBeUndefined();
  });

  // An exploration that ran and was stopped is not the same stage record as one
  // that never ran, and both are different again from one that found something.
  // A reader who cannot tell them apart is exactly the reader Phase 2.3 exists
  // to stop producing.
  it.each([
    ["found something", "evidence_gathered", "exploration.completed", "completed"],
    ["ran out of budget", "budget_exhausted", "action_limit", "failed"],
    ["was refused", "unsafe_action_blocked", "destructive_action_refused", "refused"],
    ["found nothing", "no_evidence_found", "exploration.completed", "completed"]
  ])("records an exploration that %s as its own stage record", (_label, outcome, endedBy, status) => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(), result: diagnosisResult({ explorationNeeded: true }), policy: policy() });
    const trace = automationStudioRuntimeRecoveryTrace({
      invocation: invocation({}),
      policy: policy(),
      plan,
      diagnosisOk: true,
      patchRequested: true,
      exploration: exploration({ outcome, endedBy } as Partial<AutomationStudioRuntimeExploration>)
    });

    expect(trace.stages[2]).toMatchObject({ stage: "exploration", status, loopStage: "gather", detail: { requested: true, outcome, endedBy } });
    expect(trace.refused).toEqual([]);
  });

  it("carries no model prose into the trace", () => {
    const plan = planAutomationStudioRuntimeRecovery({
      deterministic: deterministic(),
      result: diagnosisResult({ expected: "PRIVATE_EXPECTED_TEXT", observed: "PRIVATE_OBSERVED_TEXT" }),
      policy: policy()
    });
    const trace = automationStudioRuntimeRecoveryTrace({ invocation: invocation({}), policy: policy(), plan, diagnosisOk: true, patchRequested: true });

    expect(JSON.stringify(trace)).not.toContain("PRIVATE_EXPECTED_TEXT");
    expect(JSON.stringify(trace)).not.toContain("PRIVATE_OBSERVED_TEXT");
    expect(trace.stages[0]?.detail).toMatchObject({ modelFieldCount: 2, refusalCount: 0 });
  });

  it("records a skipped diagnosis when no failed attempt was ever classified", () => {
    const trace = automationStudioRuntimeRecoveryTrace({ invocation: { invoke: true, reason: "No deterministic recovery is available for this failure.", requiredPriorAction: "none", knownRecoveryAvailable: false, rerouteAvailable: false, knownAdaptationAvailable: false }, policy: policy() });

    expect(trace.stages[0]).toMatchObject({ stage: "diagnosis", status: "skipped", detail: { resolution: "unclassified" } });
  });

  it("is always ordered, so nothing it produces is ever refused by the trace builder", () => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(), result: diagnosisResult(), policy: policy() });

    expect(automationStudioRuntimeRecoveryTrace({ invocation: invocation({}), policy: policy(), plan, diagnosisOk: true, patchRequested: true }).refused).toEqual([]);
    expect(automationStudioRuntimeRecoveryTrace({ policy: policy() }).refused).toEqual([]);
  });
});

function exploration(overrides: Partial<AutomationStudioRuntimeExploration>): AutomationStudioRuntimeExploration {
  return {
    schemaVersion: "automation-studio.exploration.v1",
    outcome: "no_evidence_found",
    reason: "The exploration finished without gathering any evidence it could answer from.",
    endedBy: "exploration.completed",
    actions: 1,
    observedActions: 0,
    refusedActions: 0,
    unusableDecisions: 0,
    accounting: { iterations: 2, toolCalls: 1, evidenceBytes: 40, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    trace: [],
    steps: [],
    stateDigestFailures: [],
    observedState: false,
    durationMs: 12,
    ...overrides
  };
}

function invocation(overrides: Partial<AutomationStudioRuntimeLlmInvocationDecision>): AutomationStudioRuntimeLlmInvocationDecision {
  return {
    invoke: true,
    reason: "No deterministic recovery is available for this failure.",
    requiredPriorAction: "none",
    knownRecoveryAvailable: false,
    rerouteAvailable: false,
    knownAdaptationAvailable: false,
    diagnosis: deterministic(),
    ...overrides
  };
}

function deterministic(overrides: Partial<AutomationStudioRuntimeDeterministicDiagnosis> = {}): AutomationStudioRuntimeDeterministicDiagnosis {
  return {
    schemaVersion: "automation-studio.deterministic-diagnosis.v1",
    failureClass: "target_not_found",
    candidateKind: "action_target_override",
    signature: "signature.one",
    resolution: "model_required",
    modelNeeded: true,
    reason: "Failure is unresolved after deterministic recovery lookup.",
    requiredPriorAction: "none",
    stillAchievable: "unknown",
    deterministicRecoveryAvailable: false,
    rerouteAvailable: false,
    knownAdaptationAvailable: false,
    knownAdaptationIds: [],
    ...overrides
  };
}

/** Only `ok` and `response` are read; the rest of the result is not consulted. */
function diagnosisResult(diagnosis: Record<string, unknown> = {}): AutomationStudioLlmTaskResult {
  return {
    ok: true,
    diagnostics: [],
    response: { kind: "diagnosis", summary: "The action could not find its control.", diagnosis }
  } as unknown as AutomationStudioLlmTaskResult;
}

function policy(overrides: Partial<AutomationStudioAdaptationPolicy> = {}): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.stages",
    scope: { kind: "flow", flowId: "flow.stages" },
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
