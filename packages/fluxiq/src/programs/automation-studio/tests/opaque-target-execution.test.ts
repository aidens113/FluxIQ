// The write-then-read round trip of an opaque repair target.
//
// This is the one path where the change from `{ selector: string }` to an
// opaque, domain-owned target could break real execution while every other test
// stays green. `applyRuntimePatchToFlow` writes the target straight into the
// repaired node's `parameterValues.target`, and from that moment nothing checks
// it again: the node runs, the rerun succeeds, the adaptation is recorded as
// validated, and the repair reports success whether or not the thing it wrote
// can still be read back as an element target. A repair that applies, reports
// success and points at nothing is exactly the failure this file exists to make
// impossible.
//
// So the round trip is driven through the public path rather than asserted on
// intermediate objects: a real patch, applied by `executeAutomationStudioRuntimePatch`
// to a real Flow, and the target read back off the attempt the executed node
// actually recorded. What comes back is then put through Core's element-target
// normalizer and its matcher, because "readable" is not the claim -- the claim
// is that it still identifies the right element.
//
// The target literal below is the genuine article: it is what
// `validateWebRuntimeTargetOverrideEvidence` in the web domain
// (`domain/src/runtime/llm-evidence/target-override.ts`) returns, copied from
// its output rather than imagined, because Core must not import a domain to
// test a contract it deliberately knows nothing about.

import { describe, expect, it } from "vitest";
import { executeAutomationStudioRuntimePatch } from "../runtime/index.ts";
import { isAutomationStudioRuntimeTargetOverrideTarget } from "../runtime/llm/index.ts";
import { normalizeAutomationStudioElementTarget, validateAutomationStudioElementTarget } from "../model/index.ts";
import { createAutomationStudioElementMatcher } from "../fingerprinting/index.ts";
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
    patch: {
      kind: "temporary_target_override",
      targetNodeId: "constant",
      target: { ...DOMAIN_RESOLVED_TARGET },
      reason: "The control moved."
    },
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

    // And it is still a target after the round trip, rather than only looking
    // like one: Core's own normalizer reads it with no domain-specific branch.
    const normalized = normalizeAutomationStudioElementTarget(written, { source: "runtime" });
    expect(normalized, "the repaired node ran with a target Core can no longer read as an element").not.toBeNull();
    expect(validateAutomationStudioElementTarget(normalized!).issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(normalized!.fingerprint).toMatchObject({
      tagName: "button",
      accessibleName: "Place order",
      visibleText: "Place order",
      selector: "#place-order-v2"
    });
    // The handles ride along without Core ascribing meaning to them, which is
    // the whole point: they are how the domain gets back to what it resolved.
    expect((written as Record<string, unknown>).handles).toEqual({ element: "target.3" });
  });

  it("would have caught a repair that applied, reported success, and pointed at nothing", () => {
    // The negative that makes the row above worth having. A target carrying only
    // its handles is perfectly valid to Core -- it is carried, written into the
    // node, executed, and the rerun succeeds -- and it identifies no element at
    // all. Nothing but this check stands between that and a green run.
    expect(isAutomationStudioRuntimeTargetOverrideTarget({ handles: { element: "target.3" } })).toBe(true);
    expect(normalizeAutomationStudioElementTarget({ handles: { element: "target.3" } }, { source: "runtime" })).toBeNull();
  });

  it("identifies the repaired element by its fingerprint, with the selector as one signal among many", async () => {
    const written = await executedTarget(recordingHost());
    const fingerprint = normalizeAutomationStudioElementTarget(written, { source: "runtime" })!.fingerprint;
    const matcher = createAutomationStudioElementMatcher();

    const wanted = { candidateId: "wanted", tagName: "button", accessibleName: "Place order", visibleText: "Place order", selector: "#place-order-v2" };
    const decoy = { candidateId: "decoy", tagName: "button", accessibleName: "Cancel order", visibleText: "Cancel order", selector: "#cancel-order" };
    expect(matcher.bestCandidate(fingerprint, [decoy, wanted])?.candidateId).toBe("wanted");

    // The page renumbers its DOM and every selector changes. A repair whose
    // identity was the selector would now be pointing at nothing, or worse at
    // the decoy; this one still lands, because the name, the text and the tag
    // outweigh the selector in Core's own default weights.
    const movedWanted = { ...wanted, selector: "#checkout-submit-7f31a" };
    const movedDecoy = { ...decoy, selector: "#place-order-v2" };
    expect(matcher.bestCandidate(fingerprint, [movedDecoy, movedWanted])?.candidateId).toBe("wanted");
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
    message: "The target was not found."
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
