import type { AutomationHierarchyNode } from "./contracts";
import type { AutomationHierarchyIndex } from "./indexing";
import { automationHierarchyPageKey, type AutomationHierarchyPageInfo } from "./paged-cache";

export const AUTOMATION_HIERARCHY_ROW_HEIGHT = 48;
export const AUTOMATION_HIERARCHY_OVERSCAN_ROWS = 5;
export const AUTOMATION_HIERARCHY_DEFAULT_VIEWPORT_HEIGHT = 480;

export type AutomationHierarchyFlatNodeRow = {
  kind: "node";
  id: string;
  node: AutomationHierarchyNode;
  level: number;
  parentId: string;
  positionInSet: number;
  setSize: number;
  isContainer: boolean;
  collapsed: boolean;
};

export type AutomationHierarchyFlatRootRow = {
  kind: "root";
  id: "root-flow";
  level: 1;
  parentId: null;
  positionInSet: 1;
  setSize: 1;
  isContainer: true;
  collapsed: boolean;
};

export type AutomationHierarchyFlatLoadMoreRow = {
  kind: "load-more";
  id: string;
  level: number;
  parentId: string | null;
  pageInfo: AutomationHierarchyPageInfo;
};

export type AutomationHierarchyFlatRow =
  | AutomationHierarchyFlatRootRow
  | AutomationHierarchyFlatNodeRow
  | AutomationHierarchyFlatLoadMoreRow;

export function flattenVisibleAutomationHierarchy(input: {
  index: AutomationHierarchyIndex;
  rootNodes: readonly AutomationHierarchyNode[];
  visibleIds: ReadonlySet<string>;
  collapsedFolderIds: readonly string[];
  rootCollapsed: boolean;
  pageInfo?: Record<string, AutomationHierarchyPageInfo>;
}): AutomationHierarchyFlatRow[] {
  const collapsed = new Set(input.collapsedFolderIds);
  const rows: AutomationHierarchyFlatRow[] = [{
    kind: "root",
    id: "root-flow",
    level: 1,
    parentId: null,
    positionInSet: 1,
    setSize: 1,
    isContainer: true,
    collapsed: input.rootCollapsed
  }];
  if (input.rootCollapsed) return rows;

  const appendChildren = (nodes: readonly AutomationHierarchyNode[], parentId: string | null, level: number) => {
    const visible = nodes.filter((node) => input.visibleIds.has(node.id));
    visible.forEach((node, index) => {
      const children = (input.index.childrenByParentId.get(node.id) ?? [])
        .filter((child) => input.visibleIds.has(child.id));
      const isContainer = node.kind === "folder" || children.length > 0;
      const isCollapsed = collapsed.has(node.id);
      rows.push({
        kind: "node",
        id: node.id,
        node,
        level,
        parentId: parentId ?? "root-flow",
        positionInSet: index + 1,
        setSize: visible.length,
        isContainer,
        collapsed: isCollapsed
      });
      if (!isCollapsed) {
        if (children.length) appendChildren(children, node.id, level + 1);
        appendLoadMore(node.id, level + 1);
      }
    });
    appendLoadMore(parentId, level);
  };

  const appendedPageRows = new Set<string>();
  const appendLoadMore = (parentId: string | null, level: number) => {
    const pageKey = automationHierarchyPageKey(parentId);
    if (appendedPageRows.has(pageKey)) return;
    const pageInfo = input.pageInfo?.[pageKey];
    if (!pageInfo || (!pageInfo.hasMore && !pageInfo.invalidated)) return;
    appendedPageRows.add(pageKey);
    rows.push({ kind: "load-more", id: `load-more:${pageKey}`, level, parentId, pageInfo });
  };

  appendChildren(input.rootNodes, null, 2);
  return rows;
}

export type AutomationHierarchyVirtualWindow = {
  start: number;
  end: number;
  totalHeight: number;
  rows: readonly { row: AutomationHierarchyFlatRow; index: number; top: number }[];
};

export function selectAutomationHierarchyVirtualWindow(input: {
  rows: readonly AutomationHierarchyFlatRow[];
  scrollTop: number;
  viewportHeight: number;
  rowHeight?: number;
  overscan?: number;
}): AutomationHierarchyVirtualWindow {
  const rowHeight = input.rowHeight ?? AUTOMATION_HIERARCHY_ROW_HEIGHT;
  const overscan = input.overscan ?? AUTOMATION_HIERARCHY_OVERSCAN_ROWS;
  const viewportHeight = Math.max(rowHeight, input.viewportHeight);
  const visibleStart = Math.floor(Math.max(0, input.scrollTop) / rowHeight);
  const visibleEnd = Math.ceil((Math.max(0, input.scrollTop) + viewportHeight) / rowHeight);
  const start = Math.max(0, visibleStart - overscan);
  const end = Math.min(input.rows.length, visibleEnd + overscan);
  return {
    start,
    end,
    totalHeight: input.rows.length * rowHeight,
    rows: input.rows.slice(start, end).map((row, offset) => ({
      row,
      index: start + offset,
      top: (start + offset) * rowHeight
    }))
  };
}

export function automationHierarchyRowIndex(rows: readonly AutomationHierarchyFlatRow[], id: string): number {
  return rows.findIndex((row) => row.kind !== "load-more" && row.id === id);
}
