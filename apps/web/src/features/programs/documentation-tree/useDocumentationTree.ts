"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { shouldCollapseDocsFolder, type DocsTreeNode } from "../live-views/shared";
import { flattenDocumentationTree } from "./flattenDocumentationTree";

export function useDocumentationTree(root: DocsTreeNode, activePageId: string | undefined, scrollTop: number, viewportHeight: number) {
  const [choices, setChoices] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [focusedPath, setFocusedPath] = useState("");
  const priorParents = useRef<ReadonlyMap<string, string | undefined>>(new Map());
  const previousSelection = useRef<string | undefined>(undefined);
  const metadata = useMemo(() => {
    const parents = new Map<string, string | undefined>(); const folders = new Map<string, DocsTreeNode>(); let selected = "";
    const visit = (nodes: DocsTreeNode[], parent?: string) => { for (const node of nodes) { parents.set(node.path, parent); if (node.page?.id === activePageId) selected = node.path; if (node.children.length) { folders.set(node.path, node); visit(node.children, node.path); } } };
    visit(root.children); return { parents, folders, selected };
  }, [root, activePageId]);
  const selectionChanged = previousSelection.current !== activePageId;
  const expanded = useMemo(() => {
    const result = new Set<string>(); for (const [path, node] of metadata.folders) if (choices.get(path) ?? !shouldCollapseDocsFolder(node)) result.add(path);
    if (selectionChanged && metadata.selected) { let parent = metadata.parents.get(metadata.selected); while (parent) { result.add(parent); parent = metadata.parents.get(parent); } }
    return result;
  }, [choices, metadata, selectionChanged]);
  const rows = useMemo(() => flattenDocumentationTree(root, expanded), [root, expanded]);
  const positions = useMemo(() => {
    const byPath = new Map(rows.map((row, index) => [row.node.path, index])); const siblingCounts = new Map<string, number>(); const ordinal = new Map<string, number>();
    for (const row of rows) { const parent = row.parentPath ?? ""; const position = (siblingCounts.get(parent) ?? 0) + 1; siblingCounts.set(parent, position); ordinal.set(row.node.path, position); }
    return { byPath, siblingCounts, ordinal };
  }, [rows]);
  let entryPath = selectionChanged && positions.byPath.has(metadata.selected) ? metadata.selected : focusedPath;
  if (!positions.byPath.has(entryPath)) { let parent = priorParents.current.get(entryPath); while (parent && !positions.byPath.has(parent)) parent = priorParents.current.get(parent); entryPath = parent ?? (positions.byPath.has(metadata.selected) ? metadata.selected : rows[0]?.node.path ?? ""); }
  const height = viewportHeight > 0 ? viewportHeight : 420;
  const maxScroll = Math.max(0, rows.length * 34 - height); const boundedScroll = Math.min(Math.max(0, scrollTop), maxScroll);
  const start = Math.max(0, Math.floor(boundedScroll / 34) - 6); const end = Math.min(rows.length, Math.ceil((boundedScroll + height) / 34) + 6);
  const mountedIndices = rows.slice(start, end).map((_, index) => start + index); const entryIndex = positions.byPath.get(entryPath);
  if (entryIndex !== undefined && (entryIndex < start || entryIndex >= end)) mountedIndices.push(entryIndex);
  mountedIndices.sort((left, right) => left - right);
  useLayoutEffect(() => {
    priorParents.current = metadata.parents;
    if (entryPath !== focusedPath) setFocusedPath(entryPath);
    if (selectionChanged && metadata.selected) { setChoices(current => { const next = new Map(current); let parent = metadata.parents.get(metadata.selected); while (parent) { next.set(parent, true); parent = metadata.parents.get(parent); } return next; }); }
    previousSelection.current = activePageId;
  }, [activePageId, entryPath, focusedPath, metadata, selectionChanged]);
  function toggle(path: string) { if (!metadata.folders.has(path)) return; setChoices(current => new Map(current).set(path, !expanded.has(path))); }
  return { rows, expanded, entryPath, mountedIndices, positions, boundedScroll, setFocusedPath, toggle };
}
