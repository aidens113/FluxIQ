"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import type { ScopedExternalStore, StoreScope } from "./external-store";

export function useAutomationStoreSelector<State, Selection>(
  store: ScopedExternalStore<State>,
  selector: (state: State) => Selection,
  scope?: StoreScope,
  isEqual: (left: Selection, right: Selection) => boolean = Object.is
): Selection {
  const cache = useRef<{ state: State; selection: Selection } | null>(null);
  const getSnapshot = useCallback(() => {
    const state = store.getState();
    const cached = cache.current;
    if (cached?.state === state) return cached.selection;
    const selection = selector(state);
    if (cached && isEqual(cached.selection, selection)) {
      cache.current = { state, selection: cached.selection };
      return cached.selection;
    }
    cache.current = { state, selection };
    return selection;
  }, [store, selector, isEqual]);
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener, scope), [store, scope]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}