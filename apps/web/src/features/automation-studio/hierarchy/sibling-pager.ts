import type { AutomationHierarchyNode } from "./contracts";
import { AUTOMATION_HIERARCHY_ROW_PAGE_SIZE } from "./bounded-rows";
import { automationHierarchyPageKey, type AutomationHierarchyPageInfo } from "./paged-cache";

export type AutomationHierarchySiblingPageResponse = {
  items?: AutomationHierarchyNode[];
  nextCursor?: string | null;
  hasMore?: boolean;
};

export type AutomationHierarchySiblingPagerSnapshot = {
  nodes: AutomationHierarchyNode[];
  pageInfo: Record<string, AutomationHierarchyPageInfo>;
};

export type AutomationHierarchySiblingPageLoader = (input: {
  projectId: string;
  parentId: string | null;
  cursor: string | null;
  limit: number;
  signal: AbortSignal;
}) => Promise<AutomationHierarchySiblingPageResponse | null>;

export class AutomationHierarchySiblingPager {
  private projectId: string | null = null;
  private generation = 0;
  private sourceNodes: AutomationHierarchyNode[] = [];
  private snapshot: AutomationHierarchySiblingPagerSnapshot = { nodes: [], pageInfo: {} };
  private readonly limits = new Map<string, number>();
  private readonly remoteNodes = new Map<string, AutomationHierarchyNode>();
  private readonly serverPageInfo = new Map<string, AutomationHierarchyPageInfo>();
  private readonly requestErrors = new Map<string, string>();
  private readonly completedRemoteKeys = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly loadPage: AutomationHierarchySiblingPageLoader) {}

  getSnapshot = (): AutomationHierarchySiblingPagerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  reset(
    projectId: string | null,
    nodes: AutomationHierarchyNode[] = [],
    pageInfo?: Record<string, AutomationHierarchyPageInfo>
  ): void {
    if (this.projectId !== projectId) {
      this.abortRequests();
      this.generation += 1;
      this.limits.clear();
      this.remoteNodes.clear();
      this.serverPageInfo.clear();
      this.requestErrors.clear();
      this.completedRemoteKeys.clear();
      this.projectId = projectId;
    }
    if (this.sourceNodes !== nodes) this.sourceNodes = nodes;
    if (pageInfo) this.replaceServerPageInfo(pageInfo);
    this.rebuild();
  }

  setNodes(
    nodes: AutomationHierarchyNode[],
    pageInfo?: Record<string, AutomationHierarchyPageInfo>
  ): void {
    if (this.sourceNodes === nodes && pageInfo === undefined) return;
    this.sourceNodes = nodes;
    if (pageInfo) this.replaceServerPageInfo(pageInfo);
    this.rebuild();
  }

  async loadMore(parentId: string | null): Promise<void> {
    const projectId = this.projectId;
    if (!projectId) return;
    const generation = this.generation;
    const key = automationHierarchyPageKey(parentId);
    if (this.controllers.has(key)) return;
    const current = this.snapshot.pageInfo[key];
    if (this.completedRemoteKeys.has(key) && current && !current.hasMore && !current.invalidated && !current.error) return;

    const controller = new AbortController();
    this.controllers.set(key, controller);
    this.requestErrors.delete(key);
    this.snapshot = {
      ...this.snapshot,
      pageInfo: {
        ...this.snapshot.pageInfo,
        [key]: {
          ...(current ?? { loadedCount: 0, hasMore: true, nextCursor: null }),
          loading: true
        }
      }
    };
    this.publish();

    try {
      const page = await this.loadPage({
        projectId,
        parentId,
        cursor: this.completedRemoteKeys.has(key) ? current?.nextCursor ?? null : null,
        limit: AUTOMATION_HIERARCHY_ROW_PAGE_SIZE,
        signal: controller.signal
      });
      if (!page || controller.signal.aborted || generation !== this.generation || projectId !== this.projectId) return;
      for (const node of page.items ?? []) this.remoteNodes.set(node.id, node);
      this.completedRemoteKeys.add(key);
      this.serverPageInfo.set(key, {
        loadedCount: 0,
        hasMore: page.hasMore ?? false,
        nextCursor: page.nextCursor ?? null
      });
      this.limits.set(
        key,
        (this.limits.get(key) ?? AUTOMATION_HIERARCHY_ROW_PAGE_SIZE)
          + AUTOMATION_HIERARCHY_ROW_PAGE_SIZE
      );
    } catch (error) {
      if (!controller.signal.aborted && generation === this.generation && projectId === this.projectId) {
        this.requestErrors.set(key, error instanceof Error ? error.message : "Unable to load hierarchy entries.");
      }
    } finally {
      if (this.controllers.get(key) === controller) {
        this.controllers.delete(key);
        this.rebuild();
      }
    }
  }

  retry(parentId: string | null): Promise<void> {
    return this.loadMore(parentId);
  }

  dispose(): void {
    this.abortRequests();
    this.listeners.clear();
  }

  private abortRequests(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }

  private replaceServerPageInfo(pageInfo: Record<string, AutomationHierarchyPageInfo>): void {
    this.serverPageInfo.clear();
    for (const [key, value] of Object.entries(pageInfo)) {
      this.completedRemoteKeys.add(key);
      this.serverPageInfo.set(key, { ...value, loading: false });
    }
  }

  private rebuild(): void {
    const allNodes = [...this.sourceNodes];
    const sourceIds = new Set(allNodes.map((node) => node.id));
    for (const node of this.remoteNodes.values()) if (!sourceIds.has(node.id)) allNodes.push(node);

    const children = new Map<string, AutomationHierarchyNode[]>();
    for (const node of allNodes) {
      const key = automationHierarchyPageKey(node.parentId);
      const siblings = children.get(key) ?? [];
      siblings.push(node);
      children.set(key, siblings);
    }
    for (const siblings of children.values()) {
      siblings.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
    }

    const visible = new Set<string>();
    const pageInfo: Record<string, AutomationHierarchyPageInfo> = {};
    const visit = (parentId: string | null) => {
      const key = automationHierarchyPageKey(parentId);
      const siblings = children.get(key) ?? [];
      const limit = this.limits.get(key) ?? AUTOMATION_HIERARCHY_ROW_PAGE_SIZE;
      const shown = siblings.slice(0, limit);
      const server = this.serverPageInfo.get(key);
      const hasLocalOverflow = siblings.length > shown.length;
      const error = this.requestErrors.get(key);
      pageInfo[key] = {
        loadedCount: shown.length,
        hasMore: server?.hasMore ?? hasLocalOverflow,
        nextCursor: server?.nextCursor ?? (hasLocalOverflow ? String(shown.at(-1)?.id ?? "") : null),
        ...(server?.invalidated ? { invalidated: true } : {}),
        ...(this.controllers.has(key) ? { loading: true } : {}),
        ...(error ? { error } : {})
      };
      for (const node of shown) {
        visible.add(node.id);
        visit(node.id);
      }
    };
    visit(null);
    const next = {
      nodes: allNodes.filter((node) => visible.has(node.id)),
      pageInfo
    };
    if (siblingPagerSnapshotsEqual(this.snapshot, next)) return;
    this.snapshot = next;
    this.publish();
  }

  private publish(): void {
    for (const listener of this.listeners) listener();
  }
}

function siblingPagerSnapshotsEqual(
  left: AutomationHierarchySiblingPagerSnapshot,
  right: AutomationHierarchySiblingPagerSnapshot
): boolean {
  if (left.nodes.length !== right.nodes.length) return false;
  for (let index = 0; index < left.nodes.length; index += 1) {
    if (left.nodes[index] !== right.nodes[index]) return false;
  }
  const leftKeys = Object.keys(left.pageInfo);
  const rightKeys = Object.keys(right.pageInfo);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    const first = left.pageInfo[key];
    const second = right.pageInfo[key];
    if (!first || !second
      || first.loadedCount !== second.loadedCount
      || first.hasMore !== second.hasMore
      || first.nextCursor !== second.nextCursor
      || first.loading !== second.loading
      || first.invalidated !== second.invalidated
      || first.error !== second.error) return false;
  }
  return true;
}
