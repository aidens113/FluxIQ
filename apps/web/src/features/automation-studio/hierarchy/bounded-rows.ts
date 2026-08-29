import type { AutomationHierarchyPageInfo } from "./paged-cache";

export const AUTOMATION_HIERARCHY_ROW_PAGE_SIZE = 100;

export type AutomationHierarchyRowWindow<T> = {
  rows: readonly T[];
  remaining: number;
  canLoadMore: boolean;
  loadMoreLabel: string;
  loading: boolean;
};

export function selectAutomationHierarchyRowWindow<T>(input: {
  rows: readonly T[];
  limit?: number;
  unbounded?: boolean;
  pageInfo?: AutomationHierarchyPageInfo;
}): AutomationHierarchyRowWindow<T> {
  const limit = Math.max(AUTOMATION_HIERARCHY_ROW_PAGE_SIZE, input.limit ?? AUTOMATION_HIERARCHY_ROW_PAGE_SIZE);
  if (input.pageInfo) {
    return {
      rows: input.rows,
      remaining: 0,
      canLoadMore: input.pageInfo.hasMore || Boolean(input.pageInfo.invalidated),
      loadMoreLabel: input.pageInfo.loading ? "Loading..." : input.pageInfo.invalidated ? "Refresh folder" : "Load more",
      loading: Boolean(input.pageInfo.loading)
    };
  }
  const rows = input.unbounded ? input.rows : input.rows.slice(0, limit);
  const remaining = input.rows.length - rows.length;
  return {
    rows,
    remaining,
    canLoadMore: remaining > 0,
    loadMoreLabel: "Show " + Math.min(AUTOMATION_HIERARCHY_ROW_PAGE_SIZE, remaining) + " more",
    loading: false
  };
}

export function nextAutomationHierarchyRowLimit(current: number): number {
  return current + AUTOMATION_HIERARCHY_ROW_PAGE_SIZE;
}
