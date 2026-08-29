"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import type { AutomationWorkspaceRenderStore } from "../render-store";
import type { AutomationWorkspacePrefs } from "../layout/contracts";

export type AutomationWorkspaceSelector<Value> = (prefs: AutomationWorkspacePrefs) => Value;
export type AutomationWorkspaceEquality<Value> = (left: Value, right: Value) => boolean;

export function useAutomationWorkspaceSelector<Value>(
  store: AutomationWorkspaceRenderStore,
  selector: AutomationWorkspaceSelector<Value>,
  equality: AutomationWorkspaceEquality<Value> = Object.is
): Value {
  const selectorRef = useRef(selector);
  const equalityRef = useRef(equality);
  selectorRef.current = selector;
  equalityRef.current = equality;
  const cache = useRef<{ revision: number; value: Value } | null>(null);
  const getSnapshot = useCallback(() => {
    const revision = store.getRevision("prefs");
    const next = selectorRef.current(store.getPrefs());
    const previous = cache.current;
    if (previous && previous.revision === revision) return previous.value;
    if (previous && equalityRef.current(previous.value, next)) {
      cache.current = { revision, value: previous.value };
      return previous.value;
    }
    cache.current = { revision, value: next };
    return next;
  }, [store]);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener, "prefs"),
    [store]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function observeAutomationWorkspaceSelector<Value>(
  store: AutomationWorkspaceRenderStore,
  selector: AutomationWorkspaceSelector<Value>,
  listener: (value: Value) => void,
  equality: AutomationWorkspaceEquality<Value> = Object.is
): () => void {
  let selected = selector(store.getPrefs());
  return store.subscribe(() => {
    const next = selector(store.getPrefs());
    if (equality(selected, next)) return;
    selected = next;
    listener(next);
  }, "prefs");
}

export function shallowAutomationWorkspaceSliceEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>
): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.is(left[key], right[key]));
}
