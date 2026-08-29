import { useCallback, useSyncExternalStore } from "react";

export type AutomationMountedViewActivationSnapshot = Readonly<{
  activeViewId: string | null;
  activeWindow: boolean | null;
}>;

export type AutomationMountedViewActivationStore = {
  activate(windowId: string, viewId: string): boolean;
  confirm(windowId: string, viewId: string, activeWindow: boolean): void;
  getSnapshot(windowId: string): AutomationMountedViewActivationSnapshot;
  registerWindow(windowId: string, viewIds: readonly string[]): () => void;
  subscribe(windowId: string, listener: () => void): () => void;
};

type WindowEntry = {
  listeners: Set<() => void>;
  mounted: boolean;
  snapshot: AutomationMountedViewActivationSnapshot;
  viewIds: Set<string>;
};

const emptySnapshot: AutomationMountedViewActivationSnapshot = Object.freeze({
  activeViewId: null,
  activeWindow: null
});
const maximumMountedWindows = 8;

export function createAutomationMountedViewActivationStore(): AutomationMountedViewActivationStore {
  const entries = new Map<string, WindowEntry>();
  const optimisticViews = new Map<string, string>();
  let activeWindowId: string | null = null;

  const ensureEntry = (windowId: string) => {
    const existing = entries.get(windowId);
    if (existing) return existing;
    if (entries.size >= maximumMountedWindows) {
      const removable = Array.from(entries).find(([, entry]) => !entry.mounted && !entry.listeners.size)
        ?? entries.entries().next().value;
      if (removable) {
        entries.delete(removable[0]);
        optimisticViews.delete(removable[0]);
      }
    }
    const entry: WindowEntry = {
      listeners: new Set(),
      mounted: false,
      snapshot: emptySnapshot,
      viewIds: new Set()
    };
    entries.set(windowId, entry);
    return entry;
  };
  const publish = () => {
    for (const [windowId, entry] of entries) {
      const next: AutomationMountedViewActivationSnapshot = {
        activeViewId: optimisticViews.get(windowId) ?? null,
        activeWindow: activeWindowId === null || windowId === "right-sidebar"
          ? null
          : activeWindowId === windowId
      };
      if (entry.snapshot.activeViewId === next.activeViewId && entry.snapshot.activeWindow === next.activeWindow) continue;
      entry.snapshot = next;
      for (const listener of entry.listeners) listener();
    }
  };
  const prune = (windowId: string, entry: WindowEntry) => {
    if (entry.mounted || entry.listeners.size) return;
    entries.delete(windowId);
    optimisticViews.delete(windowId);
    if (activeWindowId === windowId) activeWindowId = null;
  };

  return {
    activate(windowId, viewId) {
      const entry = entries.get(windowId);
      if (!entry?.viewIds.has(viewId)) return false;
      optimisticViews.set(windowId, viewId);
      if (windowId !== "right-sidebar") activeWindowId = windowId;
      publish();
      return true;
    },
    confirm(windowId, viewId, activeWindow) {
      let changed = false;
      if (optimisticViews.get(windowId) === viewId) {
        optimisticViews.delete(windowId);
        changed = true;
      }
      if (activeWindow && activeWindowId === windowId) {
        activeWindowId = null;
        changed = true;
      }
      if (changed) publish();
    },
    getSnapshot(windowId) {
      return entries.get(windowId)?.snapshot ?? emptySnapshot;
    },
    registerWindow(windowId, viewIds) {
      const entry = ensureEntry(windowId);
      entry.mounted = true;
      entry.viewIds = new Set(viewIds);
      if (optimisticViews.has(windowId) && !entry.viewIds.has(optimisticViews.get(windowId)!)) {
        optimisticViews.delete(windowId);
        publish();
      }
      return () => {
        entry.mounted = false;
        entry.viewIds.clear();
        prune(windowId, entry);
      };
    },
    subscribe(windowId, listener) {
      const entry = ensureEntry(windowId);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
        prune(windowId, entry);
      };
    }
  };
}

export function activateAutomationMountedView(
  store: AutomationMountedViewActivationStore,
  windowId: string,
  viewId: string
): boolean {
  return store.activate(windowId, viewId);
}

export function useAutomationMountedViewActivation(
  store: AutomationMountedViewActivationStore,
  windowId: string
): AutomationMountedViewActivationSnapshot {
  const subscribe = useCallback((listener: () => void) => store.subscribe(windowId, listener), [store, windowId]);
  const getSnapshot = useCallback(() => store.getSnapshot(windowId), [store, windowId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}