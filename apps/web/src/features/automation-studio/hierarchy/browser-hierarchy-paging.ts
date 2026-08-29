import type { AutomationHierarchyNode } from "./contracts";
import type { AutomationHierarchyPageInfo } from "./paged-cache";
import {
  AutomationHierarchySiblingPager,
  type AutomationHierarchySiblingPageLoader,
  type AutomationHierarchySiblingPagerSnapshot
} from "./sibling-pager";

export type AutomationHierarchyStaticMergeInput = {
  nodes: readonly AutomationHierarchyNode[];
  childPageInfo?: Readonly<Record<string, AutomationHierarchyPageInfo>>;
};

export type AutomationHierarchyBrowserPagingSnapshot = {
  projectId: string | null;
  nodes: readonly AutomationHierarchyNode[];
  childPageInfo: Readonly<Record<string, AutomationHierarchyPageInfo>>;
};

export class AutomationHierarchyBrowserPaging {
  private readonly pager: AutomationHierarchySiblingPager;
  private readonly unsubscribePager: () => void;
  private projectId: string | null = null;
  private generation = 0;
  private staticNodes: readonly AutomationHierarchyNode[] = [];
  private staticPageInfo: Readonly<Record<string, AutomationHierarchyPageInfo>> | undefined;
  private snapshot: AutomationHierarchyBrowserPagingSnapshot = {
    projectId: null,
    nodes: [],
    childPageInfo: {}
  };
  private readonly listeners = new Set<() => void>();

  constructor(loader: AutomationHierarchySiblingPageLoader) {
    this.pager = new AutomationHierarchySiblingPager(loader);
    this.unsubscribePager = this.pager.subscribe(() => this.publishPagerSnapshot());
  }

  getSnapshot = (): AutomationHierarchyBrowserPagingSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async activateProject(
    projectId: string | null,
    merge: AutomationHierarchyStaticMergeInput = { nodes: [] }
  ): Promise<void> {
    const changedProject = this.projectId !== projectId;
    if (changedProject) {
      this.generation += 1;
      this.projectId = projectId;
      this.staticNodes = merge.nodes;
      this.staticPageInfo = merge.childPageInfo;
      this.pager.reset(projectId, asNodeArray(merge.nodes), asPageInfoRecord(merge.childPageInfo));
    } else if (!sameStaticMerge(this.staticNodes, this.staticPageInfo, merge)) {
      this.staticNodes = merge.nodes;
      this.staticPageInfo = merge.childPageInfo;
      this.pager.setNodes(asNodeArray(merge.nodes), asPageInfoRecord(merge.childPageInfo));
    }

    if (!projectId) {
      this.publishPagerSnapshot();
      return;
    }
    const generation = this.generation;
    await this.pager.loadMore(null);
    if (generation !== this.generation) return;
  }

  setStaticMerge(merge: AutomationHierarchyStaticMergeInput): void {
    if (sameStaticMerge(this.staticNodes, this.staticPageInfo, merge)) return;
    this.staticNodes = merge.nodes;
    this.staticPageInfo = merge.childPageInfo;
    this.pager.setNodes(asNodeArray(merge.nodes), asPageInfoRecord(merge.childPageInfo));
  }

  loadMoreChildren = (parentId: string | null): Promise<void> => {
    return this.pager.loadMore(parentId);
  };

  retryChildren = (parentId: string | null): Promise<void> => {
    return this.pager.retry(parentId);
  };

  dispose(): void {
    this.generation += 1;
    this.unsubscribePager();
    this.pager.dispose();
    this.listeners.clear();
  }

  private publishPagerSnapshot(): void {
    const pagerSnapshot = this.pager.getSnapshot();
    const next = browserSnapshot(this.projectId, pagerSnapshot);
    if (browserSnapshotsEqual(this.snapshot, next)) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}

function browserSnapshot(
  projectId: string | null,
  pagerSnapshot: AutomationHierarchySiblingPagerSnapshot
): AutomationHierarchyBrowserPagingSnapshot {
  return {
    projectId,
    nodes: pagerSnapshot.nodes,
    childPageInfo: pagerSnapshot.pageInfo
  };
}

function sameStaticMerge(
  previousNodes: readonly AutomationHierarchyNode[],
  previousPageInfo: Readonly<Record<string, AutomationHierarchyPageInfo>> | undefined,
  next: AutomationHierarchyStaticMergeInput
): boolean {
  return previousNodes === next.nodes && previousPageInfo === next.childPageInfo;
}

function browserSnapshotsEqual(
  left: AutomationHierarchyBrowserPagingSnapshot,
  right: AutomationHierarchyBrowserPagingSnapshot
): boolean {
  return left.projectId === right.projectId
    && left.nodes === right.nodes
    && left.childPageInfo === right.childPageInfo;
}

function asNodeArray(nodes: readonly AutomationHierarchyNode[]): AutomationHierarchyNode[] {
  return Array.isArray(nodes) ? nodes as AutomationHierarchyNode[] : [...nodes];
}

function asPageInfoRecord(
  pageInfo: Readonly<Record<string, AutomationHierarchyPageInfo>> | undefined
): Record<string, AutomationHierarchyPageInfo> | undefined {
  return pageInfo as Record<string, AutomationHierarchyPageInfo> | undefined;
}
