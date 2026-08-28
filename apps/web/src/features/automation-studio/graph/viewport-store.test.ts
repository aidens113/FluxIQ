import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { automationGraphMiniMapNodeColor, automationGraphPartitionKey, automationGraphPartitionsForViewport, createAutomationGraphViewportCoordinator, createAutomationGraphViewportStore } from "./viewport-store";

type TestNode = { label: string; metadata?: Record<string, unknown> };

function node(id: string, x: number, y: number, metadata?: Record<string, unknown>): Node<TestNode> {
  return { id, type: "policyNode", position: { x, y }, data: { label: id, ...(metadata ? { metadata } : {}) } };
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target };
}

describe("GraphViewportStore", () => {
  it("addresses viewport partitions deterministically with prefetch rings", () => {
    expect(automationGraphPartitionsForViewport("flow/one", { x: 0, y: 0, width: 100, height: 100 }, { partitionSize: 500 }).map((item) => item.key)).toEqual([
      automationGraphPartitionKey("flow/one", 0, 0),
    ]);
    expect(automationGraphPartitionsForViewport("flow/one", { x: 490, y: 0, width: 40, height: 40 }, { partitionSize: 500, prefetchRings: 1 })).toHaveLength(12);
  });

  it("keeps normalized entity identities stable across unchanged partition updates", () => {
    const store = createAutomationGraphViewportStore<TestNode>({ maxRenderedNodes: 20, maxRenderedEdges: 20 });
    const bounds = { x: 0, y: 0, width: 900, height: 900 };
    store.loadInitialViewport({ flowId: "flow", revision: "1", bounds, nodes: [node("a", 0, 0), node("b", 100, 0)], edges: [edge("a.b", "a", "b")] });
    const first = store.visibleDocument("flow", bounds);
    store.loadInitialViewport({ flowId: "flow", revision: "2", bounds, nodes: [node("a", 0, 0), node("b", 100, 0)], edges: [edge("a.b", "a", "b")] });
    const second = store.visibleDocument("flow", bounds);

    expect(second.nodes[0]).toBe(first.nodes[0]);
    expect(second.edges[0]).toBe(first.edges[0]);
  });

  it("reports loading, capped, and LRU cache density without exposing all entities", () => {
    const store = createAutomationGraphViewportStore<TestNode>({ maxPartitions: 1, maxRenderedNodes: 2, maxRenderedEdges: 2, partitionSize: 500 });
    const bounds = { x: 0, y: 0, width: 400, height: 400 };
    store.markLoading("flow", bounds);
    expect(store.visibleDocument("flow", bounds).state).toBe("loading");
    store.loadInitialViewport({ flowId: "flow", revision: "1", bounds, nodes: [node("a", 0, 0), node("b", 100, 0), node("c", 200, 0)], edges: [edge("a.b", "a", "b"), edge("b.c", "b", "c")] });
    const visible = store.visibleDocument("flow", bounds);
    expect(visible.state).toBe("capped");
    expect(visible.nodes).toHaveLength(2);
    store.loadInitialViewport({ flowId: "flow", revision: "2", bounds: { x: 600, y: 0, width: 100, height: 100 }, nodes: [node("z", 600, 0)], edges: [] });
    expect(store.stats().cachedPartitions).toBe(1);
  });

  it("cancels stale viewport requests before applying returned partitions", async () => {
    const store = createAutomationGraphViewportStore<TestNode>({ partitionSize: 500 });
    const coordinator = createAutomationGraphViewportCoordinator(store);
    const first = coordinator.loadViewport({
      flowId: "flow",
      bounds: { x: 0, y: 0, width: 400, height: 400 },
      loader: async ({ signal }) => {
        await Promise.resolve();
        if (signal.aborted) return [];
        return [{ key: automationGraphPartitionKey("flow", 0, 0), flowId: "flow", gridX: 0, gridY: 0, bounds: { x: 0, y: 0, width: 500, height: 500 }, revision: "1", nodes: [node("stale", 0, 0)], edges: [] }];
      },
    });
    const second = await coordinator.loadViewport({
      flowId: "flow",
      bounds: { x: 500, y: 0, width: 400, height: 400 },
      loader: async () => [{ key: automationGraphPartitionKey("flow", 1, 0), flowId: "flow", gridX: 1, gridY: 0, bounds: { x: 500, y: 0, width: 500, height: 500 }, revision: "2", nodes: [node("fresh", 500, 0)], edges: [] }],
    });
    await first;

    expect(second.nodes.map((item) => item.id)).toEqual(["fresh"]);
    expect(store.visibleDocument("flow", { x: 0, y: 0, width: 400, height: 400 }).nodes).toEqual([]);
  });

  it("colors MiniMap nodes by partition density metadata", () => {
    expect(automationGraphMiniMapNodeColor(node("dense", 0, 0, { partitionDensity: "dense" }))).toBe("#b35c00");
    expect(automationGraphMiniMapNodeColor(node("error", 0, 0, { partitionDensity: "error" }))).toBe("#d13212");
  });
});
