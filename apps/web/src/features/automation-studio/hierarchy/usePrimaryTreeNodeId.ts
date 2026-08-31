"use client";

import { useEffect, useRef } from "react";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationHierarchyNode } from "./model";
import { selectAutomationHierarchyPrimaryTreeNodeId } from "./selectors";
import type { AutomationHierarchyStore } from "./store";

export function useAutomationHierarchyPrimaryTreeNodeId(options: {
  activeViewId: string | undefined;
  nodes: AutomationHierarchyNode[];
  recordingPrimaryKind: "recording" | null;
  selection: AutomationSelection | null;
  store: AutomationHierarchyStore;
}): string | null {
  const previousActiveViewRef = useRef<{ initialized: boolean; value: string | undefined }>({
    initialized: false,
    value: options.activeViewId
  });
  const activeViewChanged = !previousActiveViewRef.current.initialized
    || previousActiveViewRef.current.value !== options.activeViewId;

  useEffect(() => {
    previousActiveViewRef.current = { initialized: true, value: options.activeViewId };
    if (!activeViewChanged) return;
    const currentPrimary = options.store.getSnapshot().primaryTreeNodeId;
    if (!currentPrimary) return;
    const validPrimary = selectAutomationHierarchyPrimaryTreeNodeId({
      nodes: options.nodes,
      primaryTreeNodeId: currentPrimary,
      selection: options.selection,
      activeViewId: options.activeViewId,
      recordingPrimaryKind: options.recordingPrimaryKind
    });
    if (!validPrimary) options.store.setPrimary(null);
  }, [
    activeViewChanged,
    options.activeViewId,
    options.nodes,
    options.recordingPrimaryKind,
    options.selection,
    options.store
  ]);

  return selectAutomationHierarchyPrimaryTreeNodeId({
    nodes: options.nodes,
    primaryTreeNodeId: options.store.getSnapshot().primaryTreeNodeId,
    selection: options.selection,
    activeViewId: activeViewChanged ? options.activeViewId : undefined,
    recordingPrimaryKind: options.recordingPrimaryKind
  });
}
