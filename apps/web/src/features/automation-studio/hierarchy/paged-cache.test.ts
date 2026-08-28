import { describe, expect, it } from "vitest";
import type { AutomationHierarchyNode } from "./model";
import {
  applyAutomationHierarchyCacheUpdates,
  applyAutomationHierarchyChildrenPage,
  automationHierarchyChildPageInfoRecord,
  automationHierarchyLoadedNodes,
  automationHierarchyPageKey,
  createAutomationHierarchyPageCache
} from "./paged-cache";

const rootFlow: AutomationHierarchyNode = { id: "flow-a", label: "Checkout", kind: "flow", category: "flow", parentId: null, viewId: "flow-router", sourceId: "flow.checkout", flowId: "flow.checkout" };
const settings: AutomationHierarchyNode = { id: "flow-a-settings", label: "Settings", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-settings", sourceId: "flow.checkout", flowId: "flow.checkout" };

describe("automation hierarchy paged cache", () => {
  it("merges child pages per parent without needing an entire project tree", () => {
    let cache = createAutomationHierarchyPageCache();
    cache = applyAutomationHierarchyChildrenPage(cache, { parentId: null, items: [rootFlow], nextCursor: "cursor.root.1", hasMore: true });
    cache = applyAutomationHierarchyChildrenPage(cache, { parentId: "flow-a", items: [settings], nextCursor: null, hasMore: false });

    expect(automationHierarchyLoadedNodes(cache)).toEqual([rootFlow, settings]);
    expect(cache.childIdsByParentKey.get(automationHierarchyPageKey(null))).toEqual(["flow-a"]);
    expect(cache.childIdsByParentKey.get(automationHierarchyPageKey("flow-a"))).toEqual(["flow-a-settings"]);
    expect(automationHierarchyChildPageInfoRecord(cache)[automationHierarchyPageKey(null)]).toMatchObject({ hasMore: true, loadedCount: 1 });
  });

  it("applies feed updates by invalidating only touched parents and subtrees", () => {
    const subflow: AutomationHierarchyNode = { id: "subflow-a", label: "Primary", kind: "subflow", category: "flow", parentId: "flow-a", viewId: "policy-primary", sourceId: "subflow.primary", flowId: "flow.checkout" };
    const nodeBoard: AutomationHierarchyNode = { id: "subflow-a-nodes", label: "Nodes", kind: "flow-object", category: "flow", parentId: "subflow-a", viewId: "policy-primary", sourceId: "flow.checkout.primary", flowId: "flow.checkout.primary" };
    let cache = createAutomationHierarchyPageCache([rootFlow, subflow, nodeBoard]);

    cache = applyAutomationHierarchyCacheUpdates(cache, [{
      sequence: 10,
      operation: "update",
      entryId: "subflow-a",
      entry: { ...subflow, label: "Primary Checkout" },
      invalidateParentEntryIds: ["flow-a"],
      invalidateSubtreeEntryIds: ["subflow-a"]
    }]);

    expect(cache.lastSequence).toBe(10);
    expect(cache.nodesById.get("subflow-a")?.label).toBe("Primary Checkout");
    expect(cache.pageInfoByParentKey.get(automationHierarchyPageKey("flow-a"))?.invalidated).toBe(true);
    expect(cache.pageInfoByParentKey.get(automationHierarchyPageKey("subflow-a"))?.invalidated).toBe(true);

    cache = applyAutomationHierarchyCacheUpdates(cache, [{ sequence: 11, operation: "delete", entryId: "subflow-a", deletedEntryIds: ["subflow-a", "subflow-a-nodes"], invalidateParentEntryIds: ["flow-a"] }]);

    expect(cache.nodesById.has("subflow-a")).toBe(false);
    expect(cache.nodesById.has("subflow-a-nodes")).toBe(false);
    expect(cache.childIdsByParentKey.get(automationHierarchyPageKey("flow-a"))).toEqual([]);
  });
});
