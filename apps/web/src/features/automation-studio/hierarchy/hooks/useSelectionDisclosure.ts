"use client";

// Reveal the selection in the tree -- once per selection, not once per refresh.
//
// This used to re-expand every ancestor container of the current selection on
// every change of the `nodes` array identity, and that array is rebuilt on each
// project-data revision. So a folder the person collapsed around whatever they
// had selected reopened by itself a second or two later, with nothing they did
// to explain it. Revealing a selection is a response to the selection moving;
// it is not something the tree owes the person again every time the data is
// read.
//
// The guard is the selection itself, not the nodes. While the tree has not yet
// loaded far enough to hold the selected object, no ancestor resolves and
// nothing is recorded, so the reveal still happens on the refresh that finally
// brings the object in -- which is the one case where reacting to new nodes is
// right.

import { useEffect, useRef } from "react";
import type { AutomationSelection } from "../../shared/selection-contracts";
import type { AutomationHierarchyNode } from "../model";
import { automationHierarchyAncestorContainersForSelection } from "../selectors";
import type { AutomationHierarchyStore } from "../store";

export function useSelectionDisclosure(
  nodes: AutomationHierarchyNode[],
  selection: AutomationSelection | null,
  activeViewId: string | undefined,
  store: AutomationHierarchyStore
): void {
  const revealedRef = useRef<string | null>(null);
  useEffect(() => {
    const key = automationSelectionDisclosureKey(selection, activeViewId);
    if (revealedRef.current === key) return;
    const containers = automationHierarchyAncestorContainersForSelection(nodes, selection, activeViewId);
    if (!containers.length) return;
    revealedRef.current = key;
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    for (const containerId of containers) {
      store.expandContainer(containerId, nodeById.get(containerId)?.metadata?.defaultCollapsed === true);
    }
  }, [activeViewId, nodes, selection, store]);
}

/** What counts as "somewhere else": a different object, or the same object reached through a different view. */
export function automationSelectionDisclosureKey(
  selection: AutomationSelection | null,
  activeViewId: string | undefined
): string {
  return `${activeViewId ?? ""}\u001f${selection ? `${selection.kind}:${selection.id}` : ""}`;
}
