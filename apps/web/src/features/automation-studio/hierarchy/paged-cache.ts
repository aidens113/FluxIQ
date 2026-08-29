import type { AutomationHierarchyNode } from "./model";

export const AUTOMATION_HIERARCHY_ROOT_PAGE_KEY = "__root__";

export type AutomationHierarchyPageInfo = {
  nextCursor: string | null;
  hasMore: boolean;
  loadedCount: number;
  loading?: boolean;
  invalidated?: boolean;
  error?: string;
};

export type AutomationHierarchyChildrenPage = {
  parentId: string | null;
  items: AutomationHierarchyNode[];
  nextCursor: string | null;
  hasMore: boolean;
  append?: boolean;
};

export type AutomationHierarchyCacheUpdate = {
  sequence: number;
  operation: "create" | "update" | "delete" | "touch";
  entryId: string;
  entry?: AutomationHierarchyNode | null;
  deletedEntryIds?: string[];
  invalidateParentEntryIds?: Array<string | null>;
  invalidateSubtreeEntryIds?: string[];
};

export type AutomationHierarchyPageCache = {
  nodesById: Map<string, AutomationHierarchyNode>;
  childIdsByParentKey: Map<string, string[]>;
  pageInfoByParentKey: Map<string, AutomationHierarchyPageInfo>;
  lastSequence: number;
};

export function automationHierarchyPageKey(parentId: string | null): string {
  return parentId ?? AUTOMATION_HIERARCHY_ROOT_PAGE_KEY;
}

export function createAutomationHierarchyPageCache(nodes: AutomationHierarchyNode[] = []): AutomationHierarchyPageCache {
  const cache: AutomationHierarchyPageCache = {
    nodesById: new Map(),
    childIdsByParentKey: new Map(),
    pageInfoByParentKey: new Map(),
    lastSequence: 0
  };
  for (const node of nodes) {
    cache.nodesById.set(node.id, node);
    const key = automationHierarchyPageKey(node.parentId);
    const ids = cache.childIdsByParentKey.get(key) ?? [];
    ids.push(node.id);
    cache.childIdsByParentKey.set(key, ids);
  }
  for (const [key, ids] of cache.childIdsByParentKey) {
    const sortedIds = sortChildIds(ids, cache.nodesById);
    cache.childIdsByParentKey.set(key, sortedIds);
    cache.pageInfoByParentKey.set(key, { hasMore: false, loadedCount: sortedIds.length, nextCursor: null });
  }
  return cache;
}

export function applyAutomationHierarchyChildrenPage(cache: AutomationHierarchyPageCache, page: AutomationHierarchyChildrenPage): AutomationHierarchyPageCache {
  const next = cloneAutomationHierarchyPageCache(cache);
  const key = automationHierarchyPageKey(page.parentId);
  const previousIds = page.append ? next.childIdsByParentKey.get(key) ?? [] : [];
  const childIds = new Set(previousIds);
  for (const item of page.items) {
    next.nodesById.set(item.id, item);
    childIds.add(item.id);
  }
  const sortedIds = sortChildIds([...childIds], next.nodesById);
  next.childIdsByParentKey.set(key, sortedIds);
  next.pageInfoByParentKey.set(key, {
    hasMore: page.hasMore,
    loadedCount: sortedIds.length,
    nextCursor: page.nextCursor,
    invalidated: false
  });
  return next;
}

export function applyAutomationHierarchyCacheUpdates(cache: AutomationHierarchyPageCache, updates: AutomationHierarchyCacheUpdate[]): AutomationHierarchyPageCache {
  const next = cloneAutomationHierarchyPageCache(cache);
  const dirtyParentKeys = new Set<string>();
  for (const update of updates) applyAutomationHierarchyCacheUpdateInPlace(next, update, dirtyParentKeys);
  for (const parentKey of dirtyParentKeys) {
    const childIds = next.childIdsByParentKey.get(parentKey) ?? [];
    next.childIdsByParentKey.set(parentKey, sortChildIds(childIds, next.nodesById));
    const pageInfo = next.pageInfoByParentKey.get(parentKey);
    if (pageInfo) next.pageInfoByParentKey.set(parentKey, { ...pageInfo, loadedCount: childIds.length });
  }
  return next;
}

export function applyAutomationHierarchyCacheUpdate(cache: AutomationHierarchyPageCache, update: AutomationHierarchyCacheUpdate): AutomationHierarchyPageCache {
  const next = cloneAutomationHierarchyPageCache(cache);
  applyAutomationHierarchyCacheUpdateInPlace(next, update);
  return next;
}

function applyAutomationHierarchyCacheUpdateInPlace(
  cache: AutomationHierarchyPageCache,
  update: AutomationHierarchyCacheUpdate,
  dirtyParentKeys?: Set<string>
): void {
  if (update.sequence <= cache.lastSequence) return;
  cache.lastSequence = update.sequence;
  for (const entryId of update.deletedEntryIds ?? []) removeNode(cache, entryId);
  if (update.operation === "delete") removeNode(cache, update.entryId);
  if (update.entry) {
    const previous = cache.nodesById.get(update.entry.id);
    cache.nodesById.set(update.entry.id, update.entry);
    if (previous && previous.parentId !== update.entry.parentId) {
      removeChildId(cache, previous.parentId, update.entry.id);
    }
    const parentKey = automationHierarchyPageKey(update.entry.parentId);
    const childIds = cache.childIdsByParentKey.get(parentKey) ?? [];
    const nextChildIds = previous?.parentId === update.entry.parentId ? childIds : [...childIds, update.entry.id];
    if (dirtyParentKeys) {
      cache.childIdsByParentKey.set(parentKey, nextChildIds);
      dirtyParentKeys.add(parentKey);
    } else {
      cache.childIdsByParentKey.set(parentKey, sortChildIds(nextChildIds, cache.nodesById));
      const pageInfo = cache.pageInfoByParentKey.get(parentKey);
      if (pageInfo) {
        cache.pageInfoByParentKey.set(parentKey, { ...pageInfo, loadedCount: nextChildIds.length });
      }
    }
  }
  for (const parentId of update.invalidateParentEntryIds ?? []) markParentInvalidated(cache, parentId);
  for (const subtreeId of update.invalidateSubtreeEntryIds ?? []) markSubtreeInvalidated(cache, subtreeId);
}

export function automationHierarchyLoadedNodes(cache: AutomationHierarchyPageCache): AutomationHierarchyNode[] {
  return [...cache.nodesById.values()];
}

export function automationHierarchyChildPageInfoRecord(cache: AutomationHierarchyPageCache): Record<string, AutomationHierarchyPageInfo> {
  return Object.fromEntries(cache.pageInfoByParentKey);
}

function cloneAutomationHierarchyPageCache(cache: AutomationHierarchyPageCache): AutomationHierarchyPageCache {
  return {
    nodesById: new Map(cache.nodesById),
    childIdsByParentKey: new Map([...cache.childIdsByParentKey].map(([key, value]) => [key, [...value]])),
    pageInfoByParentKey: new Map([...cache.pageInfoByParentKey].map(([key, value]) => [key, { ...value }])),
    lastSequence: cache.lastSequence
  };
}

function removeNode(cache: AutomationHierarchyPageCache, nodeId: string): void {
  const pending = [nodeId];
  const removed = new Set<string>();
  while (pending.length) {
    const currentId = pending.pop()!;
    if (removed.has(currentId)) continue;
    removed.add(currentId);
    pending.push(...(cache.childIdsByParentKey.get(automationHierarchyPageKey(currentId)) ?? []));
  }
  for (const removedId of removed) {
    cache.nodesById.delete(removedId);
    const childKey = automationHierarchyPageKey(removedId);
    cache.childIdsByParentKey.delete(childKey);
    cache.pageInfoByParentKey.delete(childKey);
  }
  for (const [parentKey, ids] of cache.childIdsByParentKey) {
    const remaining = ids.filter((id) => !removed.has(id));
    if (remaining.length !== ids.length) {
      cache.childIdsByParentKey.set(parentKey, remaining);
      const pageInfo = cache.pageInfoByParentKey.get(parentKey);
      if (pageInfo) {
        cache.pageInfoByParentKey.set(parentKey, { ...pageInfo, loadedCount: remaining.length });
      }
    }
  }
}

function removeChildId(cache: AutomationHierarchyPageCache, parentId: string | null, childId: string): void {
  const key = automationHierarchyPageKey(parentId);
  const ids = cache.childIdsByParentKey.get(key);
  if (!ids) return;
  cache.childIdsByParentKey.set(key, ids.filter((id) => id !== childId));
}

function markParentInvalidated(cache: AutomationHierarchyPageCache, parentId: string | null): void {
  const key = automationHierarchyPageKey(parentId);
  const current = cache.pageInfoByParentKey.get(key) ?? { hasMore: false, loadedCount: cache.childIdsByParentKey.get(key)?.length ?? 0, nextCursor: null };
  cache.pageInfoByParentKey.set(key, { ...current, invalidated: true });
}

function markSubtreeInvalidated(cache: AutomationHierarchyPageCache, rootEntryId: string): void {
  const root = cache.nodesById.get(rootEntryId);
  if (!root) return;
  for (const node of cache.nodesById.values()) {
    if (node.id === rootEntryId || isDescendantOf(node, root, cache.nodesById)) markParentInvalidated(cache, node.id);
  }
}

function isDescendantOf(node: AutomationHierarchyNode, root: AutomationHierarchyNode, nodesById: Map<string, AutomationHierarchyNode>): boolean {
  let parentId = node.parentId;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    if (parentId === root.id) return true;
    seen.add(parentId);
    parentId = nodesById.get(parentId)?.parentId ?? null;
  }
  return false;
}

function sortChildIds(ids: string[], nodesById: Map<string, AutomationHierarchyNode>): string[] {
  return [...ids].sort((left, right) => {
    const leftNode = nodesById.get(left);
    const rightNode = nodesById.get(right);
    return (leftNode?.label ?? left).localeCompare(rightNode?.label ?? right) || left.localeCompare(right);
  });
}
