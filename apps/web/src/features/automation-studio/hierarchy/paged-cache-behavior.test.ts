import { describe, expect, it } from "vitest";
import type { AutomationHierarchyNode } from "./model";
import {
  applyAutomationHierarchyCacheUpdate,
  applyAutomationHierarchyCacheUpdates,
  automationHierarchyPageKey,
  createAutomationHierarchyPageCache
} from "./paged-cache";

function node(id: string, parentId: string | null, label = id): AutomationHierarchyNode {
  return { id, label, kind: parentId ? "folder" : "flow", category: "flow", parentId };
}

describe("hierarchy paged cache behavior", () => {
  it("inserts created rows into their loaded sibling page and rejects stale updates", () => {
    const root = node("flow-a", null, "Checkout");
    let cache = createAutomationHierarchyPageCache([root]);
    cache = applyAutomationHierarchyCacheUpdate(cache, {
      sequence: 2,
      operation: "create",
      entryId: "folder-b",
      entry: node("folder-b", "flow-a", "B")
    });
    cache = applyAutomationHierarchyCacheUpdate(cache, {
      sequence: 1,
      operation: "update",
      entryId: "folder-b",
      entry: node("folder-b", "flow-a", "Stale")
    });

    expect(cache.nodesById.get("folder-b")?.label).toBe("B");
    expect(cache.childIdsByParentKey.get(automationHierarchyPageKey("flow-a"))).toEqual(["folder-b"]);
    expect(cache.lastSequence).toBe(2);
  });

  it("applies a large feed batch without rebuilding the cache for every update", () => {
    let cache = createAutomationHierarchyPageCache([node("flow-a", null)]);
    const updates = Array.from({ length: 2_000 }, (_, index) => ({
      sequence: index + 1,
      operation: "create" as const,
      entryId: "child-" + index,
      entry: node("child-" + index, "flow-a")
    }));
    const startedAt = performance.now();
    cache = applyAutomationHierarchyCacheUpdates(cache, updates);
    const elapsedMs = performance.now() - startedAt;

    expect(cache.nodesById.size).toBe(2_001);
    expect(cache.childIdsByParentKey.get(automationHierarchyPageKey("flow-a"))).toHaveLength(2_000);
    expect(cache.lastSequence).toBe(2_000);
    expect(elapsedMs).toBeLessThan(500);
  });

  it("deletes deep loaded subtrees without recursive stack growth", () => {
    const nodes = Array.from({ length: 5_000 }, (_, index) =>
      node("node-" + index, index === 0 ? null : "node-" + (index - 1))
    );
    let cache = createAutomationHierarchyPageCache(nodes);
    cache = applyAutomationHierarchyCacheUpdate(cache, {
      sequence: 1,
      operation: "delete",
      entryId: "node-0"
    });

    expect(cache.nodesById.size).toBe(0);
    expect(cache.childIdsByParentKey.get(automationHierarchyPageKey(null))).toEqual([]);
    expect(cache.pageInfoByParentKey.get(automationHierarchyPageKey(null))).toMatchObject({ loadedCount: 0 });
  });
});