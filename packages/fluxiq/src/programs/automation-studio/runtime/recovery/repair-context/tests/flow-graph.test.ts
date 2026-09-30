import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRouter } from "../../../../model/index.ts";
import { automationStudioFlowGraphSection } from "../flow-graph.ts";

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

  // Nothing capped (2026-09-30, "the model sees the whole page"): every node,
  // every edge, every router and rule, every label at its full length.
  it("carries the whole graph of a long Flow, with no window and no counts in place of what was left out", () => {
    const longLabel = "Open the store and ".repeat(20);
    const long: AutomationStudioFlowDocument = {
      ...flow(),
      nodes: Array.from({ length: 150 }, (_, index) => ({ id: `n.${index + 1}`, definitionId: "web.dom.click", ...(index === 0 ? { label: longLabel } : {}) })),
      edges: Array.from({ length: 149 }, (_, index) => ({ id: `e.${index + 1}`, sourceNodeId: `n.${index + 1}`, targetNodeId: `n.${index + 2}` }))
    };
    const rules = Array.from({ length: 20 }, (_, index) => ({ ...router().rules[1]!, ruleId: `rule.${index}`, order: index + 1 }));
    const routers = Array.from({ length: 3 }, (_, index) => ({ ...router(), routerId: `router.${index}`, rules }));
    const section = automationStudioFlowGraphSection({ flow: long, routers, failedNodeId: "n.30" });

    expect((section?.nodes as unknown[]).length).toBe(150);
    expect((section?.edges as unknown[]).length).toBe(149);
    expect((section?.nodes as Array<{ label?: string }>)[0]?.label).toBe(longLabel);
    expect((section?.routers as Array<{ rules: unknown[] }>).map((entry) => entry.rules.length)).toEqual([20, 20, 20]);
    for (const key of ["nodeCount", "edgeCount", "firstNodePosition"]) expect(section).not.toHaveProperty(key);
    expect(section?.failingNode).toEqual({ nodeId: "n.30", incomingEdgeIds: ["e.29"], outgoingEdgeIds: ["e.30"] });
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
