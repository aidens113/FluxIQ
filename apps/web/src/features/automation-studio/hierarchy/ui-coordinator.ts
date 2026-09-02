import type { AutomationHierarchyKind } from "./contracts";
import {
  automationHierarchyUiStateEqual,
  normalizeAutomationHierarchyUiState,
  type AutomationHierarchyUiState
} from "./store";

export type AutomationHierarchyFilterState = {
  search: string;
  typeFilter: "all" | AutomationHierarchyKind;
};

export type AutomationHierarchyUiSnapshot = {
  filter: AutomationHierarchyFilterState;
  tree: AutomationHierarchyUiState;
};

export type AutomationHierarchySidebarUiState = AutomationHierarchyUiState & AutomationHierarchyFilterState;

export function normalizeAutomationHierarchySidebarUiState(
  value: Partial<AutomationHierarchySidebarUiState> | null | undefined
): AutomationHierarchySidebarUiState {
  return {
    ...normalizeAutomationHierarchyUiState(value),
    search: typeof value?.search === "string" ? value.search.slice(0, 240) : "",
    typeFilter: isAutomationHierarchyTypeFilter(value?.typeFilter) ? value.typeFilter : "all"
  };
}

export type AutomationHierarchyUiCoordinator = {
  getSnapshot(): AutomationHierarchyUiSnapshot;
  getRevision(): number;
  subscribe(listener: () => void): () => void;
  hydrate(snapshot: Partial<AutomationHierarchyUiSnapshot> | null | undefined): boolean;
  reset(): boolean;
  setFilter(filter: AutomationHierarchyFilterState): boolean;
  setTree(tree: AutomationHierarchyUiState): boolean;
  setChangeListener(listener: ((snapshot: AutomationHierarchyUiSnapshot) => void) | undefined): void;
};

const defaultSnapshot: AutomationHierarchyUiSnapshot = {
  filter: { search: "", typeFilter: "all" },
  tree: normalizeAutomationHierarchyUiState(undefined)
};

export function createAutomationHierarchyUiCoordinator(
  initial: Partial<AutomationHierarchyUiSnapshot> | null | undefined = defaultSnapshot
): AutomationHierarchyUiCoordinator {
  let snapshot = normalizeSnapshot(initial);
  let revision = 0;
  let onChange: ((snapshot: AutomationHierarchyUiSnapshot) => void) | undefined;
  const listeners = new Set<() => void>();
  const replace = (next: AutomationHierarchyUiSnapshot, publish: boolean): boolean => {
    if (snapshotEqual(snapshot, next)) return false;
    snapshot = next;
    revision += 1;
    for (const listener of listeners) listener();
    if (publish) onChange?.(snapshot);
    return true;
  };
  return {
    getSnapshot: () => snapshot,
    getRevision: () => revision,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrate(next) {
      return replace(normalizeSnapshot(next), false);
    },
    reset() {
      return replace(normalizeSnapshot(defaultSnapshot), false);
    },
    setFilter(filter) {
      return replace({ ...snapshot, filter: normalizeFilter(filter) }, true);
    },
    setTree(tree) {
      return replace({ ...snapshot, tree: normalizeAutomationHierarchyUiState(tree) }, true);
    },
    setChangeListener(listener) {
      onChange = listener;
    }
  };
}

function normalizeSnapshot(value: Partial<AutomationHierarchyUiSnapshot> | null | undefined): AutomationHierarchyUiSnapshot {
  return {
    filter: normalizeFilter(value?.filter),
    tree: normalizeAutomationHierarchyUiState(value?.tree)
  };
}

function normalizeFilter(value: Partial<AutomationHierarchyFilterState> | null | undefined): AutomationHierarchyFilterState {
  const normalized = normalizeAutomationHierarchySidebarUiState(value);
  return { search: normalized.search, typeFilter: normalized.typeFilter };
}

function isAutomationHierarchyTypeFilter(value: unknown): value is AutomationHierarchyFilterState["typeFilter"] {
  return typeof value === "string"
    && ["all", "folder", "client", "proposal", "change-proposal", "flow", "flow-object", "instruction", "adaptation", "config", "recording", "run", "task", "routine", "subflow"].includes(value);
}

function snapshotEqual(left: AutomationHierarchyUiSnapshot, right: AutomationHierarchyUiSnapshot): boolean {
  return left.filter.search === right.filter.search
    && left.filter.typeFilter === right.filter.typeFilter
    && automationHierarchyUiStateEqual(left.tree, right.tree);
}
