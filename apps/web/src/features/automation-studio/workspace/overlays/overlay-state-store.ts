"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { AutomationStudioOverlayState } from "./contracts";

export type AutomationStudioOverlayKey = keyof AutomationStudioOverlayState;
export type AutomationStudioOverlayRequest<K extends AutomationStudioOverlayKey> =
  NonNullable<AutomationStudioOverlayState[K]>;
type Listener = () => void;

export type AutomationStudioOverlayStore = {
  close<K extends AutomationStudioOverlayKey>(key: K, requestId?: string): boolean;
  getRevision(key: AutomationStudioOverlayKey): number;
  getState(): AutomationStudioOverlayState;
  open<K extends AutomationStudioOverlayKey>(
    key: K,
    request: AutomationStudioOverlayRequest<K>
  ): boolean;
  replace<K extends AutomationStudioOverlayKey>(
    key: K,
    value: AutomationStudioOverlayState[K]
  ): boolean;
  reset(): readonly AutomationStudioOverlayKey[];
  subscribe(key: AutomationStudioOverlayKey, listener: Listener): () => void;
};

export function defaultAutomationStudioOverlayState(): AutomationStudioOverlayState {
  return {
    project: null,
    hierarchy: null,
    preferences: null,
    viewAdder: null,
    layoutPicker: null,
    dataInspector: null,
    inspectorDrawer: null,
    drawer: null
  };
}

export function createAutomationStudioOverlayStore(
  initial: AutomationStudioOverlayState = defaultAutomationStudioOverlayState()
): AutomationStudioOverlayStore {
  let state = { ...initial };
  const listeners = new Map<AutomationStudioOverlayKey, Set<Listener>>();
  const revisions = new Map<AutomationStudioOverlayKey, number>();

  function replace<K extends AutomationStudioOverlayKey>(
    key: K,
    value: AutomationStudioOverlayState[K]
  ): boolean {
    if (Object.is(state[key], value)) return false;
    state = { ...state, [key]: value };
    revisions.set(key, (revisions.get(key) ?? 0) + 1);
    for (const listener of listeners.get(key) ?? []) listener();
    return true;
  }

  return {
    close(key, requestId) {
      const current = state[key];
      if (!current || (requestId !== undefined && current.id !== requestId)) return false;
      return replace(key, null);
    },
    getState: () => state,
    getRevision: (key) => revisions.get(key) ?? 0,
    open: (key, request) => replace(key, request),
    replace,
    reset() {
      const closed: AutomationStudioOverlayKey[] = [];
      for (const key of Object.keys(state) as AutomationStudioOverlayKey[]) {
        if (replace(key, null)) closed.push(key);
      }
      return closed;
    },
    subscribe(key, listener) {
      const scoped = listeners.get(key) ?? new Set<Listener>();
      scoped.add(listener);
      listeners.set(key, scoped);
      return () => {
        scoped.delete(listener);
        if (!scoped.size) listeners.delete(key);
      };
    }
  };
}

export function useAutomationOverlaySelection<K extends AutomationStudioOverlayKey>(
  store: AutomationStudioOverlayStore,
  key: K
): AutomationStudioOverlayState[K] {
  const subscribe = useCallback(
    (listener: Listener) => store.subscribe(key, listener),
    [key, store]
  );
  const getSnapshot = useCallback(() => store.getState()[key], [key, store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
