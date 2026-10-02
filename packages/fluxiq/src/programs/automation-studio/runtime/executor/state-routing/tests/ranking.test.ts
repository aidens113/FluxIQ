import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioRankStateRoutes } from "../index.ts";

const node = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.policy.action" });
const edge = (from: string, to: string) => ({ id: `${from}.${to}`, sourceNodeId: from, sourcePortId: "success", targetNodeId: to });

// a -> b -> c -> d -> e, with the failing node c.
const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1", flowId: "flow.rank", ownerKind: "routine", ownerId: "routine.test", name: "Rank", createdAt: 1, updatedAt: 1,
  nodes: ["a", "b", "c", "d", "e"].map(node),
  edges: [edge("a", "b"), edge("b", "c"), edge("c", "d"), edge("d", "e")]
};
const at = (id: string, closeness: number) => ({ node: flow.nodes.find((candidate) => candidate.id === id)!, closeness });

describe("which matching node a run continues at", () => {
  it("prefers the closest match first", () => {
    expect(automationStudioRankStateRoutes(flow, "c", [at("e", 0.9), at("a", 0.95)]).map((route) => route.node.id)).toEqual(["a", "e"]);
  });

  it("then a node ahead of the failing one before one behind it", () => {
    const ranked = automationStudioRankStateRoutes(flow, "c", [at("b", 0.8), at("e", 0.8)]);
    expect(ranked.map((route) => [route.node.id, route.direction, route.distance])).toEqual([["e", "forward", 2], ["b", "backward", 1]]);
  });

  it("then the nearest by edges, then document order", () => {
    expect(automationStudioRankStateRoutes(flow, "c", [at("e", 0.7), at("d", 0.7)]).map((route) => route.node.id)).toEqual(["d", "e"]);
    const island: AutomationStudioFlowDocument = { ...flow, nodes: [...flow.nodes, node("y"), node("x")] };
    const ranked = automationStudioRankStateRoutes(island, "c", [{ node: node("x"), closeness: 0.5 }, { node: node("y"), closeness: 0.5 }]);
    expect(ranked.map((route) => [route.node.id, route.direction])).toEqual([["y", "backward"], ["x", "backward"]]);
  });
});
