"use client";

import type { AutomationStudioStores } from "../stores/studio-stores";
import { useAutomationProjectResource, useAutomationProjectResourceSetter } from "../stores/use-project-data-resource";

const EMPTY_RECORD = Object.freeze({}) as Record<string, { source: any; snapshot: any; raw?: any }>;

export function useAutomationStateProjectState(stores: AutomationStudioStores) {
  const indexedStateSources = useAutomationProjectResource(stores, "indexedStateSources", EMPTY_RECORD);
  return {
    indexedStateSources,
    setIndexedStateSources: useAutomationProjectResourceSetter<Record<string, { source: any; snapshot: any; raw?: any }>>(stores, "indexedStateSources")
  };
}