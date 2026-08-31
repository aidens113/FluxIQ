"use client";

import { useCallback, useMemo } from "react";
import {
  automationEntityCollectionSelector,
  type AutomationProjectEntityKind
} from "./project-data-store";
import type { AutomationStudioStores } from "./studio-stores";
import { useAutomationStoreSelector } from "./use-store-selector";

export type AutomationStoreSetter<Value> = (next: Value | ((current: Value) => Value)) => void;

export function useAutomationProjectResource<Value>(stores: AutomationStudioStores, key: string, fallback: Value): Value {
  const selector = useMemo(
    () => (state: ReturnType<AutomationStudioStores["projectData"]["getState"]>) =>
      state.resources.has(key) ? state.resources.get(key) as Value : fallback,
    [fallback, key]
  );
  return useAutomationStoreSelector(stores.projectData, selector, `resource:${key}`);
}

export function useAutomationProjectResourceSetter<Value>(
  stores: AutomationStudioStores,
  key: string
): AutomationStoreSetter<Value> {
  return useCallback((next) => {
    const current = stores.projectData.getState().resources.get(key) as Value;
    const value = typeof next === "function" ? (next as (current: Value) => Value)(current) : next;
    stores.projectData.setResource(key, value);
  }, [key, stores]);
}

export function useAutomationProjectEntityCollection<Value>(
  stores: AutomationStudioStores,
  kind: AutomationProjectEntityKind
): Value[] {
  const selector = useMemo(() => automationEntityCollectionSelector(kind), [kind]);
  return useAutomationStoreSelector(
    stores.projectData,
    selector,
    `entities:${kind}`
  ) as Value[];
}

export function useAutomationProjectEntityCollectionSetter<Value>(
  stores: AutomationStudioStores,
  kind: AutomationProjectEntityKind,
  identify: (value: Value, index: number) => string
): AutomationStoreSetter<Value[]> {
  return useCallback((next) => {
    const current = [...stores.projectData.getState().entities[kind].values()] as Value[];
    const value = typeof next === "function" ? next(current) : next;
    stores.projectData.replaceAll(kind, value.map((item, index) => [identify(item, index), item] as const));
  }, [identify, kind, stores]);
}
