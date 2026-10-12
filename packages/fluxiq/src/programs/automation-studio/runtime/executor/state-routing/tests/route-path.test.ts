import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { automationStudioStateRouteOnward, automationStudioStateRouteSpan } from "../index.ts";

const edge = (from: string, to: string) => ({ id: `${from}.${to}`, sourceNodeId: from, sourcePortId: "success", targetNodeId: to });
const flowOf = (ids: string[], edges: AutomationStudioFlowDocument["edges"]): AutomationStudioFlowDocument => ({
  schemaVersion: "0.1", flowId: "flow.path", ownerKind: "routine", ownerId: "routine.test", name: "Path", createdAt: 1, updatedAt: 1,
  nodes: ids.map((id) => ({ id, definitionId: "builtin.policy.action" })), edges
});

describe("the paths a state route spans", () => {
  // a -> b -> d, a -> c -> d, d -> e; x stands apart.
  const flow = flowOf(["a", "b", "c", "d", "e", "x"], [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d"), edge("d", "e")]);

  it("spans every node on some path between the two, both included", () => {
    expect([...automationStudioStateRouteSpan(flow, "a", "d")].sort()).toEqual(["a", "b", "c", "d"]);
    expect([...automationStudioStateRouteSpan(flow, "b", "e")].sort()).toEqual(["b", "d", "e"]);
  });

  it("spans nothing when the second cannot be reached from the first", () => {
    expect(automationStudioStateRouteSpan(flow, "d", "a").size).toBe(0);
    expect(automationStudioStateRouteSpan(flow, "a", "x").size).toBe(0);
  });

  it("goes on from a node to everything reachable after it, the node included", () => {
    expect([...automationStudioStateRouteOnward(flow, "c")].sort()).toEqual(["c", "d", "e"]);
    expect([...automationStudioStateRouteOnward(flow, "x")]).toEqual(["x"]);
  });
});
