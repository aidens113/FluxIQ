import { describe, expect, it } from "vitest";
import type { AutomationHierarchyNode } from "./contracts";
import { indexAutomationHierarchyNodes } from "./indexing";
import {
  AUTOMATION_HIERARCHY_ROW_HEIGHT,
  flattenVisibleAutomationHierarchy,
  selectAutomationHierarchyVirtualWindow
} from "./virtualized-tree";

describe("virtualized Automation hierarchy", () => {
  it("flattens thousands of visible stable IDs while bounding materialized rows", () => {
    const nodes = Array.from({ length: 5_000 }, (_, index): AutomationHierarchyNode => ({
      id: `flow-${index}`,
      label: `Flow ${String(index).padStart(5, "0")}`,
      kind: "flow",
      category: "flow",
      parentId: null,
      viewId: "flow-router",
      sourceId: `flow.${index}`,
      flowId: `flow.${index}`
    }));
    const index = indexAutomationHierarchyNodes(nodes);
    const rows = flattenVisibleAutomationHierarchy({
      index,
      rootNodes: index.childrenByParentId.get(null) ?? [],
      visibleIds: new Set(nodes.map((node) => node.id)),
      collapsedFolderIds: [],
      rootCollapsed: false
    });
    const first = selectAutomationHierarchyVirtualWindow({ rows, scrollTop: 0, viewportHeight: 480 });
    const last = selectAutomationHierarchyVirtualWindow({
      rows,
      scrollTop: rows.length * AUTOMATION_HIERARCHY_ROW_HEIGHT - 480,
      viewportHeight: 480
    });

    expect(rows).toHaveLength(5_001);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expect(first.rows.length).toBeLessThanOrEqual(22);
    expect(last.rows.length).toBeLessThanOrEqual(22);
    expect(last.rows.at(-1)?.row.id).toBe("flow-4999");
    expect(first.totalHeight).toBe(rows.length * AUTOMATION_HIERARCHY_ROW_HEIGHT);
  });

  it("preserves expansion levels and selection IDs without recursive row components", () => {
    const nodes: AutomationHierarchyNode[] = [
      { id: "flow-a", label: "Flow A", kind: "flow", category: "flow", parentId: null, viewId: "flow-router", sourceId: "flow.a", flowId: "flow.a" },
      { id: "folder-a", label: "Folder A", kind: "folder", category: "flow", parentId: "flow-a", viewId: "flow-subflows", flowId: "flow.a" },
      { id: "subflow-a", label: "Subflow A", kind: "subflow", category: "flow", parentId: "folder-a", viewId: "flow-nodes", sourceId: "subflow.a", flowId: "flow.a" }
    ];
    const index = indexAutomationHierarchyNodes(nodes);
    const base = { index, rootNodes: [nodes[0]!], visibleIds: new Set(nodes.map((node) => node.id)), rootCollapsed: false };
    const expanded = flattenVisibleAutomationHierarchy({ ...base, collapsedFolderIds: [] });
    const collapsed = flattenVisibleAutomationHierarchy({ ...base, collapsedFolderIds: ["folder-a"] });

    expect(expanded.map((row) => [row.id, row.level])).toEqual([
      ["root-flow", 1], ["flow-a", 2], ["folder-a", 3], ["subflow-a", 4]
    ]);
    expect(collapsed.map((row) => row.id)).toEqual(["root-flow", "flow-a", "folder-a"]);
  });
});
