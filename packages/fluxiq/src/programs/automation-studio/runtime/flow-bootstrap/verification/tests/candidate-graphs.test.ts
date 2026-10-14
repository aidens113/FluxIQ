import { describe, expect, it } from "vitest";
import { normalizeAutomationStudioFlowBuildPlan } from "../../adaptation.ts";
import { automationStudioCandidateGraphSource } from "../candidate-graphs.ts";
import { candidateSubflowFixture } from "./subflow-fixture.ts";

function topology() {
  const { input } = candidateSubflowFixture();
  return { input, topology: normalizeAutomationStudioFlowBuildPlan({ adaptationId: "candidate", parentFlow: input.parentFlow, buildPlan: input.candidate.buildPlan, sourceInstructionIds: ["task"], now: 2 }) };
}

describe("candidate-only sibling source", () => {
  it("clones its owner, definitions and interfaces and does not lend mutable definitions between calls", async () => {
    const fixture = topology();
    const leaf = fixture.topology.subflows[2]!;
    const id = leaf.subflow.subflowId;
    const source = automationStudioCandidateGraphSource(fixture.topology, fixture.input.parentFlow, async () => true);
    fixture.input.parentFlow.projectId = "changed";
    leaf.graphFlow.nodes.length = 0;
    const first = await source.load(id);
    expect(first?.graph.nodes).toHaveLength(2);
    expect(first?.artifact?.interface.inputs[0]?.id).toBe("item");
    first!.graph.nodes.length = 0;
    expect((await source.load(id))?.graph.nodes).toHaveLength(2);
    expect(await source.load("unknown")).toBeUndefined();
  });

  it("declines unowned or stale helper graphs rather than falling back", async () => {
    const fixture = topology();
    const leaf = fixture.topology.subflows[2]!;
    leaf.graphFlow.metadata!.parentFlowId = "foreign";
    expect(await automationStudioCandidateGraphSource(fixture.topology, fixture.input.parentFlow, async () => true).load(leaf.subflow.subflowId)).toBeUndefined();
    expect(await automationStudioCandidateGraphSource(fixture.topology, fixture.input.parentFlow, async () => false).load(fixture.topology.subflows[1]!.subflow.subflowId)).toBeUndefined();
  });
});
