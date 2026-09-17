import { describe, expect, it } from "vitest";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioLlmTaskResult, AutomationStudioRuntimePatch } from "../../llm/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import { preflightAutomationStudioRuntimePatch } from "../../live-patch.ts";
import type { AutomationStudioRuntimeDeterministicDiagnosis } from "../deterministic-diagnosis.ts";
import { planAutomationStudioRuntimeRecovery } from "../plan.ts";

// Stage B. There was no plan stage: diagnosis was followed straight by an
// attempt to patch, so the only thing between a failed run and a model-authored
// change was whether a provider happened to be configured.
describe("planAutomationStudioRuntimeRecovery", () => {
  it("asks for a patch when the diagnosis calls for one and the policy permits a kind that serves it", () => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(), result: diagnosisResult(), policy: policy() });

    expect(plan).toMatchObject({ loopStage: "plan", source: "deterministic", candidateKind: "action_target_override", explorationRequested: false });
    expect(plan.allowedPatchKinds).toEqual(["temporary_target_override", "temporary_wait_retry"]);
    expect(plan.patchRequest.request).toBe(true);
    expect(plan.steps.map((step) => step.action)).toEqual(["request_patch"]);
  });

  // Phase D's rule, reused rather than restated: the patch is a continuation of
  // the diagnosis, so a diagnosis that failed has nothing to continue from.
  it.each([
    ["a failed diagnosis call", { ...diagnosisResult(), ok: false }, "The diagnosis call failed"],
    ["a response that is not a diagnosis", { ...diagnosisResult(), response: { kind: "instruction_suggestion" as const, summary: "Write it down.", instructions: [] } } as unknown as AutomationStudioLlmTaskResult, "so no patch was requested"],
    ["no diagnosis at all", undefined, "No diagnosis was requested."]
  ])("asks for no patch after %s", (_label, result, reason) => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(), ...(result ? { result } : {}), policy: policy() });

    expect(plan.patchRequest).toMatchObject({ request: false, reason: expect.stringContaining(reason) });
    expect(plan.steps.map((step) => step.action)).toEqual(["stop"]);
  });

  // L5's second clause. A diagnosis that asks for neither is a report, and a
  // report is not a reason to change the Flow.
  it("asks for no patch when the diagnosis asks for neither a patch nor exploration", () => {
    const plan = planAutomationStudioRuntimeRecovery({
      deterministic: deterministic(),
      result: diagnosisResult({ patchNeeded: false, explorationNeeded: false }),
      policy: policy()
    });

    expect(plan.patchRequest).toMatchObject({ request: false, reason: "The diagnosis asked for neither a patch nor exploration, so no patch was requested." });
  });

  // The model's way of saying "the page refuses this on purpose": the step's
  // intended result can no longer be had. A patch requested after that answer
  // can only be a substitute, and under a proposal grant the model must name
  // one -- which is how a deleted item's click was re-pointed at another button
  // (live repair campaign, 2026-09-17). An omitted `patchNeeded` defaults to
  // the classifier's "yes", so the verdict has to stop the request by itself.
  it.each([
    ["with patchNeeded omitted", { stillAchievable: "no" }],
    ["even beside a patchNeeded of true", { stillAchievable: "no", patchNeeded: true }],
    ["even beside a request to explore", { stillAchievable: "no", explorationNeeded: true }]
  ])("asks for no patch when the diagnosis says the result can no longer be achieved, %s", (_label, reported) => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(), result: diagnosisResult(reported), policy: policy() });

    expect(plan.diagnosis.stillAchievable).toBe("no");
    expect(plan.patchRequest).toEqual({ request: false, reason: "The diagnosis says the step's intended result can no longer be achieved, so no patch was requested." });
    expect(plan.steps.map((step) => step.action)).not.toContain("request_patch");
  });

  // A refusal is allowed to follow a look. Cancelling the exploration as well
  // would make "let me see the page first, then say there is nothing to do"
  // impossible, and that is the answer four of the six live refusal tasks
  // needed (w2-model-context-audit).
  it("still explores when the diagnosis says the result is unachievable but asks to look first", () => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(), result: diagnosisResult({ stillAchievable: "no", explorationNeeded: true }), policy: policy() });

    expect(plan.explorationRequested).toBe(true);
    expect(plan.steps.map((step) => step.action)).toEqual(["explore"]);
    expect(plan.patchRequest.request).toBe(false);
  });

  it("still asks for a patch when the diagnosis cannot tell whether the result is achievable", () => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(), result: diagnosisResult({ stillAchievable: "unknown" }), policy: policy() });

    expect(plan.patchRequest.request).toBe(true);
  });

  it("still asks for a patch when the diagnosis asks for exploration, and says exploration was asked for", () => {
    const plan = planAutomationStudioRuntimeRecovery({
      deterministic: deterministic(),
      result: diagnosisResult({ patchNeeded: false, explorationNeeded: true }),
      policy: policy()
    });

    expect(plan.explorationRequested).toBe(true);
    expect(plan.patchRequest.request).toBe(true);
    expect(plan.steps.map((step) => step.action)).toEqual(["explore", "request_patch"]);
  });

  it.each([
    ["deterministic_recovery" as const, "apply_known_recovery" as const],
    ["known_adaptation" as const, "apply_known_adaptation" as const],
    ["manual_intervention" as const, "request_manual_intervention" as const]
  ])("plans the deterministic answer, and no patch, when the diagnosis resolved as %s", (resolution, action) => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic({ resolution, modelNeeded: false }), result: diagnosisResult(), policy: policy() });

    expect(plan.steps.map((step) => step.action)).toEqual([action]);
    expect(plan.patchRequest).toMatchObject({ request: false, reason: expect.stringContaining(resolution.replace(/_/g, " ")) });
  });

  it("plans no patch kind at all, and asks for none, when runtime recovery is switched off", () => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(), result: diagnosisResult(), policy: policy({ allowRuntimeRecovery: false }) });

    expect(plan.allowedPatchKinds).toEqual([]);
    expect(plan.policyRefusals).toEqual(["Runtime recovery is disabled by adaptation policy."]);
    expect(plan.patchRequest).toMatchObject({ request: false, reason: expect.stringContaining("permits no runtime patch kind") });
  });

  it("asks for no patch when every kind that could serve the failure is switched off", () => {
    const plan = planAutomationStudioRuntimeRecovery({
      deterministic: deterministic({ candidateKind: "router_rule_edit" }),
      result: diagnosisResult(),
      policy: policy({ allowModifyRouter: false })
    });

    expect(plan.allowedPatchKinds).toEqual([]);
    expect(plan.patchRequest.request).toBe(false);
  });

  // The mutation this is written against: a plan that asks the model for a kind
  // the preflight will refuse has told it to do work that cannot land. The
  // refusal sentences are asserted to be the preflight's own, so the two cannot
  // drift into disagreeing about what the policy says.
  it.each([
    ["temporary_target_override" as const, "action_target_override" as const, { allowModifyActionTargets: false }],
    ["temporary_reroute" as const, "router_rule_edit" as const, { allowModifyRouter: false }],
    ["temporary_recovery_subflow_call" as const, "subflow_edit_or_create" as const, { allowCreateRecoveryPaths: false }]
  ])("never allows %s when the policy forbids it, in the preflight's own words", (kind, candidateKind, overrides) => {
    const forbidding = policy(overrides);
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic({ candidateKind }), result: diagnosisResult(), policy: forbidding });
    const preflight = preflightAutomationStudioRuntimePatch({
      projectId: "project.plan",
      flowId: "flow.plan",
      runId: "run.plan",
      flow: flowDocument(),
      patch: patchOfKind(kind),
      failedAttempt: failedAttempt(),
      policy: forbidding
    });

    expect(plan.allowedPatchKinds).not.toContain(kind);
    expect(plan.policyRefusals.length).toBeGreaterThan(0);
    for (const refusal of plan.policyRefusals) expect(preflight.issues).toContain(refusal);
    expect(planAutomationStudioRuntimeRecovery({ deterministic: deterministic({ candidateKind }), result: diagnosisResult(), policy: policy() }).allowedPatchKinds).toContain(kind);
  });

  it("plans nothing, and asks for nothing, when no failed attempt was classified", () => {
    const plan = planAutomationStudioRuntimeRecovery({ result: diagnosisResult(), policy: policy() });

    expect(plan.steps.map((step) => step.action)).toEqual(["stop"]);
    expect(plan.diagnosis.refusals).toEqual(["No failed attempt reached the diagnosis, so nothing was classified."]);
  });
});

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

function patchOfKind(kind: "temporary_target_override" | "temporary_reroute" | "temporary_recovery_subflow_call"): AutomationStudioRuntimePatch {
  if (kind === "temporary_target_override") return { kind, targetNodeId: "node.action", target: { handles: { control: "target.1" } }, reason: "Re-point the control." };
  if (kind === "temporary_reroute") return { kind, fromNodeId: "node.action", toNodeId: "node.end", reason: "Route around the step." };
  return { kind, subflowId: "subflow.recovery", reason: "Run the recovery path." };
}

/** Only `nodes` and `subflows` are read by the preflight's target check. */
function flowDocument(): AutomationStudioFlowDocument {
  return {
    nodes: [{ id: "node.action" }, { id: "node.end" }],
    edges: [],
    subflows: [{ subflowId: "subflow.recovery" }]
  } as unknown as AutomationStudioFlowDocument;
}

function failedAttempt(): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "node.action.attempt.1",
    nodeId: "node.action",
    definitionId: "builtin.policy.action",
    startedAt: 1,
    finishedAt: 2,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: []
  };
}

function policy(overrides: Partial<AutomationStudioAdaptationPolicy> = {}): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.plan",
    scope: { kind: "flow", flowId: "flow.plan" },
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
