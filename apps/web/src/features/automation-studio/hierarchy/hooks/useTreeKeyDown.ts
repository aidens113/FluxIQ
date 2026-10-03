"use client";

// Keyboard navigation of the project tree: maps a key on a focused tree item
// to focus, toggle or open, using the visible rows the virtual window draws.

import { useCallback } from "react";
import type { KeyboardEvent } from "react";
import { automationHierarchyKeyboardAction } from "../keyboard";
import type { AutomationHierarchyNode } from "../model";
import type { AutomationHierarchyFlatRow } from "../virtualized-tree";

export function useAutomationHierarchyTreeKeyDown(options: {
  flatRows: AutomationHierarchyFlatRow[];
  focusRow(id: string): void;
  toggleFolder(id: string): void;
  openNode(node: AutomationHierarchyNode, mode: "preview" | "new-pane-or-focus"): void;
}) {
  const { flatRows, focusRow, toggleFolder, openNode } = options;
  return useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || (event as KeyboardEvent<HTMLElement> & { isComposing?: boolean }).isComposing
      || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    const item = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    if (!item || event.target !== item || !event.currentTarget.contains(item)) return;
    const keyboardRows = flatRows.filter((row): row is Exclude<AutomationHierarchyFlatRow, { kind: "load-more" }> => row.kind !== "load-more");
    const action = automationHierarchyKeyboardAction({
      items: keyboardRows.map((row) => ({
        id: row.id,
        parentId: row.parentId,
        expanded: row.isContainer ? !row.collapsed : null
      })),
      currentId: item.dataset.treeItemId ?? "root-flow",
      key: event.key
    });
    if (action.type === "none") return;
    event.preventDefault();
    if (action.type === "focus") focusRow(action.id);
    else if (action.type === "toggle" || action.id === "root-flow") toggleFolder(action.id);
    else {
      const row = flatRows.find((candidate) => candidate.id === action.id);
      if (row?.kind === "node") openNode(row.node, "preview");
    }
  }, [flatRows, focusRow, openNode, toggleFolder]);
}
