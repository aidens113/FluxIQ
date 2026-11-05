import { describe, expect, it } from "vitest";
import { normalizeAutomationStudioFlowBuildPlan } from "../../adaptation.ts";
import { automationStudioCandidateGraphSource } from "../candidate-graphs.ts";
import type { AutomationStudioSubflowGraph } from "../../../../../engine/automation/frames/index.ts";
import { candidateSubflowFixture } from "./subflow-fixture.ts";

function topology() {
  const { input } = candidateSubflowFixture();
  return { input, topology: normalizeAutomationStudioFlowBuildPlan({ adaptationId: "candidate", parentFlow: input.parentFlow, buildPlan: input.candidate.buildPlan, sourceInstructionIds: ["task"], now: 2 }) };
}

const PIN = { partId: "part.a", version: 2 };
const PINNED_ID = "part:part.a:v2";

/** A version as the library makes it a graph of this Flow's run (`service/project-parts/run/part-graph.ts`). */
function pinnedGraph(input: ReturnType<typeof topology>["input"], over: Record<string, unknown> = {}): AutomationStudioSubflowGraph {
  const artifact = { ...structuredClone(input.parentFlow), flowId: "graph.saved", metadata: { subflowGraph: true, parentFlowId: input.parentFlow.flowId, parentSubflowId: PINNED_ID, projectPart: PIN, ...over } };
  return { subflowId: PINNED_ID, graphRevision: 1, artifact, graph: { schemaVersion: "0.1", flowId: artifact.flowId, ownerKind: "routine", ownerId: artifact.flowId, name: "Saved", nodes: [], edges: [], createdAt: 1, updatedAt: 1 } } as unknown as AutomationStudioSubflowGraph;
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

  it("a pin reaches the library, and what comes back is the trial's own to run and to attribute", async () => {
    const fixture = topology();
    const asked: string[] = [];
    const library = {
      load: async (id: string) => {
        asked.push(id);
        return pinnedGraph(fixture.input);
      },
      pinRefusal: async () => ({ code: "part.call_cycle", message: "no" })
    };
    const source = automationStudioCandidateGraphSource(fixture.topology, fixture.input.parentFlow, async () => true, library);
    const loaded = await source.load(PINNED_ID);
    expect(loaded?.subflowId).toBe(PINNED_ID);
    expect(source.artifactFor(loaded?.artifact), "the executor's child run knows it").toBeDefined();
    expect(source.pinnedGraphs().map((graph) => graph.flowId)).toEqual(["graph.saved"]);
    expect(await source.pinRefusal?.(PIN)).toEqual({ code: "part.call_cycle", message: "no" });
    expect(asked).toEqual([PINNED_ID]);
  });

  it("a sibling's id never reaches the library, whichever way it is asked: no caller-source fallback for an id that is not a pin", async () => {
    const fixture = topology();
    const asked: string[] = [];
    const library = {
      load: async (id: string) => {
        asked.push(id);
        return pinnedGraph(fixture.input);
      }
    };
    const source = automationStudioCandidateGraphSource(fixture.topology, fixture.input.parentFlow, async () => true, library);
    expect(await source.load("subflow.someone.elses")).toBeUndefined();
    const own = fixture.topology.subflows[2]!;
    expect((await source.load(own.subflow.subflowId))?.graph.flowId, "its own sibling, from its own topology").toBe(own.graphFlow.flowId);
    expect(asked, "the library was asked nothing").toEqual([]);
  });

  it.each([["another Flow's", { parentFlowId: "flow.other" }], ["another pin's", { parentSubflowId: "part:part.a:v1" }], ["not a run's", { subflowGraph: false }], ["another version's", { projectPart: { partId: "part.a", version: 1 } }], ["no part's", { projectPart: undefined }]])("refuses %s graph the library hands back", async (_name, over) => {
    const fixture = topology();
    const source = automationStudioCandidateGraphSource(fixture.topology, fixture.input.parentFlow, async () => true, { load: async () => pinnedGraph(fixture.input, over) });
    expect(await source.load(PINNED_ID)).toBeUndefined();
    expect(source.pinnedGraphs()).toEqual([]);
  });

  it("a stale trial asks nothing, and no library means no pin", async () => {
    const fixture = topology();
    const asked: string[] = [];
    const stale = automationStudioCandidateGraphSource(fixture.topology, fixture.input.parentFlow, async () => false, {
      load: async (id) => {
        asked.push(id);
        return undefined;
      }
    });
    expect(await stale.load(PINNED_ID)).toBeUndefined();
    expect(asked).toEqual([]);
    expect(await automationStudioCandidateGraphSource(fixture.topology, fixture.input.parentFlow, async () => true).load(PINNED_ID)).toBeUndefined();
  });
});
