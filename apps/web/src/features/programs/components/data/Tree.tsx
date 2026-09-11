"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { resolveTreeFocusId } from "./resolveTreeFocusId";

export type TreeNode = {
  id: string;
  label: string;
  icon?: ReactNode;
  children?: TreeNode[];
  disabled?: boolean;
  actions?: ReactNode;
};

type FlatTreeNode = { node: TreeNode; parentId?: string };

function flattenTree(nodes: TreeNode[], expandedIds: Set<string>, parentId?: string): FlatTreeNode[] {
  const flattened: FlatTreeNode[] = [];
  nodes.forEach((node) => {
    flattened.push(parentId ? { node, parentId } : { node });
    if (node.children?.length && expandedIds.has(node.id)) flattened.push(...flattenTree(node.children, expandedIds, node.id));
  });
  return flattened;
}

export function Tree(props: {
  label: string;
  nodes: TreeNode[];
  selectedId?: string;
  expandedIds: Set<string>;
  onSelect(id: string): void;
  onToggle(id: string): void;
}) {
  const treeId = `tree-${useId().replace(/:/g, "")}`;
  const visible = flattenTree(props.nodes, props.expandedIds);
  const visibleIdKey = visible.map((item) => item.node.id).join("\u001f");
  const [focusedId, setFocusedId] = useState(props.selectedId ?? visible[0]?.node.id ?? "");
  const itemRefs = useRef<Map<string, HTMLLIElement> | null>(null);
  if (!itemRefs.current) itemRefs.current = new Map<string, HTMLLIElement>();
  const itemRefMap = itemRefs.current;

  useEffect(() => {
    if (props.selectedId) setFocusedId(props.selectedId);
  }, [props.selectedId]);
  useEffect(() => {
    const nextFocusedId = resolveTreeFocusId(visible.map((item) => item.node.id), focusedId, props.selectedId);
    if (nextFocusedId !== focusedId) setFocusedId(nextFocusedId);
  }, [focusedId, props.selectedId, visibleIdKey]);

  function focusItem(id: string) {
    setFocusedId(id);
    window.requestAnimationFrame(() => itemRefMap.get(id)?.focus());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>, node: TreeNode) {
    const index = visible.findIndex((item) => item.node.id === node.id);
    const current = visible[index];
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? visible.length - 1 : event.key === "ArrowDown" ? Math.min(visible.length - 1, index + 1) : Math.max(0, index - 1);
      const next = visible[nextIndex]?.node;
      if (next) focusItem(next.id);
    } else if (event.key === "ArrowRight" && node.children?.length) {
      event.preventDefault();
      if (!props.expandedIds.has(node.id)) props.onToggle(node.id);
      else if (node.children[0]) focusItem(node.children[0].id);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (node.children?.length && props.expandedIds.has(node.id)) props.onToggle(node.id);
      else if (current?.parentId) focusItem(current.parentId);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!node.disabled) props.onSelect(node.id);
    }
  }

  function renderNodes(nodes: TreeNode[], level: number): ReactNode {
    return nodes.map((node, index) => {
      const expandable = Boolean(node.children?.length);
      const expanded = expandable && props.expandedIds.has(node.id);
      const groupId = `${treeId}-group-${node.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      return (
        <li
          aria-disabled={node.disabled || undefined}
          aria-expanded={expandable ? expanded : undefined}
          aria-level={level}
          aria-posinset={index + 1}
          aria-selected={props.selectedId === node.id}
          aria-setsize={nodes.length}
          className={props.selectedId === node.id ? "tree-item selected" : "tree-item"}
          key={node.id}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest('[role="treeitem"]') !== event.currentTarget) return;
            if (!node.disabled) props.onSelect(node.id);
          }}
          onFocus={() => setFocusedId(node.id)}
          onKeyDown={(event) => handleKeyDown(event, node)}
          ref={(element) => { if (element) itemRefMap.set(node.id, element); else itemRefMap.delete(node.id); }}
          role="treeitem"
          tabIndex={focusedId === node.id ? 0 : -1}
        >
          <div className="tree-item-row" style={{ paddingInlineStart: `calc((${level} - 1) * var(--space-lg))` }}>
            {expandable ? <button aria-controls={groupId} aria-expanded={expanded} aria-label={expanded ? `Collapse ${node.label}` : `Expand ${node.label}`} className="tree-toggle" onClick={(event) => { event.stopPropagation(); props.onToggle(node.id); }} tabIndex={-1} type="button"><ChevronDown aria-hidden className={expanded ? "" : "collapsed"} size={14} /></button> : <span className="tree-toggle-spacer" />}
            {node.icon ? <span className="tree-icon" aria-hidden>{node.icon}</span> : null}
            <span className="tree-label">{node.label}</span>
            {node.actions ? <span className="tree-actions" onClick={(event) => event.stopPropagation()}>{node.actions}</span> : null}
          </div>
          {expanded ? <ul id={groupId} role="group">{renderNodes(node.children ?? [], level + 1)}</ul> : null}
        </li>
      );
    });
  }

  return <ul aria-label={props.label} className="tree" id={treeId} role="tree">{renderNodes(props.nodes, 1)}</ul>;
}
