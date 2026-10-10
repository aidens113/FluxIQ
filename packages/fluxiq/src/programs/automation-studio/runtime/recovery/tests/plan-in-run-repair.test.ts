// The in-run repair's kinds in the recovery plan (state-aware recovery plan, C6
// step 8): offered only when the request declares an in-run repair, never
// against the policy, and in the preflight's own words when the policy forbids.

import { describe, expect, it } from "vitest";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioAdaptiveCandidateKind } from "../../adaptive-orchestrator.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import { preflightAutomationStudioRuntimePatch } from "../../live-patch.ts";
import type { AutomationStudioLlmTaskResult, AutomationStudioRuntimePatch } from "../../llm/index.ts";
import type { AutomationStudioRuntimeDeterministicDiagnosis } from "../deterministic-diagnosis.ts";
import { planAutomationStudioRuntimeRecovery } from "../plan.ts";

describe("the in-run repair's patch kinds in the plan", () => {
  it.each<AutomationStudioAdaptiveCandidateKind>(["expectation_wait_retry", "action_target_override", "recovery_path_or_reroute", "router_rule_edit", "subflow_edit_or_create"])(
    "keeps today's kinds for a %s failure when no in-run repair is declared",
    (candidateKind) => {
      const today = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(candidateKind), result: diagnosisResult(), policy: policy() }).allowedPatchKinds;
      const declaredFalse = planAutomationStudioRuntimeRecovery({ deterministic: deterministic(candidateKind), result: diagnosisResult(), policy: policy(), inRunRepair: false }).allowedPatchKinds;

      expect(today).not.toContain("add_handler");
      expect(today).not.toContain("replace_unit");
      expect(declaredFalse).toEqual(today);
    }
  );

  it("adds a handler and a unit replacement after today's kinds for an in-run repair", () => {
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic("action_target_override"), result: diagnosisResult(), policy: policy(), inRunRepair: true });

    expect(plan.allowedPatchKinds).toEqual(["temporary_target_override", "temporary_wait_retry", "add_handler", "replace_unit"]);
    expect(plan.patchRequest.request).toBe(true);
  });

  // C12: an in-run repair changes only the incident's unit, so a kind that
  // reroutes, inserts steps or calls a recovery Subflow is never offered there.
  it("offers no kind that leaves the failing unit for an in-run repair, while the after-run plan keeps them", () => {
    const inRun = planAutomationStudioRuntimeRecovery({ deterministic: deterministic("recovery_path_or_reroute"), result: diagnosisResult(), policy: policy(), inRunRepair: true });
    const afterRun = planAutomationStudioRuntimeRecovery({ deterministic: deterministic("recovery_path_or_reroute"), result: diagnosisResult(), policy: policy(), inRunRepair: false });

    expect(inRun.allowedPatchKinds).toEqual(["add_handler", "replace_unit"]);
    expect(afterRun.allowedPatchKinds).toEqual(["temporary_reroute", "temporary_recovery_subflow_call", "temporary_action_sequence"]);
  });

  it.each<AutomationStudioAdaptiveCandidateKind>(["diagnosis_only", "instruction_suggestion"])("offers nothing for a %s failure, in-run or not", (candidateKind) => {
    expect(planAutomationStudioRuntimeRecovery({ deterministic: deterministic(candidateKind), result: diagnosisResult(), policy: policy(), inRunRepair: true }).allowedPatchKinds).toEqual([]);
  });

  it.each([
    ["add_handler" as const, { allowCreateRecoveryPaths: false }],
    ["replace_unit" as const, { allowModifySubflows: false }]
  ])("never allows %s when the policy forbids it, in the preflight's own words", (kind, overrides) => {
    const forbidding = policy(overrides);
    const plan = planAutomationStudioRuntimeRecovery({ deterministic: deterministic("action_target_override"), result: diagnosisResult(), policy: forbidding, inRunRepair: true });
    const preflight = preflightAutomationStudioRuntimePatch({ projectId: "project.plan", flowId: "flow.plan", runId: "run.plan", flow: flowDocument(), patch: patchOfKind(kind), failedAttempt: failedAttempt(), policy: forbidding });

    expect(plan.allowedPatchKinds).not.toContain(kind);
    expect(plan.policyRefusals.length).toBe(1);
    expect(preflight.issues).toContain(plan.policyRefusals[0]);
  });
});

function patchOfKind(kind: "add_handler" | "replace_unit"): AutomationStudioRuntimePatch {
  if (kind === "add_handler") {
    return { kind, reason: "A notice covers the step.", event: "fail", scope: { kind: "nodes", nodeIds: ["node.action"] }, when: [], steps: [{ definitionId: "builtin.data.constant" }], then: { kind: "give_up" } };
  }
  return { kind, reason: "The step changed.", unit: { kind: "node", nodeId: "node.action" }, steps: [{ definitionId: "builtin.data.constant" }] };
}

function deterministic(candidateKind: AutomationStudioAdaptiveCandidateKind): AutomationStudioRuntimeDeterministicDiagnosis {
  return {
    schemaVersion: "automation-studio.deterministic-diagnosis.v1",
    failureClass: "target_not_found",
    candidateKind,
    signature: "signature.one",
    resolution: "model_required",
    modelNeeded: true,
    reason: "Failure is unresolved after deterministic recovery lookup.",
    requiredPriorAction: "none",
    stillAchievable: "unknown",
    deterministicRecoveryAvailable: false,
    rerouteAvailable: false,
    knownAdaptationAvailable: false,
    knownAdaptationIds: []
  };
}

/** Only `ok` and `response` are read; the rest of the result is not consulted. */
function diagnosisResult(): AutomationStudioLlmTaskResult {
  return { ok: true, diagnostics: [], response: { kind: "diagnosis", summary: "The step could not run.", diagnosis: {} } } as unknown as AutomationStudioLlmTaskResult;
}

/** Only `nodes` is read by the preflight's target check. */
function flowDocument(): AutomationStudioFlowDocument {
  return { nodes: [{ id: "node.action" }, { id: "node.end" }], edges: [] } as unknown as AutomationStudioFlowDocument;
}

function failedAttempt(): AutomationStudioNodeAttemptTrace {
  return { attemptId: "node.action.attempt.1", nodeId: "node.action", definitionId: "builtin.policy.action", startedAt: 1, finishedAt: 2, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [] };
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
