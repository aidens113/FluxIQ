export type AutomationHierarchyUiState = {
  collapsedFolderIds: string[];
  expandedDefaultCollapsedIds: string[];
  focusedTreeNodeId: string;
  primaryTreeNodeId: string | null;
};

export function automationHierarchyUiStateSignature(state: AutomationHierarchyUiState | null | undefined): string {
  if (!state) return "";
  return [
    state.collapsedFolderIds.join(","),
    state.expandedDefaultCollapsedIds.join(","),
    state.focusedTreeNodeId,
    state.primaryTreeNodeId ?? ""
  ].join("|");
}

export type AutomationHierarchyStore = {
  getSnapshot(): AutomationHierarchyUiState;
  subscribe(listener: () => void): () => void;
  setChangeListener(listener: ((state: AutomationHierarchyUiState) => void) | undefined): void;
  hydrate(state: AutomationHierarchyUiState | null | undefined): boolean;
  focus(nodeId: string): boolean;
  setPrimary(nodeId: string | null): boolean;
  toggleFolder(folderId: string, defaultCollapsed?: boolean): boolean;
  expandContainer(folderId: string, defaultCollapsed?: boolean): boolean;
  ensureVisibleFocus(visibleIds: ReadonlySet<string>): boolean;
};

const emptyHierarchyUiState: AutomationHierarchyUiState = {
  collapsedFolderIds: [],
  expandedDefaultCollapsedIds: [],
  focusedTreeNodeId: "root-flow",
  primaryTreeNodeId: null
};

export function createAutomationHierarchyStore(
  initialState: AutomationHierarchyUiState | null | undefined = emptyHierarchyUiState
): AutomationHierarchyStore {
  let snapshot = normalizeAutomationHierarchyUiState(initialState);
  let onChange: ((state: AutomationHierarchyUiState) => void) | undefined;
  const listeners = new Set<() => void>();
  const replace = (next: AutomationHierarchyUiState, publish: boolean): boolean => {
    const normalized = normalizeAutomationHierarchyUiState(next);
    if (automationHierarchyUiStateEqual(snapshot, normalized)) return false;
    snapshot = normalized;
    for (const listener of listeners) listener();
    if (publish) onChange?.(snapshot);
    return true;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setChangeListener(listener) {
      onChange = listener;
    },
    hydrate(state) {
      return state ? replace(state, false) : false;
    },
    focus(nodeId) {
      return replace({ ...snapshot, focusedTreeNodeId: nodeId }, true);
    },
    setPrimary(nodeId) {
      return replace({ ...snapshot, primaryTreeNodeId: nodeId }, true);
    },
    toggleFolder(folderId, defaultCollapsed = false) {
      if (defaultCollapsed) {
        return replace({ ...snapshot, expandedDefaultCollapsedIds: toggleString(snapshot.expandedDefaultCollapsedIds, folderId) }, true);
      }
      return replace({ ...snapshot, collapsedFolderIds: toggleString(snapshot.collapsedFolderIds, folderId) }, true);
    },
    expandContainer(folderId, defaultCollapsed = false) {
      return replace({
        ...snapshot,
        collapsedFolderIds: withoutString(snapshot.collapsedFolderIds, folderId),
        expandedDefaultCollapsedIds: defaultCollapsed
          ? withString(snapshot.expandedDefaultCollapsedIds, folderId)
          : snapshot.expandedDefaultCollapsedIds
      }, true);
    },
    ensureVisibleFocus(visibleIds) {
      if (snapshot.focusedTreeNodeId === "root-flow" || visibleIds.has(snapshot.focusedTreeNodeId)) return false;
      return replace({ ...snapshot, focusedTreeNodeId: "root-flow" }, true);
    }
  };
}

export function automationHierarchyUiStateEqual(left: AutomationHierarchyUiState, right: AutomationHierarchyUiState): boolean {
  return left.focusedTreeNodeId === right.focusedTreeNodeId
    && left.primaryTreeNodeId === right.primaryTreeNodeId
    && sameStringList(left.collapsedFolderIds, right.collapsedFolderIds)
    && sameStringList(left.expandedDefaultCollapsedIds, right.expandedDefaultCollapsedIds);
}

export function normalizeAutomationHierarchyUiState(
  state: Partial<AutomationHierarchyUiState> | null | undefined
): AutomationHierarchyUiState {
  return {
    collapsedFolderIds: uniqueStrings(state?.collapsedFolderIds ?? []),
    expandedDefaultCollapsedIds: uniqueStrings(state?.expandedDefaultCollapsedIds ?? []),
    focusedTreeNodeId: state?.focusedTreeNodeId || "root-flow",
    primaryTreeNodeId: state?.primaryTreeNodeId ?? null
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return values.length < 2 ? [...values] : [...new Set(values.filter(Boolean))].slice(0, 500);
}

function toggleString(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

function withString(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values as string[] : [...values, value];
}

function withoutString(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : values as string[];
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}