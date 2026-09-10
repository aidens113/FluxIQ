import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowDocument } from "../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "./executor.ts";
import { executeAutomationStudioRuntimePatch, preflightAutomationStudioRuntimePatch, proposeAutomationStudioRuntimeTargetOverride } from "./live-patch.ts";

describe("Automation Studio live patch testing", () => {
  it("executes a successful temporary wait/retry patch without mutating the canonical Flow", async () => {
    const flow = flowFixture();
    const original = structuredClone(flow);

    const result = await executeAutomationStudioRuntimePatch({
      projectId: "project.patch",
      flowId: flow.flowId,
      runId: "run.failed",
      flow,
      failedAttempt: failedAttempt(),
      patch: { kind: "temporary_wait_retry", targetNodeId: "constant", retryCount: 1, reason: "Retry after state settles." },
      expectedComparison: {
        comparisonId: "comparison.failed",
        nodeId: "constant",
        attemptId: "constant.attempt.1",
        status: "missing_expected_state",
        expected: { transitionId: "expected", nodeId: "constant", definitionId: "builtin.data.constant", expectedOutputs: { value: "ok" } },
        actual: { transitionId: "actual", nodeId: "constant", definitionId: "builtin.data.constant", status: "failed", outputs: {}, effects: [], startedAt: 1 },
        diffSummary: { missingOutputIds: ["value"], unexpectedOutputIds: [], missingEffectTypes: [], unexpectedEffectTypes: [], routeMatched: false, statusMatched: false, stateCheckCount: 0 }
      },
      policy: repairPolicy(),
      now: () => 10
    });

    expect(result.preflight.ok).toBe(true);
    expect(result.trace?.status).toBe("succeeded");
    expect(result.restoredExpectedState).toBe(true);
    expect(result.retryOriginalAction).toBe(true);
    expect(result.adaptation).toMatchObject({ status: "validated", riskLevel: "low", validationResults: [{ status: "succeeded" }] });
    expect(flow).toEqual(original);
  });

  it("preserves failed patches as rejected adaptation evidence", async () => {
    const flow = flowFixture({ brokenEnd: true });
    const result = await executeAutomationStudioRuntimePatch({
      projectId: "project.patch",
      flowId: flow.flowId,
      runId: "run.failed",
      flow,
      failedAttempt: failedAttempt(),
      patch: { kind: "temporary_wait_retry", targetNodeId: "constant", retryCount: 1, reason: "Retry after state settles." },
      policy: repairPolicy(),
      now: () => 11
    });

    expect(result.trace?.status).toBe("failed");
    expect(result.restoredExpectedState).toBe(false);
    expect(result.adaptation).toMatchObject({ status: "rejected", validationResults: [{ status: "failed" }] });
  });

  it("requires approval for side-effecting patches when policy demands it", () => {
    const preflight = preflightAutomationStudioRuntimePatch({
      projectId: "project.patch",
      flowId: "flow.patch",
      runId: "run.failed",
      flow: flowFixture(),
      failedAttempt: failedAttempt(),
      patch: { kind: "temporary_target_override", targetNodeId: "constant", target: { selector: "#submit" }, reason: "Use visible button." },
      policy: repairPolicy({ requireApprovalForExternalSideEffects: true, allowExternalSideEffects: true })
    });

    expect(preflight.ok).toBe(false);
    expect(preflight.issues).toContain("External side-effecting patch requires explicit authorization.");
  });

  it("structurally validates a high-risk target proposal without executing it", () => {
    const nativeNodeExecutor = vi.fn();
    const result = proposeAutomationStudioRuntimeTargetOverride({
      projectId: "project.patch",
      flowId: "flow.patch",
      runId: "run.failed",
      flow: flowFixture(),
      failedAttempt: failedAttempt(),
      patch: { kind: "temporary_target_override", targetNodeId: "constant", target: { selector: "#submit-current" }, reason: "Use the current target." },
      policy: repairPolicy({ allowExternalSideEffects: false, requireApprovalForExternalSideEffects: true }),
      proposalMode: "manual",
      authorizedExternalSideEffects: false,
      options: { nativeNodeExecutor },
      now: () => 12
    });

    expect(result).toMatchObject({
      preflight: { ok: true, requiresExternalSideEffectApproval: true },
      restoredExpectedState: false,
      retryOriginalAction: false,
      metadata: { proposalOnly: true, executed: false },
      adaptation: {
        status: "proposed",
        riskLevel: "high",
        patch: [{ kind: "edit_action_target", targetId: "constant", after: { selector: "#submit-current" }, metadata: { externalSideEffect: true } }],
        metadata: { proposalOnly: true, executed: false, traceStatus: "not-run", retryOriginalAction: false }
      },
      changeProposal: { status: "pending", mode: "manual", riskLevel: "high" }
    });
    expect(result).not.toHaveProperty("trace");
    expect(nativeNodeExecutor).not.toHaveBeenCalled();
  });

  it.each(["absent", "ambiguous"] as const)("rejects a target proposal that is %s in sanitized domain evidence", (status) => {
    const validations: unknown[] = [];
    const result = proposeAutomationStudioRuntimeTargetOverride({
      projectId: "project.patch",
      flowId: "flow.patch",
      runId: "run.failed",
      flow: flowFixture(),
      failedAttempt: failedAttempt(),
      patch: { kind: "temporary_target_override", targetNodeId: "constant", target: { selector: "#candidate" }, reason: "Use the observed target." },
      policy: repairPolicy(),
      proposalMode: "manual",
      validateTargetOverrideEvidence: (target, failedAction) => {
        validations.push({ target, failedAction });
        return { status };
      }
    });

    expect(result.preflight).toEqual({
      ok: false,
      issues: [`Target override is ${status} ${status === "absent" ? "from" : "in"} current sanitized evidence.`],
      requiresExternalSideEffectApproval: true
    });
    expect(result).not.toHaveProperty("adaptation");
    expect(result).not.toHaveProperty("changeProposal");
    expect(result).not.toHaveProperty("trace");
    expect(validations).toEqual([{
      target: { selector: "#candidate" },
      failedAction: { nodeId: "constant", definitionId: "builtin.data.constant" }
    }]);
  });

  it("uses one exact domain-resolved target and persists only categorical resolution provenance", () => {
    const result = proposeAutomationStudioRuntimeTargetOverride({
      projectId: "project.patch",
      flowId: "flow.patch",
      runId: "run.failed",
      flow: flowFixture(),
      failedAttempt: failedAttempt(),
      patch: { kind: "temporary_target_override", targetNodeId: "constant", target: { selector: "#wrong-control" }, reason: "Use compatible evidence." },
      policy: repairPolicy(),
      proposalMode: "manual",
      validateTargetOverrideEvidence: () => ({ status: "resolved", target: { selector: "#compatible-control" } }),
      now: () => 14
    });

    expect(result).toMatchObject({
      patch: { target: { selector: "#compatible-control" } },
      preflight: { ok: true },
      metadata: { targetResolution: "resolved" },
      adaptation: {
        patch: [{ kind: "edit_action_target", after: { selector: "#compatible-control" } }],
        metadata: { targetResolution: "resolved" }
      },
      changeProposal: { patches: [{ after: { selector: "#compatible-control" } }] }
    });
    expect(result.adaptation?.metadata).not.toHaveProperty("resolvedTarget");
    expect(result.changeProposal?.metadata).not.toHaveProperty("resolvedTarget");
  });

  it("rewrites a model-selected existing node to the authoritative failed node", () => {
    const result = proposeAutomationStudioRuntimeTargetOverride({
      projectId: "project.patch",
      flowId: "flow.patch",
      runId: "run.failed",
      flow: flowFixture(),
      failedAttempt: failedAttempt(),
      patch: { kind: "temporary_target_override", targetNodeId: "end", target: { selector: "#compatible-control" }, reason: "Repair the failed action." },
      policy: repairPolicy(),
      proposalMode: "manual",
      validateTargetOverrideEvidence: () => ({ status: "matched" }),
      now: () => 15
    });

    expect(result).toMatchObject({
      patch: { targetNodeId: "constant" },
      preflight: { ok: true },
      metadata: { targetNodeResolution: "resolved" },
      adaptation: {
        patch: [{ kind: "edit_action_target", targetId: "constant", after: { selector: "#compatible-control" } }],
        metadata: { targetNodeResolution: "resolved" }
      },
      changeProposal: { patches: [{ targetId: "constant" }] }
    });
    expect(result.adaptation?.metadata).not.toHaveProperty("resolvedTargetNodeId");
  });

  it("composes authoritative failed-node and domain selector resolution", () => {
    const result = proposeAutomationStudioRuntimeTargetOverride({
      projectId: "project.patch",
      flowId: "flow.patch",
      runId: "run.failed",
      flow: flowFixture(),
      failedAttempt: failedAttempt(),
      patch: { kind: "temporary_target_override", targetNodeId: "end", target: { selector: "#wrong-control" }, reason: "Repair the failed action." },
      policy: repairPolicy(),
      proposalMode: "manual",
      validateTargetOverrideEvidence: () => ({ status: "resolved", target: { selector: "#compatible-control" } }),
      now: () => 16
    });

    expect(result).toMatchObject({
      patch: { targetNodeId: "constant", target: { selector: "#compatible-control" } },
      preflight: { ok: true },
      metadata: { targetNodeResolution: "resolved", targetResolution: "resolved" },
      adaptation: {
        patch: [{ kind: "edit_action_target", targetId: "constant", after: { selector: "#compatible-control" } }],
        metadata: { targetNodeResolution: "resolved", targetResolution: "resolved" }
      },
      changeProposal: { patches: [{ targetId: "constant", after: { selector: "#compatible-control" } }] }
    });
  });

  it("fails closed when the authoritative failed node is absent from the Flow", () => {
    const result = proposeAutomationStudioRuntimeTargetOverride({
      projectId: "project.patch",
      flowId: "flow.patch",
      runId: "run.failed",
      flow: flowFixture(),
      failedAttempt: { ...failedAttempt(), nodeId: "missing" },
      patch: { kind: "temporary_target_override", targetNodeId: "end", target: { selector: "#candidate" }, reason: "Repair the failed action." },
      policy: repairPolicy(),
      proposalMode: "manual",
      validateTargetOverrideEvidence: () => ({ status: "matched" })
    });

    expect(result.preflight).toMatchObject({ ok: false, issues: ["Failed action node is not present in this Flow."] });
    expect(result).not.toHaveProperty("adaptation");
    expect(result).not.toHaveProperty("changeProposal");
  });

  it("fails closed when a domain returns a malformed resolved target", () => {
    const result = proposeAutomationStudioRuntimeTargetOverride({
      projectId: "project.patch",
      flowId: "flow.patch",
      runId: "run.failed",
      flow: flowFixture(),
      failedAttempt: failedAttempt(),
      patch: { kind: "temporary_target_override", targetNodeId: "constant", target: { selector: "#candidate" }, reason: "Use compatible evidence." },
      policy: repairPolicy(),
      proposalMode: "manual",
      validateTargetOverrideEvidence: () => ({ status: "resolved", target: { selector: "" } } as any)
    });

    expect(result.preflight).toMatchObject({ ok: false, issues: ["Resolved target override is invalid."] });
    expect(result).not.toHaveProperty("adaptation");
    expect(result).not.toHaveProperty("changeProposal");
  });

  it("does not create a target proposal when target modification is locked by policy", () => {
    const result = proposeAutomationStudioRuntimeTargetOverride({
      projectId: "project.patch",
      flowId: "flow.patch",
      runId: "run.failed",
      flow: flowFixture(),
      failedAttempt: failedAttempt(),
      patch: { kind: "temporary_target_override", targetNodeId: "constant", target: { selector: "#submit" }, reason: "Use the current target." },
      policy: repairPolicy({ allowModifyActionTargets: false }),
      proposalMode: "manual"
    });

    expect(result).toMatchObject({
      preflight: { ok: false, issues: ["Action target overrides are disabled by adaptation policy."] },
      restoredExpectedState: false,
      retryOriginalAction: false
    });
    expect(result).not.toHaveProperty("adaptation");
    expect(result).not.toHaveProperty("changeProposal");
    expect(result).not.toHaveProperty("trace");
  });

  it("blocks host-bound patches when the host does not declare required capabilities", () => {
    const preflight = preflightAutomationStudioRuntimePatch({
      projectId: "project.patch",
      flowId: "flow.patch",
      runId: "run.failed",
      flow: flowFixture(),
      failedAttempt: failedAttempt(),
      patch: { kind: "temporary_wait_retry", targetNodeId: "constant", retryCount: 1, reason: "Retry after state settles." },
      policy: repairPolicy(),
      hostCapabilities: []
    });

    expect(preflight.ok).toBe(false);
    expect(preflight.issues).toContain("Runtime patch requires host capability wait-observe.");
  });

  it("denies patches blocked by adaptation policy", () => {
    const preflight = preflightAutomationStudioRuntimePatch({
      projectId: "project.patch",
      flowId: "flow.patch",
      runId: "run.failed",
      flow: flowFixture(),
      failedAttempt: failedAttempt(),
      patch: { kind: "temporary_reroute", fromNodeId: "constant", toNodeId: "end", reason: "Skip failed step." },
      policy: repairPolicy({ allowModifyRouter: false })
    });

    expect(preflight.ok).toBe(false);
    expect(preflight.issues).toContain("Temporary reroutes are disabled by adaptation policy.");
  });

  it("turns successful structural patches into adaptation and change proposal candidates", async () => {
    const result = await executeAutomationStudioRuntimePatch({
      projectId: "project.patch",
      flowId: "flow.patch",
      runId: "run.failed",
      flow: flowFixture(),
      failedAttempt: failedAttempt(),
      patch: { kind: "temporary_reroute", fromNodeId: "constant", toNodeId: "end", reason: "Route around broken confirmation." },
      policy: repairPolicy({ allowModifyRouter: true }),
      proposalMode: "manual",
      now: () => 12
    });

    expect(result.restoredExpectedState).toBe(true);
    expect(result.adaptation).toMatchObject({ status: "validated", patch: [{ kind: "edit_router", targetId: "constant" }] });
    expect(result.changeProposal).toMatchObject({ status: "pending", mode: "manual", patches: [{ kind: "edit_router" }] });
  });
});

function flowFixture(input: { brokenEnd?: boolean } = {}): AutomationStudioFlowDocument {
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
      { id: "end", definitionId: input.brokenEnd ? "unknown.end" : "builtin.control.end", parameterValues: { resultStatus: "success" } }
    ],
    edges: [
      { id: "constant.end", sourceNodeId: "constant", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
    ]
  };
}

function failedAttempt(): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "constant.attempt.1",
    nodeId: "constant",
    definitionId: "builtin.data.constant",
    startedAt: 1,
    finishedAt: 2,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    message: "Expected value was not observed."
  };
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
