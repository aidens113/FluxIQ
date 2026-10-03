"use client";

import { memo } from "react";
import type { CSSProperties } from "react";
import type { AutomationHierarchyPageInfo } from "../paged-cache";

// The paging row the virtualized tree shows after a partly loaded folder.
export const AutomationHierarchyLoadMoreRow = memo(function AutomationHierarchyLoadMoreRow(props: {
  level: number;
  parentId: string | null;
  pageInfo: AutomationHierarchyPageInfo;
  loadMoreChildren?(parentId: string | null): void;
}) {
  return <div aria-label="More project hierarchy items" aria-level={props.level} className="automation-tree-page-more-wrap" role="treeitem" style={{ paddingInlineStart: `${Math.max(0, props.level - 2) * 14}px` } as CSSProperties}>
    <button
      className="automation-tree-page-more"
      disabled={Boolean(props.pageInfo.loading)}
      onClick={() => props.loadMoreChildren?.(props.parentId)}
      type="button"
    >
      {props.pageInfo.loading ? "Loading..." : props.pageInfo.invalidated ? "Refresh folder" : "Load more"}
    </button>
  </div>;
});
