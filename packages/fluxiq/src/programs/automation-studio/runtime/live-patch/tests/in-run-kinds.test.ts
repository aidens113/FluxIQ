// What the runtime-patch path records for the in-run repair's two kinds
// (state-aware recovery plan, C6 step 8 and C12): their policy lines, their
// risk, the change patch a promotion would read, and the trial they run
// through the one overlay.

import { describe, expect, it } from "vitest";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import { adaptationFromRuntimePatch, executeAutomationStudioRuntimePatch, preflightAutomationStudioRuntimePatch, prepareAutomationStudioInRunRepair } from "../../live-patch.ts";
import type { AutomationStudioRuntimePatch } from "../../llm/index.ts";
import { automationStudioRepairUnitDigest } from "../index.ts";

const handler: AutomationStudioRuntimePatch = {
  kind: "add_handler",
  reason: "A notice can cover the step.",
  event: "fail",
  scope: { kind: "nodes", nodeIds: ["constant"] },
  when: [{ fact: "dialog.visible", op: "visible" }],
  steps: [{ definitionId: "builtin.data.constant", parameters: { value: "dismissed" } }],
  then: { kind: "give_up" }
};

const replacement: AutomationStudioRuntimePatch = {
  kind: "replace_unit",
  reason: "The step changed.",
  unit: { kind: "node", nodeId: "constant" },
  steps: [{ definitionId: "builtin.data.constant", parameters: { value: "ok" } }]
};

function input(patch: AutomationStudioRuntimePatch, policy: AutomationStudioAdaptationPolicy = repairPolicy()) {
  return { projectId: "project.patch", flowId: "flow.patch", runId: "run.failed", flow: flowFixture(), failedAttempt: failedAttempt(), patch, policy, now: () => 30 };
}

describe("the in-run repair kinds on the runtime-patch path", () => {
  it("are judged by their own policy lines and the side-effect lines, since both run steps", () => {
    expect(preflightAutomationStudioRuntimePatch(input(handler, repairPolicy({ allowCreateRecoveryPaths: false }))).issues).toContain("Handlers added by a repair are disabled by adaptation policy.");
    expect(preflightAutomationStudioRuntimePatch(input(replacement, repairPolicy({ allowModifySubflows: false }))).issues).toContain("Unit replacements are disabled by adaptation policy.");
    expect(preflightAutomationStudioRuntimePatch(input(replacement))).toMatchObject({ ok: false, requiresExternalSideEffectApproval: true });
    expect(preflightAutomationStudioRuntimePatch({ ...input(replacement), sideEffectPermission: "permitted" }).ok).toBe(true);
  });

  it("refuses a handler or a replacement naming a node the Flow does not have", () => {
    const absent = { ...replacement, unit: { kind: "node" as const, nodeId: "absent" } };
    expect(preflightAutomationStudioRuntimePatch({ ...input(absent), sideEffectPermission: "permitted" }).issues).toContain("Runtime patch points at a node or subflow that is not present in this Flow.");
  });

  it("records each as a high-risk change of its own durable kind, carrying its own spec", () => {
    const handlerAdaptation = adaptationFromRuntimePatch(input(handler), undefined, { status: "not_executed", reason: "contract_probe" });
    const replacementAdaptation = adaptationFromRuntimePatch(input(replacement), undefined, { status: "not_executed", reason: "contract_probe" });

    expect(handlerAdaptation).toMatchObject({ riskLevel: "high", patch: [{ kind: "add_handler", targetId: "constant", after: { event: "fail", then: { kind: "give_up" } }, metadata: { runtimePatchKind: "add_handler" } }] });
    expect(replacementAdaptation).toMatchObject({ riskLevel: "high", patch: [{ kind: "replace_unit", targetId: "constant", after: { unit: { kind: "node", nodeId: "constant" } } }] });
    expect(handlerAdaptation.patch[0]?.after).not.toHaveProperty("reason");
    expect(handlerAdaptation.patch[0]?.after).not.toHaveProperty("kind");
  });

  it("prepares an in-run fix: checked, overlaid, recorded as awaiting the judged run, and linked to its review record", () => {
    const flow = flowFixture();
    const original = structuredClone(flow);
    const prepared = prepareAutomationStudioInRunRepair({ ...input(replacement), flow, sideEffectPermission: "permitted" });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.overlay.changedUnit).toEqual({ kind: "node", nodeId: "constant" });
    expect(prepared.adaptation).toMatchObject({
      status: "testing",
      proposalId: prepared.changeProposal?.proposalId,
      metadata: { verification: { status: "unverifiable", reason: "in_run_trial", awaitsJudgedRun: true }, retryOriginalAction: false, inRunRepair: true },
      patch: [{ kind: "replace_unit", targetId: "constant", before: { unitDigest: automationStudioRepairUnitDigest(flow, { kind: "node", nodeId: "constant" }) } }]
    });
    expect(prepared.changeProposal).toMatchObject({ sourceAdaptationId: prepared.adaptation.adaptationId, patches: prepared.adaptation.patch });
    expect(flow).toEqual(original);
  });

  it("refuses to prepare an in-run fix the preflight refuses, before anything is overlaid", () => {
    const prepared = prepareAutomationStudioInRunRepair(input(handler, repairPolicy({ allowCreateRecoveryPaths: false })));

    expect(prepared).toMatchObject({ ok: false, code: "preflight_refused" });
  });

  it("trials a replaced node from the node itself, through the overlay, and leaves the Flow alone", async () => {
    const flow = flowFixture();
    const original = structuredClone(flow);
    const result = await executeAutomationStudioRuntimePatch({ ...input(replacement), flow, sideEffectPermission: "permitted" });

    expect(result.preflight.ok).toBe(true);
    expect(result.trace?.attempts[0]?.nodeId).toBe("constant");
    expect(result.retryOriginalAction).toBe(false);
    expect(flow).toEqual(original);
  });

  it("does not trial a part replacement it was not given the part's graph for", async () => {
    const part: AutomationStudioRuntimePatch = { kind: "replace_unit", reason: "The part changed.", unit: { kind: "part", subflowId: "subflow.search" }, steps: [{ definitionId: "builtin.data.constant" }] };
    const result = await executeAutomationStudioRuntimePatch({ ...input(part), sideEffectPermission: "permitted" });

    expect(result.verification).toEqual({ status: "not_executed", reason: "part_graph_absent:subflow.search" });
  });
});

function flowFixture(): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.patch",
    ownerKind: "routine",
    ownerId: "routine.patch",
    name: "Patch Flow",
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      { id: "constant", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } },
      { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } }
    ],
    edges: [{ id: "constant.end", sourceNodeId: "constant", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }]
  };
}

function failedAttempt(): AutomationStudioNodeAttemptTrace {
  return { attemptId: "constant.attempt.1", nodeId: "constant", definitionId: "builtin.data.constant", startedAt: 1, finishedAt: 2, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], message: "Expected value was not observed." };
}

function repairPolicy(overrides: Partial<AutomationStudioAdaptationPolicy> = {}): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.patch",
    scope: { kind: "flow", flowId: "flow.patch" },
    preset: "repair",
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
