"use client";

import { useEffect } from "react";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationHierarchyNode } from "./model";
import { automationHierarchyAncestorContainersForSelection } from "./selectors";
import type { AutomationHierarchyStore } from "./store";

export function useSelectionDisclosure(
  nodes: AutomationHierarchyNode[],
  selection: AutomationSelection | null,
  activeViewId: string | undefined,
  store: AutomationHierarchyStore
): void {
  useEffect(() => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    for (const containerId of automationHierarchyAncestorContainersForSelection(nodes, selection, activeViewId)) {
      store.expandContainer(containerId, nodeById.get(containerId)?.metadata?.defaultCollapsed === true);
    }
  }, [activeViewId, nodes, selection, store]);
}
