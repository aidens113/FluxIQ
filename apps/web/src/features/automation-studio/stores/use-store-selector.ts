"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import type { ScopedExternalStore, StoreScope } from "./external-store";

export type AutomationStoreSelectorSnapshotCache<State, Selection> = {
  state: State;
  selector: (state: State) => Selection;
  selection: Selection;
};

export function resolveAutomationStoreSelectorSnapshot<State, Selection>(
  state: State,
  selector: (state: State) => Selection,
  isEqual: (left: Selection, right: Selection) => boolean,
  cached: AutomationStoreSelectorSnapshotCache<State, Selection> | null
): {
  cache: AutomationStoreSelectorSnapshotCache<State, Selection>;
  snapshot: Selection;
} {
  if (cached?.state === state && cached.selector === selector) {
    return { cache: cached, snapshot: cached.selection };
  }
  const selected = selector(state);
  const snapshot = cached && isEqual(cached.selection, selected) ? cached.selection : selected;
  return {
    cache: { state, selector, selection: snapshot },
    snapshot
  };
}

export function useAutomationStoreSelector<State, Selection>(
  store: ScopedExternalStore<State>,
  selector: (state: State) => Selection,
  scope?: StoreScope,
  isEqual: (left: Selection, right: Selection) => boolean = Object.is
): Selection {
  const cache = useRef<AutomationStoreSelectorSnapshotCache<State, Selection> | null>(null);
  const selectorRef = useRef(selector);
  const isEqualRef = useRef(isEqual);
  selectorRef.current = selector;
  isEqualRef.current = isEqual;
  const getSnapshot = useCallback(() => {
    const resolved = resolveAutomationStoreSelectorSnapshot(
      store.getState(),
      selectorRef.current,
      isEqualRef.current,
      cache.current
    );
    cache.current = resolved.cache;
    return resolved.snapshot;
  }, [store]);
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener, scope), [store, scope]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
