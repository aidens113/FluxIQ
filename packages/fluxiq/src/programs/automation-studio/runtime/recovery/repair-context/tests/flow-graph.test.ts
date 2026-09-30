import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRouter } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_REPAIR_CONTEXT_GRAPH_LIMITS, automationStudioFlowGraphSection } from "../flow-graph.ts";

// A repair that can only see a straight line cannot author a branch and cannot
// tell that one is there. These are the three things a graph is -- nodes,
// edges, router rules -- plus where the failure sits among them.

describe("automationStudioFlowGraphSection", () => {
  it("carries the edges, which a flat step list cannot express", () => {
    const section = automationStudioFlowGraphSection({ flow: flow() });
    expect(section?.edges).toEqual([
      { edgeId: "e.1", from: "n.1", to: "n.2", fromPort: "success", toPort: "in" },
      { edgeId: "e.2", from: "n.2", to: "n.3", fromPort: "failed", toPort: "in" }
    ]);
    expect(section?.nodes).toEqual([
      { nodeId: "n.1", definitionId: "web.browser.navigate", label: "Open the store" },
      { nodeId: "n.2", definitionId: "web.dom.click" },
      { nodeId: "n.3", definitionId: "web.dom.extract_list" }
    ]);
  });

  it("carries the router's rules in their own order, with the condition that selects each one", () => {
    const section = automationStudioFlowGraphSection({ flow: flow(), routers: [router()] });
    expect(section?.routers).toEqual([{
      routerId: "router.1",
      name: "Store router",
      status: "active",
      rules: [
        { ruleId: "rule.plus", name: "Plus members", order: 1, status: "active", target: { kind: "subflow", subflowId: "sub.plus" }, condition: { signalPath: "page.url", operator: "contains", expected: "/plus" } },
        { ruleId: "rule.rest", name: "Everyone else", order: 2, status: "active", target: { kind: "subflow", subflowId: "sub.rest" } }
      ],
      fallback: { kind: "subflow", subflowId: "sub.rest" }
    }]);
  });

  it("locates the failing node among the edges either side of it", () => {
    expect(automationStudioFlowGraphSection({ flow: flow(), failedNodeId: "n.2" })?.failingNode)
      .toEqual({ nodeId: "n.2", incomingEdgeIds: ["e.1"], outgoingEdgeIds: ["e.2"] });
  });

  it("says when the failing node is not in the Flow it was shown, rather than leaving it to be noticed", () => {
    // A refuted result names the last step that stored records, and the Flow
    // may have been patched since. A repair reasoning about a node that is not
    // in the graph in front of it has to be able to tell.
    expect(automationStudioFlowGraphSection({ flow: flow(), failedNodeId: "n.gone" })?.failingNode)
      .toEqual({ nodeId: "n.gone", inFlow: false });
  });

  it("answers nothing when there is neither a Flow nor a router to describe", () => {
    expect(automationStudioFlowGraphSection({})).toBeUndefined();
    expect(automationStudioFlowGraphSection({ failedNodeId: "n.2" })).toBeUndefined();
  });

  it("bounds what it carries and reports the true counts beside it", () => {
    const limits = AUTOMATION_STUDIO_REPAIR_CONTEXT_GRAPH_LIMITS;
    const wide: AutomationStudioFlowDocument = {
      ...flow(),
      nodes: Array.from({ length: limits.maxNodes + 4 }, (_, index) => ({ id: `n.${index}`, definitionId: "web.dom.click" })),
      edges: Array.from({ length: limits.maxEdges + 5 }, (_, index) => ({ id: `e.${index}`, sourceNodeId: `n.${index}`, targetNodeId: `n.${index + 1}` }))
    };
    const section = automationStudioFlowGraphSection({ flow: wide });
    expect((section?.nodes as unknown[]).length).toBe(limits.maxNodes);
    expect(section?.nodeCount).toBe(limits.maxNodes + 4);
    expect((section?.edges as unknown[]).length).toBe(limits.maxEdges);
    expect(section?.edgeCount).toBe(limits.maxEdges + 5);
  });

  // The window is a prompt budget, not a cap on Flows: a Flow may hold far
  // more nodes than it shows. What it must not do is show the first nodes of a
  // long Subflow and none of the failure -- node thirty of the repaired
  // Subflow was invisible to its own repair.
  it("moves the window to the failing node of a long Subflow and names where it starts", () => {
    const limits = AUTOMATION_STUDIO_REPAIR_CONTEXT_GRAPH_LIMITS;
    const long: AutomationStudioFlowDocument = {
      ...flow(),
      nodes: Array.from({ length: 150 }, (_, index) => ({ id: `n.${index + 1}`, definitionId: "web.dom.click" })),
      edges: Array.from({ length: 149 }, (_, index) => ({ id: `e.${index + 1}`, sourceNodeId: `n.${index + 1}`, targetNodeId: `n.${index + 2}` }))
    };
    const section = automationStudioFlowGraphSection({ flow: long, failedNodeId: "n.30" });
    const nodeIds = (section?.nodes as Array<{ nodeId: string }>).map((node) => node.nodeId);
    const edgeIds = (section?.edges as Array<{ edgeId: string }>).map((edge) => edge.edgeId);

    expect(nodeIds).toHaveLength(limits.maxNodes);
    expect(nodeIds).toEqual(expect.arrayContaining(["n.29", "n.30", "n.31"]));
    expect(section?.firstNodePosition).toBe(Number(nodeIds[0]!.slice(2)));
    expect(section?.nodeCount).toBe(150);
    expect(edgeIds).toEqual(expect.arrayContaining(["e.29", "e.30"]));
    expect(section?.failingNode).toEqual({ nodeId: "n.30", incomingEdgeIds: ["e.29"], outgoingEdgeIds: ["e.30"] });
  });

  it("keeps the window inside the Flow when the failing node is its last", () => {
    const limits = AUTOMATION_STUDIO_REPAIR_CONTEXT_GRAPH_LIMITS;
    const long: AutomationStudioFlowDocument = {
      ...flow(),
      nodes: Array.from({ length: 100 }, (_, index) => ({ id: `n.${index + 1}`, definitionId: "web.dom.click" })),
      edges: []
    };
    const section = automationStudioFlowGraphSection({ flow: long, failedNodeId: "n.100" });
    const nodeIds = (section?.nodes as Array<{ nodeId: string }>).map((node) => node.nodeId);
    expect(nodeIds).toHaveLength(limits.maxNodes);
    expect(nodeIds.at(-1)).toBe("n.100");
    expect(section?.firstNodePosition).toBe(100 - limits.maxNodes + 1);
  });

  it("starts at the first node when the failing node is already inside the window", () => {
    const long: AutomationStudioFlowDocument = {
      ...flow(),
      nodes: Array.from({ length: 100 }, (_, index) => ({ id: `n.${index + 1}`, definitionId: "web.dom.click" })),
      edges: []
    };
    const section = automationStudioFlowGraphSection({ flow: long, failedNodeId: "n.3" });
    expect((section?.nodes as Array<{ nodeId: string }>)[0]?.nodeId).toBe("n.1");
    expect(section).not.toHaveProperty("firstNodePosition");
  });
});

function flow(): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.1",
    ownerKind: "policy",
    ownerId: "flow.1",
    name: "Store listings",
    createdAt: 1,
    updatedAt: 2,
    nodes: [
      { id: "n.1", definitionId: "web.browser.navigate", label: "Open the store" },
      { id: "n.2", definitionId: "web.dom.click" },
      { id: "n.3", definitionId: "web.dom.extract_list" }
    ],
    edges: [
      { id: "e.1", sourceNodeId: "n.1", targetNodeId: "n.2", sourcePortId: "success", targetPortId: "in" },
      { id: "e.2", sourceNodeId: "n.2", targetNodeId: "n.3", sourcePortId: "failed", targetPortId: "in" }
    ]
  };
}

function router(): AutomationStudioFlowRouter {
  return {
    schemaVersion: "0.1",
    routerId: "router.1",
    flowId: "flow.1",
    projectId: "project.1",
    name: "Store router",
    status: "active",
    createdAt: 1,
    updatedAt: 2,
    fallback: { kind: "subflow", subflowId: "sub.rest" },
    // Authored out of order on purpose: the section sorts by `order`, because
    // that is the order the router evaluates them in.
    rules: [
      { schemaVersion: "0.1", ruleId: "rule.rest", routerId: "router.1", name: "Everyone else", target: { kind: "subflow", subflowId: "sub.rest" }, order: 2, status: "active", createdAt: 1, updatedAt: 2 },
      { schemaVersion: "0.1", ruleId: "rule.plus", routerId: "router.1", name: "Plus members", target: { kind: "subflow", subflowId: "sub.plus" }, order: 1, status: "active", createdAt: 1, updatedAt: 2, condition: { signalPath: "page.url", operator: "contains", expected: "/plus" } }
    ]
  };
}
