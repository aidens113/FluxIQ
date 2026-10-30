// A subflow run from one of its steps (t804, `../detached-subflow-from.ts`): the
// target alone, as the root frame, from the step its key names; refused for an
// identity that names predecessors or another proposal, or a stale one.
import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { runAutomationStudioDetachedCandidate, runAutomationStudioDetachedSubflowFrom } from "../index.ts";

function fixture() {
  const parentFlow = createBlankAutomationStudioFlowArtifact({ flowId: "parent", projectId: "project", name: "Parent", now: 1 });
  const resolution = { scope: parentFlow.scope, runtimeCapabilities: [] as string[], permissions: [] as string[] };
  const constant = (key: string) => ({ key, definitionId: "builtin.data.constant", definitionVersion: "1.0.0", parameters: { value: key } });
  const nodes = [{ key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" }, constant("first"), constant("second"), constant("third")];
  const plan: AutomationStudioFlowBootstrapPlan = {
    schemaVersion: "0.1", router: { name: "route", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes,
      edges: nodes.slice(1).map((node, index) => ({ key: `next${index}`, source: { nodeKey: nodes[index]!.key, portId: "success" }, target: { nodeKey: node.key, portId: "in" } })) }]
  };
  const buildPlan = validateAutomationStudioFlowBootstrapPlan({ plan, resolution }).validated!;
  const identity = { projectId: "project", flowId: "parent", revision: 1, digest: "trusted-digest", baseDependencyDigest: "base", requirementsDigest: "requirements" };
  const input: Parameters<typeof runAutomationStudioDetachedCandidate>[0] = { parentFlow, resolution, identity,
    candidate: { revision: 1, digest: identity.digest, baseDependencyDigest: "base", buildPlan },
    currentIdentity: async () => identity, snapshots: [], sourceInstructionIds: ["instruction"], runId: "run1",
    start: { receiptId: "start", preparedAt: 1, conditionsDigest: "conditions", pageGeneration: 1, subjectStates: [] }, options: { now: () => 100 }
  };
  return { input, plan, parentFlow, resolution };
}

describe("a subflow run from a step", () => {
  it("refuses an identity that names predecessors, or another proposal, before anything runs", async () => {
    const { input, plan } = fixture();
    const target = { subflowKey: "primary", revision: 1, digest: "primary.1", subflows: plan.subflows };
    const identity = { projectId: "project", flowId: "parent", buildId: "build", briefId: "brief", planDigest: "plan", baseDependencyDigest: "base", target: { subflowKey: "primary", revision: 1, digest: "primary.1" }, predecessors: [] };
    const base = { identity, target, fromKey: "second", currentIdentity: async () => identity, parentFlow: input.parentFlow, resolution: input.resolution, snapshots: [], sourceInstructionIds: ["instruction"], runId: "run1", start: input.start, options: { now: () => 100 } };
    const ran = await runAutomationStudioDetachedSubflowFrom(base);
    expect(ran.trace?.attempts.map((attempt) => attempt.nodeId.split(".").at(-1))).toEqual(["second", "third"]);
    expect(ran).toMatchObject({ partial: true, entryPrepared: true });
    expect(await runAutomationStudioDetachedSubflowFrom({ ...base, identity: { ...identity, predecessors: [{ subflowKey: "find", revision: 1, digest: "find.1" }] } })).toMatchObject({ code: "subflow.execution_identity_mismatch", receipt: { status: "not_run" } });
    expect(await runAutomationStudioDetachedSubflowFrom({ ...base, target: { ...target, revision: 2 } })).toMatchObject({ code: "subflow.execution_identity_mismatch" });
    expect(await runAutomationStudioDetachedSubflowFrom({ ...base, currentIdentity: async () => ({ ...identity, planDigest: "plan.2" }) })).toMatchObject({ code: "candidate.execution_stale" });
    expect(await runAutomationStudioDetachedSubflowFrom({ ...base, fromKey: "absent" })).toMatchObject({ code: "candidate.from_node_unknown", receipt: { executedNodeCount: 0 } });
  });
});
