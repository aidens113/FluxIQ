// The one source a Flow's run reads: its own Subflows first, then the library at the pin,
// and a graph runs only when it proves it is what was asked for.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact, type AutomationStudioFlowDocument, type AutomationStudioFlowSubflow } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioPinnedSubflowId, type AutomationStudioSubflowGraph } from "../../../../../engine/automation/frames/index.ts";
import { automationStudioResultCalledNodes } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioPinnedGraphIsOwned, automationStudioSubflowGraphIsOwned, automationStudioSubflowGraphSource, type AutomationStudioPinnedPartGraphs } from "../index.ts";

const FLOW = "flow.running";
const PIN = { partId: "part.a", version: 3 };
const PINNED_ID = automationStudioPinnedSubflowId(PIN);

function artifact(flowId: string, metadata: JsonObject): AutomationStudioFlowArtifact {
  return { ...createBlankAutomationStudioFlowArtifact({ flowId, projectId: "project", name: flowId, now: 1, metadata }), nodes: [{ id: `${flowId}.start`, definitionId: "builtin.control.start" }], edges: [] };
}
const asGraph = (subflowId: string, made: AutomationStudioFlowArtifact, graphRevision: number | null = 4): AutomationStudioSubflowGraph => {
  const graph: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: made.flowId, ownerKind: "routine", ownerId: made.flowId, name: made.name, nodes: made.nodes, edges: made.edges, createdAt: 1, updatedAt: 1, ...(made.metadata ? { metadata: made.metadata } : {}) };
  return { subflowId, artifact: made, graphRevision, graph };
};
const pinnedMarks = { subflowGraph: true, parentFlowId: FLOW, parentSubflowId: PINNED_ID, projectPart: PIN };
const record = (subflowId: string, graphFlowId: string) => ({ subflowId, graphFlowId, role: "utility", flowId: FLOW, projectId: "project" }) as unknown as AutomationStudioFlowSubflow;

function sourceOf(library: Partial<AutomationStudioPinnedPartGraphs> | undefined, graphs: Record<string, AutomationStudioFlowArtifact> = {}, subflows: AutomationStudioFlowSubflow[] = []) {
  const loads: string[] = [];
  const source = automationStudioSubflowGraphSource({
    subflows, parentFlowId: FLOW, representationOf: () => "subflow_graph",
    loadGraph: async (id) => graphs[id],
    ...(library ? {
      library: {
        load: async (pin) => {
          loads.push(`${pin.partId}@${pin.version}`);
          return await library.load?.(pin);
        },
        refusal: async (pin) => await library.refusal?.(pin)
      }
    } : {})
  });
  return { source, loads };
}

describe("a run's source of called graphs", () => {
  it("answers a pin from the library, reading each version once a run", async () => {
    const part = artifact("graph.source", pinnedMarks);
    const { source, loads } = sourceOf({ load: async () => asGraph(PINNED_ID, part) });
    expect((await source.load(PINNED_ID))?.artifact?.flowId).toBe("graph.source");
    await source.load(PINNED_ID);
    expect(loads).toEqual(["part.a@3"]);
  });

  it("looks in the Flow's own Subflows first", async () => {
    const own = artifact("graph.own", { subflowGraph: true, parentFlowId: FLOW, parentSubflowId: "own" });
    const { source, loads } = sourceOf({ load: async () => undefined }, { "graph.own": own }, [record("own", "graph.own")]);
    expect((await source.load("own"))?.graph.flowId).toBe("graph.own");
    expect(loads).toEqual([]);
  });

  it("answers nothing for a foreign unpinned graph, whatever the library holds", async () => {
    const part = artifact("graph.source", pinnedMarks);
    const { source, loads } = sourceOf({ load: async () => asGraph(PINNED_ID, part) });
    expect(await source.load("subflow.of.another.flow")).toBeUndefined();
    expect(loads).toEqual([]);
  });

  it("refuses a graph the library answers that does not prove it is the version pinned", async () => {
    for (const metadata of [
      { ...pinnedMarks, projectPart: { partId: "part.a", version: 2 } },
      { ...pinnedMarks, projectPart: { partId: "part.other", version: 3 } },
      { ...pinnedMarks, parentFlowId: "flow.other" },
      { ...pinnedMarks, parentSubflowId: "subflow.other" },
      { ...pinnedMarks, subflowGraph: false },
      { subflowGraph: true, parentFlowId: FLOW, parentSubflowId: PINNED_ID }
    ]) {
      const { source } = sourceOf({ load: async () => asGraph(PINNED_ID, artifact("graph.source", metadata)) });
      expect(await source.load(PINNED_ID), JSON.stringify(metadata)).toBeUndefined();
    }
  });

  it("answers nothing for a pin when it reaches no library, so the call fails with its closed code", async () => {
    expect(await sourceOf(undefined).source.load(PINNED_ID)).toBeUndefined();
  });

  it("hands on the library's stable refusal", async () => {
    const { source } = sourceOf({ refusal: async () => ({ code: "part.call_too_deep", message: "Too deep." }) });
    expect(await source.pinRefusal?.(PIN)).toEqual({ code: "part.call_too_deep", message: "Too deep." });
    expect(await sourceOf(undefined).source.pinRefusal?.(PIN)).toBeUndefined();
  });

  it("the Router's own check takes no pinned graph: a part is called, never selected", () => {
    const pinned = artifact("graph.source", pinnedMarks);
    expect(automationStudioPinnedGraphIsOwned(PIN, pinned, FLOW)).toBe(true);
    expect(automationStudioPinnedGraphIsOwned(PIN, pinned, "flow.other")).toBe(false);
    expect(automationStudioPinnedGraphIsOwned(PIN, undefined, FLOW)).toBe(false);
    expect(automationStudioSubflowGraphIsOwned({ subflowId: "selected" }, pinned, FLOW, () => "subflow_graph")).toBe(false);
  });

  it("verification reads a pinned part's nodes through the same source, at the version that ran", async () => {
    const part = artifact("graph.source", pinnedMarks);
    const { source } = sourceOf({ load: async () => asGraph(PINNED_ID, part, 4) });
    const attempts = [{ attemptId: "a1", subflowTarget: { subflowId: PINNED_ID, graphFlowId: "graph.source", graphRevision: 4 } }, { attemptId: "a2", subflowTarget: { subflowId: PINNED_ID, graphFlowId: "graph.source", graphRevision: 5 } }] as unknown as Parameters<typeof automationStudioResultCalledNodes>[0];
    const called = await automationStudioResultCalledNodes(attempts, source);
    expect([...called.keys()], "a revision that is not the one it ran at tells nothing").toEqual(["a1"]);
    expect(called.get("a1")?.map((node) => node.id)).toEqual(["graph.source.start"]);
  });
});
