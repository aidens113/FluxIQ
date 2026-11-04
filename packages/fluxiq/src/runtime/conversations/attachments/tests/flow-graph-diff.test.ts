import { describe, expect, it } from "vitest";
import type { AutomationStudioBootstrapAdaptation } from "../../../flow-authoring/bootstrap/index.ts";
import { AUTOMATION_STUDIO_FLOW_GRAPH_DIFF_ATTACHMENT, automationStudioFlowGraphDiff, automationStudioFlowGraphDiffAttachment, type AutomationStudioFlowGraphDiffReads } from "../flow-graph-diff.ts";
import { automationStudioConversationAttachmentResolver } from "../resolver.ts";

const PROJECT = "project.one";
const node = (id: string, label: string, parameterValues: Record<string, unknown> = {}, position = { x: 0, y: 0 }) => ({ id, definitionId: "builtin.policy.action", label, parameterValues, position });
const edge = (id: string, sourceNodeId: string, targetNodeId: string) => ({ id, sourceNodeId, targetNodeId, sourcePortId: "success", targetPortId: "in" });

function proposal(fields: { status?: string; existingGraph?: string; nodeIdByKey?: Record<string, string>; parts: Array<{ name: string; graph: { flowId: string; nodes: unknown[]; edges: unknown[] } }> }): AutomationStudioBootstrapAdaptation {
  return {
    status: fields.status ?? "proposed",
    ...(fields.existingGraph ? { existingIds: { graphFlowId: fields.existingGraph, nodeIdByKey: fields.nodeIdByKey ?? {} } } : {}),
    topology: { subflows: fields.parts.map((part) => ({ subflow: { name: part.name }, graphFlow: part.graph })) }
  } as unknown as AutomationStudioBootstrapAdaptation;
}

function reads(adaptation: AutomationStudioBootstrapAdaptation | null, current: { nodes: unknown[]; edges: unknown[] } = { nodes: [], edges: [] }) {
  const asked: string[][] = [];
  const port: AutomationStudioFlowGraphDiffReads = {
    getFlowBootstrapAdaptation: async (projectId, flowId, adaptationId) => {
      asked.push([projectId, flowId, adaptationId]);
      return adaptation;
    },
    getFlow: async () => current as Awaited<ReturnType<AutomationStudioFlowGraphDiffReads["getFlow"]>>
  };
  return { port, asked };
}

describe("a proposed change, as what it does to the steps", () => {
  it("reads the proposal the reference names, and says what an edit added, changed and removed", async () => {
    const before = { nodes: [node("a", "Open the page"), node("b", "Press search", { text: "kettle" }, { x: 1, y: 1 }), node("gone", "Close the banner")], edges: [edge("e1", "a", "b"), edge("e2", "b", "gone")] };
    const adaptation = proposal({ existingGraph: "graph.main", parts: [{ name: "Primary", graph: { flowId: "graph.main", nodes: [node("a", "Open the page", {}, { x: 9, y: 9 }), node("b", "Press search", { text: "teapot" }), node("new", "Read the list")], edges: [edge("e1", "a", "b"), edge("e3", "b", "new")] } }] });
    const { port, asked } = reads(adaptation, before);
    const { ref } = automationStudioFlowGraphDiffAttachment("flow.kettle", "adaptation.bootstrap.1");
    const diff = await automationStudioFlowGraphDiff(port, PROJECT, ref);
    expect(asked).toEqual([[PROJECT, "flow.kettle", "adaptation.bootstrap.1"]]);
    expect(diff.flowId).toBeNull();
    expect(diff.added).toEqual([{ id: "new", label: "Read the list", detail: null }, { id: "e3", label: "Press search to Read the list", detail: "Connection" }]);
    expect(diff.changed).toEqual([{ id: "b", label: "Press search", detail: null }]);
    expect(diff.removed).toEqual([{ id: "gone", label: "Close the banner", detail: null }, { id: "e2", label: "Press search to Close the banner", detail: "Connection" }]);
    expect(JSON.stringify(diff)).not.toContain("builtin.");
  });

  it("names the part when a proposal has several, and reads no earlier graph for a new part", async () => {
    const adaptation = proposal({ parts: [
      { name: "Search", graph: { flowId: "graph.one", nodes: [node("a", "Open the page")], edges: [] } },
      { name: "Read", graph: { flowId: "graph.two", nodes: [node("b", "Read the list")], edges: [] } }
    ] });
    const diff = await automationStudioFlowGraphDiff(reads(adaptation, { nodes: [node("never", "Never read")], edges: [] }).port, PROJECT, "flow.kettle:adaptation.1");
    expect(diff.added.map((entry) => entry.label)).toEqual(["Search: Open the page", "Read: Read the list"]);
    expect(diff.removed).toEqual([]);
  });

  it("an applied proposal shows what it added, not an empty change", async () => {
    const graph = { flowId: "graph.main", nodes: [node("a", "Open the page"), node("new", "Read the list")], edges: [edge("e1", "a", "new")] };
    const adaptation = proposal({ status: "applied", existingGraph: "graph.main", nodeIdByKey: { open: "a" }, parts: [{ name: "Primary", graph }] });
    const diff = await automationStudioFlowGraphDiff(reads(adaptation, graph).port, PROJECT, "flow.kettle:adaptation.1");
    expect(diff.added.map((entry) => entry.id)).toEqual(["new", "e1"]);
    expect(diff.changed).toEqual([]);
  });

  it("counts what is past the panel's limit instead of failing its strict read", async () => {
    const nodes = Array.from({ length: 60 }, (_, index) => node(`n${index}`, `Step ${index}`));
    const diff = await automationStudioFlowGraphDiff(reads(proposal({ parts: [{ name: "Primary", graph: { flowId: "graph.main", nodes, edges: [] } }] })).port, PROJECT, "flow.kettle:adaptation.1");
    expect(diff.added).toHaveLength(50);
    expect(diff.added[49]).toEqual({ id: "more", label: "and 11 more", detail: null });
  });

  it("refuses a reference that names nothing", async () => {
    await expect(automationStudioFlowGraphDiff(reads(null).port, PROJECT, "flow.kettle:adaptation.gone")).rejects.toThrow("no longer held");
    await expect(automationStudioFlowGraphDiff(reads(null).port, PROJECT, "not-a-reference")).rejects.toThrow("no longer held");
  });
});

describe("the attachment resolver", () => {
  const input = (kind: string, ref: string) => ({ projectId: PROJECT, conversationId: "conversation.one", turnId: "turn.one", attachment: { kind, ref } });

  it("serves a graph diff and a panel result, and refuses a kind with nothing behind it", async () => {
    const adaptation = proposal({ parts: [{ name: "Primary", graph: { flowId: "graph.main", nodes: [node("a", "Open the page")], edges: [] } }] });
    const resolve = automationStudioConversationAttachmentResolver(reads(adaptation).port);
    expect(await resolve(input(AUTOMATION_STUDIO_FLOW_GRAPH_DIFF_ATTACHMENT, "flow.kettle:adaptation.1"))).toMatchObject({ added: [{ id: "a" }] });
    expect(await resolve(input("panel-capability-result", "flow.improve"))).toEqual({ capabilityId: "flow.improve" });
    await expect(resolve(input("screenshot", "shot.1"))).rejects.toThrow("cannot serve a conversation attachment of kind screenshot");
  });
});
