"use client";
import { ChevronDown, ChevronRight, FileText, FolderOpen } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { DocsTreeNode } from "../live-views/shared";
import { useDocumentationTree } from "./useDocumentationTree";

export function VirtualDocumentationTree(props: { activePageId: string | undefined; root: DocsTreeNode; onSelect(pageId: string): void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0); const [viewportHeight, setViewportHeight] = useState(420);
  const model = useDocumentationTree(props.root, props.activePageId, scrollTop, viewportHeight);
  const current = useRef({ root: props.root, model }); current.current = { root: props.root, model };
  const lifetime = useRef(false); const intent = useRef(0); const frame = useRef<number | null>(null);
  function cancelFocus() { intent.current++; if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; }
  useLayoutEffect(() => { lifetime.current = true; return () => { lifetime.current = false; cancelFocus(); }; }, []);
  useLayoutEffect(() => { cancelFocus(); }, [props.root, props.activePageId]);
  useLayoutEffect(() => {
    const viewport = viewportRef.current; if (!viewport) return;
    const update = () => setViewportHeight(viewport.clientHeight || 420); update();
    const observer = new ResizeObserver(update); observer.observe(viewport); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => { const viewport = viewportRef.current; if (viewport && scrollTop !== model.boundedScroll) { viewport.scrollTop = model.boundedScroll; setScrollTop(model.boundedScroll); } }, [scrollTop, model.boundedScroll]);

  function permitted(node: HTMLElement, document: Document) { return node.isConnected && node.ownerDocument === document && !node.closest('[hidden], [inert], [aria-hidden="true"]') && node.getClientRects().length > 0; }
  function focusRow(index: number, source: HTMLButtonElement) {
    if (!lifetime.current || current.current.root !== props.root) return;
    const row = model.rows[Math.max(0, Math.min(model.rows.length - 1, index))]; const viewport = viewportRef.current;
    if (!row || !viewport || !source) return;
    const document = source.ownerDocument;
    if (document.visibilityState !== "visible" || !document.hasFocus() || document.activeElement !== source || !permitted(source, document)) return;
    cancelFocus(); const generation = intent.current; const root = props.root;
    // Keep the source mounted until the destination's current focus request finishes.
    const sourceIndex = model.positions.byPath.get(source.dataset.docPath ?? "");
    if (sourceIndex !== undefined && (sourceIndex * 34 < model.boundedScroll - 6 * 34 || sourceIndex * 34 > model.boundedScroll + viewportHeight + 6 * 34)) setScrollTop(sourceIndex * 34);
    model.setFocusedPath(row.node.path);
    frame.current = requestAnimationFrame(() => {
      if (!lifetime.current || generation !== intent.current || current.current.root !== root || viewportRef.current !== viewport || document.visibilityState !== "visible" || !document.hasFocus() || document.activeElement !== source || !permitted(source, document) || current.current.model.entryPath !== row.node.path || !current.current.model.positions.byPath.has(row.node.path)) return;
      const destination = viewport.querySelector<HTMLButtonElement>(`[data-doc-path="${CSS.escape(row.node.path)}"]`);
      if (!destination || !permitted(destination, document)) return;
      frame.current = null; destination.focus();
      const top = (current.current.model.positions.byPath.get(row.node.path) ?? 0) * 34;
      if (top < viewport.scrollTop) viewport.scrollTop = top;
      else if (top + 34 > viewport.scrollTop + (viewport.clientHeight || 420)) viewport.scrollTop = top + 34 - (viewport.clientHeight || 420);
      setScrollTop(viewport.scrollTop);
    });
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, path: string) {
    if (!lifetime.current || current.current.root !== props.root || ("isComposing" in event && event.isComposing === true) || event.nativeEvent?.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const index = model.positions.byPath.get(path); if (index === undefined) return; const row = model.rows[index]!;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); focusRow(event.key === "Home" ? 0 : event.key === "End" ? model.rows.length - 1 : index + (event.key === "ArrowUp" ? -1 : 1), event.currentTarget); }
    else if (event.key === "ArrowRight" && row.node.children.length) { event.preventDefault(); if (!model.expanded.has(path)) model.toggle(path); else focusRow(index + 1, event.currentTarget); }
    else if (event.key === "ArrowLeft") { if (row.node.children.length && model.expanded.has(path)) { event.preventDefault(); model.toggle(path); } else if (row.parentPath) { event.preventDefault(); focusRow(model.positions.byPath.get(row.parentPath) ?? index, event.currentTarget); } }
  }
  return <div aria-label="Documentation files" className="docs-file-tree docs-file-tree-virtual" onScroll={event => { if (lifetime.current && current.current.root === props.root) setScrollTop(event.currentTarget.scrollTop); }} ref={viewportRef} role="tree">
    <div style={{ height: model.rows.length * 34, position: "relative" }}>
      {model.mountedIndices.map(index => { const row = model.rows[index]!; const folder = row.node.children.length > 0; const open = folder && model.expanded.has(row.node.path); const selected = row.node.page?.id === props.activePageId;
        return <button aria-expanded={folder ? open : undefined} aria-level={row.depth + 1} aria-posinset={model.positions.ordinal.get(row.node.path)} aria-selected={folder ? undefined : selected} aria-setsize={model.positions.siblingCounts.get(row.parentPath ?? "")} className={folder ? "docs-tree-folder-label" : selected ? "docs-tree-file selected" : "docs-tree-file"} data-doc-path={row.node.path} key={row.node.path}
          onClick={() => { if (!lifetime.current || current.current.root !== props.root) return; cancelFocus(); if (folder) model.toggle(row.node.path); else if (row.node.page) props.onSelect(row.node.page.id); }} onBlur={() => { if (lifetime.current && current.current.root === props.root) cancelFocus(); }} onFocus={() => { if (lifetime.current && current.current.root === props.root) { cancelFocus(); model.setFocusedPath(row.node.path); } }} onKeyDown={event => onKeyDown(event, row.node.path)} role="treeitem" style={{ height: 34, left: 0, paddingLeft: 8 + row.depth * 16, position: "absolute", right: 0, top: index * 34 }} tabIndex={model.entryPath === row.node.path ? 0 : -1} type="button">
          {folder ? open ? <ChevronDown aria-hidden size={14} /> : <ChevronRight aria-hidden size={14} /> : <FileText aria-hidden size={14} />}{folder ? <FolderOpen aria-hidden size={15} /> : null}<span>{row.node.name}</span>
        </button>;
      })}
    </div>
  </div>;
}
