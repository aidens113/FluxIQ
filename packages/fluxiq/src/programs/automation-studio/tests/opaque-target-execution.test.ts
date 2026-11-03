// The write-then-read round trip of an opaque repair target: Core preserves it
// through real execution and asks nothing of it. What it means is the domain's,
// tested where the domain lives.

import { describe, expect, it } from "vitest";
import { executeAutomationStudioRuntimePatch } from "../runtime/index.ts";
import { isAutomationStudioRuntimeTargetOverrideTarget } from "../runtime/llm/index.ts";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../runtime/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../runtime/index.ts";

/** What the web domain resolves a one-element repair to, verbatim. */
const DOMAIN_RESOLVED_TARGET = {
  handles: { element: "target.3" },
  handleResolution: "named",
  tagName: "button",
  accessibleName: "Place order",
  visibleText: "Place order",
  selector: "#place-order-v2",
  metadata: { browserFrameId: 3, formId: "checkout" }
} as const;

/**
 * The observation point, and it is the real one: Core hands the host the node
 * it is about to run, parameters resolved, which is the same object
 * `applyRuntimePatchToFlow` wrote the repaired target into. A web host reads
 * exactly this. Nothing here inspects a private function or a copy of the patch.
 */
function recordingHost(): { hostRuntime: AutomationStudioHostRuntimeBoundary; nodes: AutomationStudioFlowNode[] } {
  const nodes: AutomationStudioFlowNode[] = [];
  return {
    nodes,
    hostRuntime: {
      capabilities: ["action-dispatch", "state-snapshot"],
      captureStateSnapshot: (input) => {
        nodes.push(input.node);
        return { stateSnapshotId: `state.${nodes.length}`, stateRef: `state.${nodes.length}@${input.attemptId}:${input.point}`, capturedAt: 1 };
      }
    }
  };
}

/** The target the repaired node actually ran with. */
async function executedTarget(host: ReturnType<typeof recordingHost>): Promise<unknown> {
  const flow = flowFixture();
  const result = await executeAutomationStudioRuntimePatch({
    projectId: "project.round-trip",
    flowId: flow.flowId,
    runId: "run.failed",
    flow,
    failedAttempt: failedAttempt(),
    // The model names the handle; what the node runs with is the domain's
    // resolution of it, because an executed override passes the same domain
    // check a proposed one does.
    patch: {
      kind: "temporary_target_override",
      targetNodeId: "constant",
      target: { handles: { ...DOMAIN_RESOLVED_TARGET.handles } },
      reason: "The control moved."
    },
    validateTargetOverrideEvidence: () => ({ status: "resolved", target: { ...DOMAIN_RESOLVED_TARGET } }),
    policy: repairPolicy(),
    authorizedExternalSideEffects: true,
    options: { hostRuntime: host.hostRuntime },
    now: () => 10
  });
  expect(result.preflight.ok, result.preflight.issues.join(" ")).toBe(true);
  expect(result.trace?.status).toBe("succeeded");
  // The canonical Flow is never mutated, so the only place the repaired target
  // exists is the copy the rerun executed.
  expect(flow.nodes.find((node) => node.id === "constant")?.parameterValues?.target).toBeUndefined();
  const repaired = host.nodes.find((node) => node.id === "constant");
  expect(repaired, "the host was never handed the repaired node").toBeDefined();
  return repaired!.parameterValues?.target;
}

describe("Automation Studio opaque repair target, written and read back", () => {
  it("survives being written into the repaired node's parameters and executed", async () => {
    // Core will carry it: bounded handles, JSON, small.
    expect(isAutomationStudioRuntimeTargetOverrideTarget(DOMAIN_RESOLVED_TARGET)).toBe(true);

    const written = await executedTarget(recordingHost());
    expect(written).toEqual(DOMAIN_RESOLVED_TARGET);

    // The handles ride along without Core ascribing meaning to them, which is
    // the whole point: they are how the domain gets back to what it resolved.
    expect((written as Record<string, unknown>).handles).toEqual({ element: "target.3" });
  });

  it("carries a handle-only target without judging whether it identifies anything", () => {
    expect(isAutomationStudioRuntimeTargetOverrideTarget({ handles: { element: "target.3" } })).toBe(true);
  });
});

function flowFixture(): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.round-trip",
    ownerKind: "routine",
    ownerId: "routine.round-trip",
    name: "Round Trip Flow",
    createdAt: 1,
    updatedAt: 1,
    nodes: [
      { id: "constant", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } },
      { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } }
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
    message: "The target was not found.",
    failure: { category: "target_not_found", code: "example.target.not_found", retryable: true }
  };
}

function repairPolicy(): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.round-trip",
    scope: { kind: "flow", flowId: "flow.round-trip" },
    preset: "repair",
    proposalMode: "auto",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowExternalSideEffects: true,
    allowDeleteOrDisableBehavior: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: false,
    createdAt: 1,
    updatedAt: 1
  };
}
