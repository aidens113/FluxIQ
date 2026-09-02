"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Circle, Copy, Download, Info, LoaderCircle, WrapText, XCircle, X } from "lucide-react";
import { fluxiqStatusLabel, fluxiqStatusTone } from "fluxiq/ui";
import Link from "next/link";
import React, { cloneElement, isValidElement, useEffect, useId, useRef, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { acquireOverlayEnvironment, type OverlayEnvironmentMode } from "./overlay-environment";
import { useInheritedOperationBusy } from "./use-operation-lock";

export type AlertTone = "info" | "success" | "warning" | "error";
type GlobalAlertPayload = {
  tone: AlertTone;
  title?: string;
  message: string;
  id?: string;
  ttlMs?: number;
  actionLabel?: string;
  onAction?: () => void;
};
type GlobalAlertItem = Required<Pick<GlobalAlertPayload, "tone" | "message">> & {
  id: string;
  title?: string;
  createdAt: number;
  ttlMs: number;
  actionLabel?: string;
  onAction?: () => void;
};

export function notifyGlobalAlert(payload: GlobalAlertPayload) {
  if (typeof window === "undefined" || !payload.message.trim()) return;
  window.dispatchEvent(new CustomEvent<GlobalAlertPayload>("fluxiq:global-alert", { detail: payload }));
}

export function Panel(props: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel workspace-panel">
      <div className="panel-heading">
        <h2 className="panel-title">{props.title}</h2>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

type FieldControlProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean; "aria-required"?: boolean };

export function Field(props: { label: string; children: ReactNode; error?: string; hint?: string; id?: string; required?: boolean }) {
  const generatedId = useId();
  const controlId = props.id ?? `field-${generatedId.replace(/:/g, "")}`;
  const hintId = props.hint ? `${controlId}-hint` : undefined;
  const errorId = props.error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const childDescribedBy = isValidElement<FieldControlProps>(props.children) ? props.children.props["aria-describedby"] : undefined;
  const mergedDescribedBy = [childDescribedBy, describedBy].filter(Boolean).join(" ");
  const controlProps: FieldControlProps = { id: isValidElement<FieldControlProps>(props.children) ? props.children.props.id ?? controlId : controlId };
  if (mergedDescribedBy) controlProps["aria-describedby"] = mergedDescribedBy;
  if (props.error) controlProps["aria-invalid"] = true;
  if (props.required) controlProps["aria-required"] = true;
  const control = isValidElement<FieldControlProps>(props.children)
    ? cloneElement(props.children as ReactElement<FieldControlProps>, controlProps)
    : props.children;
  return (
    <label className={`field${props.error ? " field-error" : ""}`} htmlFor={controlId}>
      <span className="field-label">{props.label}{props.required ? <span aria-hidden> *</span> : null}</span>
      {control}
      {props.hint ? <small className="field-message" id={hintId}>{props.hint}</small> : null}
      {props.error ? <small className="field-message error" id={errorId} role="alert"><AlertCircle size={13} aria-hidden />{props.error}</small> : null}
    </label>
  );
}

export type ButtonVariant = "secondary" | "primary" | "danger" | "ghost";
export type ButtonSize = "compact" | "default";

export function Button({ busy = false, children, className, disabled, size = "default", variant = "secondary", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; size?: ButtonSize; variant?: ButtonVariant }) {
  const classes = ["button", `button-${variant}`, size === "compact" ? "compact" : "", className ?? ""].filter(Boolean).join(" ");
  return <button {...props} aria-busy={busy || undefined} className={classes} disabled={disabled || busy} type={type}>
    {busy ? <LoaderCircle className="spin" size={14} aria-hidden /> : null}
    {children}
  </button>;
}

export function IconButton({ children, className, label, type = "button", ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title"> & { children: ReactNode; label: string }) {
  return <button {...props} aria-label={label} className={["icon-button", className ?? ""].filter(Boolean).join(" ")} title={label} type={type}>{children}</button>;
}

export function ActionLink({ children, className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} className={["action-link", className ?? ""].filter(Boolean).join(" ")}>{children}</a>;
}
export type MenuOption = {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  href?: string;
  onSelect?: () => void;
};

export function Menu(props: { label: string; options: MenuOption[]; icon?: ReactNode; iconOnly?: boolean; defaultOpen?: boolean }) {
  const menuId = `menu-${useId().replace(/:/g, "")}`;
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const [position, setPosition] = useState<{ maxHeight: number; right: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const closeMenu = (_restoreFocus = false) => {
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const panel = menuRef.current;
    const trigger = triggerRef.current?.querySelector<HTMLElement>("button") ?? null;
    if (!panel) return;
    const release = acquireOverlayEnvironment(document, {
      mode: "menu",
      panel,
      root: panel,
      returnFocus: trigger,
      additionalInsideElements: () => [triggerRef.current],
      onEscape: () => setOpen(false),
      onPointerDownOutside: () => setOpen(false),
      onViewportChange: updateMenuPosition
    });
    panel.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
    return release;
  }, [open]);

  function toggleMenu() {
    if (open) {
      closeMenu(true);
      return;
    }
    updateMenuPosition();
    setOpen(true);
  }

  function updateMenuPosition() {
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (bounds) {
      const margin = 8;
      const below = window.innerHeight - bounds.bottom - margin;
      const above = bounds.top - margin;
      const openBelow = below >= 160 || below >= above;
      const next = {
        maxHeight: Math.max(80, openBelow ? below : above),
        right: Math.max(margin, window.innerWidth - bounds.right),
        top: openBelow ? bounds.bottom + 4 : margin
      };
      setPosition((current) => current
        && current.maxHeight === next.maxHeight
        && current.right === next.right
        && current.top === next.top
        ? current
        : next);
    }
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'));
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowUp" ? (current - 1 + items.length) % items.length : (current + 1) % items.length;
    items[next]?.focus();
  }

  const popover = open ? (
    <div
      aria-label={props.label}
      className="menu-popover menu-popover-portal"
      onKeyDown={(event) => {
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          moveFocus(event);
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeMenu(true);
        }
      }}
      ref={menuRef}
      role="menu"
      id={menuId}
      style={position ? { maxHeight: position.maxHeight, right: position.right, top: position.top } : undefined}
    >
      {props.options.map((option) => option.href ? (
        <Link className={option.danger ? "danger" : undefined} href={option.href} key={option.id} onClick={() => closeMenu(true)} role="menuitem">
          {option.icon}<span>{option.label}</span>
        </Link>
      ) : (
        <button
          className={option.danger ? "danger" : undefined}
          disabled={option.disabled}
          key={option.id}
          onClick={() => {
            option.onSelect?.();
            closeMenu(true);
          }}
          role="menuitem"
          type="button"
        >
          {option.icon}<span>{option.label}</span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="menu" ref={triggerRef}>
      {props.iconOnly
        ? <IconButton aria-controls={menuId} aria-expanded={open} aria-haspopup="menu" label={props.label} onClick={toggleMenu}>{props.icon}</IconButton>
        : <Button aria-controls={menuId} aria-expanded={open} aria-haspopup="menu" aria-label={props.label} onClick={toggleMenu} size="compact" variant="secondary">
          {props.icon}<span>{props.label}</span><ChevronDown aria-hidden size={14} />
        </Button>}
      {popover && typeof document !== "undefined" ? createPortal(popover, document.body) : popover}
    </div>
  );
}

export type ComboboxOption = { value: string; label: string; description?: string };

export function Combobox(props: {
  label: string;
  options: ComboboxOption[];
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  defaultOpen?: boolean;
  loading?: boolean;
  onQueryChange?(query: string): void;
}) {
  const generatedId = useId().replace(/:/g, "");
  const inputId = `combobox-${generatedId}`;
  const listId = `${inputId}-list`;
  const hintId = props.hint ? `${inputId}-hint` : undefined;
  const errorId = props.error ? `${inputId}-error` : undefined;
  const selected = props.options.find((option) => option.value === props.value);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = props.options.filter((option) => {
    const needle = query.trim().toLowerCase();
    return !needle || option.label.toLowerCase().includes(needle) || option.description?.toLowerCase().includes(needle);
  });
  const activeOption = filtered[activeIndex];

  useEffect(() => {
    if (!open) setQuery(selected?.label ?? "");
  }, [open, selected?.label]);
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [activeIndex, filtered.length]);

  function choose(option: ComboboxOption) {
    props.onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  }

  return (
    <div className={`field combobox${props.error ? " field-error" : ""}`} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setOpen(false);
        setQuery(selected?.label ?? "");
      }
    }}>
      <label className="field-label" htmlFor={inputId}>{props.label}</label>
      <div className="combobox-input-wrap">
        <input
          aria-activedescendant={open && activeOption ? `${listId}-${activeOption.value}` : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          aria-expanded={open}
          aria-invalid={props.error ? true : undefined}
          autoComplete="off"
          disabled={props.disabled}
          id={inputId}
          onChange={(event) => {
            setQuery(event.target.value);
            props.onQueryChange?.(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => {
                const count = Math.max(filtered.length, 1);
                return event.key === "ArrowDown" ? (current + 1) % count : (current - 1 + count) % count;
              });
            } else if (event.key === "Enter" && open && activeOption) {
              event.preventDefault();
              choose(activeOption);
            } else if (event.key === "Escape") {
              setOpen(false);
              setQuery(selected?.label ?? "");
            }
          }}
          placeholder={props.placeholder}
          role="combobox"
          value={query}
        />
        <ChevronDown aria-hidden size={15} />
      </div>
      {open ? (
        <div className="combobox-listbox" id={listId} role="listbox">
          {filtered.length ? filtered.map((option) => (
            <div
              aria-selected={option.value === props.value}
              className={[
                option.value === props.value ? "selected" : "",
                option.value === activeOption?.value ? "active" : ""
              ].filter(Boolean).join(" ")}
              id={`${listId}-${option.value}`}
              key={option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
              role="option"
            >
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
            </div>
          )) : <div className="combobox-empty">{props.loading ? "Loading options..." : "No matching options."}</div>}
        </div>
      ) : null}
      {props.hint ? <small className="field-message" id={hintId}>{props.hint}</small> : null}
      {props.error ? <small className="field-message error" id={errorId} role="alert"><AlertCircle aria-hidden size={13} />{props.error}</small> : null}
    </div>
  );
}

type TooltipChildProps = { "aria-describedby"?: string };

export function Tooltip(props: { content: string; children: ReactNode }) {
  const tooltipId = `tooltip-${useId().replace(/:/g, "")}`;
  const child = isValidElement<TooltipChildProps>(props.children)
    ? cloneElement(props.children, {
      "aria-describedby": [props.children.props["aria-describedby"], tooltipId].filter(Boolean).join(" ")
    })
    : props.children;
  return <span className="tooltip-anchor">{child}<span className="tooltip-content" id={tooltipId} role="tooltip">{props.content}</span></span>;
}
export function DataTable(props: {
  columns: string[];
  rows?: Array<Array<ReactNode>>;
  rowKeys?: string[];
  empty?: string;
  label: string;
  compact?: boolean;
  loading?: boolean;
}) {
  const rows = props.rows ?? [];
  return (
    <div aria-busy={props.loading || undefined} className={`table-wrap${props.compact ? " compact" : ""}`}>
      <table aria-label={props.label} className="data-table">
        <caption className="visually-hidden">{props.label}</caption>
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th key={column} scope="col">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={props.rowKeys?.[rowIndex] ?? rowIndex}>
                {row.map((cell, index) => (
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="empty-cell" colSpan={props.columns.length}>
                {props.loading ? "Loading rows..." : props.empty ?? "No data available."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination(props: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange(page: number): void;
  onPageSizeChange?(pageSize: number): void;
  pageSizes?: number[];
  loading?: boolean;
  label?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize)));
  const page = Math.max(1, Math.min(pageCount, props.page));
  const start = props.total ? (page - 1) * props.pageSize + 1 : 0;
  const end = Math.min(props.total, page * props.pageSize);
  const sizes = props.pageSizes ?? [25, 50, 100];
  return (
    <nav aria-busy={props.loading || undefined} aria-label={props.label ?? "Pagination"} className="pagination">
      <span className="pagination-range">{start}-{end} of {props.total}</span>
      {props.onPageSizeChange ? <label className="pagination-size"><span>Rows</span><select aria-label="Rows per page" disabled={props.loading} onChange={(event) => props.onPageSizeChange?.(Number(event.target.value))} value={props.pageSize}>{sizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label> : null}
      <div className="pagination-actions">
        <IconButton disabled={props.loading || page <= 1} label="First page" onClick={() => props.onPageChange(1)}><ChevronsLeft aria-hidden size={15} /></IconButton>
        <IconButton disabled={props.loading || page <= 1} label="Previous page" onClick={() => props.onPageChange(page - 1)}><ChevronLeft aria-hidden size={15} /></IconButton>
        <span aria-live="polite">Page {page} of {pageCount}</span>
        <IconButton disabled={props.loading || page >= pageCount} label="Next page" onClick={() => props.onPageChange(page + 1)}><ChevronRight aria-hidden size={15} /></IconButton>
        <IconButton disabled={props.loading || page >= pageCount} label="Last page" onClick={() => props.onPageChange(pageCount)}><ChevronsRight aria-hidden size={15} /></IconButton>
      </div>
    </nav>
  );
}

export function List(props: { label: string; children: ReactNode; loading?: boolean }) {
  return <div aria-busy={props.loading || undefined} aria-label={props.label} className="list" role="list">{props.children}</div>;
}

export function ListRow(props: {
  title: string;
  description?: string;
  leading?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  selected?: boolean;
  onOpen(): void;
}) {
  return (
    <div className={`list-row${props.selected ? " selected" : ""}`} role="listitem">
      <button aria-current={props.selected ? "true" : undefined} className="list-row-main" onClick={props.onOpen} type="button">
        {props.leading ? <span className="list-row-leading" aria-hidden>{props.leading}</span> : null}
        <span className="list-row-copy"><strong title={props.title}>{props.title}</strong>{props.description ? <small title={props.description}>{props.description}</small> : null}</span>
        {props.meta ? <span className="list-row-meta">{props.meta}</span> : null}
      </button>
      {props.actions ? <div className="list-row-actions">{props.actions}</div> : null}
    </div>
  );
}

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

export function resolveTreeFocusId(visibleIds: string[], focusedId: string, selectedId?: string): string {
  if (visibleIds.includes(focusedId)) return focusedId;
  if (selectedId && visibleIds.includes(selectedId)) return selectedId;
  return visibleIds[0] ?? "";
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
export function Toolbar(props: { label: string; children: ReactNode; orientation?: "horizontal" | "vertical" }) {
  return <div aria-label={props.label} aria-orientation={props.orientation ?? "horizontal"} className={`toolbar ${props.orientation ?? "horizontal"}`} role="toolbar">{props.children}</div>;
}

export type BreadcrumbItem = { label: string; href?: string; onClick?: (event: ReactMouseEvent<HTMLElement>) => void };

export function Breadcrumb(props: { items: BreadcrumbItem[]; label?: string }) {
  return (
    <nav aria-label={props.label ?? "Breadcrumb"} className="breadcrumb">
      <ol>
        {props.items.map((item, index) => {
          const current = index === props.items.length - 1;
          return <li key={`${item.label}:${index}`}>
            {index ? <ChevronRight aria-hidden size={13} /> : null}
            {current ? <span aria-current="page">{item.label}</span> : item.href ? <Link href={item.href} {...(item.onClick ? { onClick: item.onClick } : {})}>{item.label}</Link> : <button onClick={item.onClick} type="button">{item.label}</button>}
          </li>;
        })}
      </ol>
    </nav>
  );
}

export function Splitter(props: {
  label: string;
  orientation: "horizontal" | "vertical";
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
  onReset?(): void;
  onPointerDown?: ButtonHTMLAttributes<HTMLButtonElement>["onPointerDown"];
}) {
  const step = props.step ?? 1;
  const clamp = (value: number) => Math.max(props.min, Math.min(props.max, value));
  return (
    <button
      aria-label={props.label}
      aria-orientation={props.orientation}
      aria-valuemax={props.max}
      aria-valuemin={props.min}
      aria-valuenow={Math.round(props.value)}
      aria-valuetext={`${Math.round(props.value)} percent`}
      className={`splitter ${props.orientation}`}
      onDoubleClick={props.onReset}
      onKeyDown={(event) => {
        const decrease = props.orientation === "vertical" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
        const increase = props.orientation === "vertical" ? event.key === "ArrowRight" : event.key === "ArrowDown";
        if (decrease || increase) {
          event.preventDefault();
          props.onChange(clamp(props.value + (increase ? 1 : -1) * step * (event.shiftKey ? 10 : 1)));
        } else if (event.key === "Home") {
          event.preventDefault();
          props.onChange(props.min);
        } else if (event.key === "End") {
          event.preventDefault();
          props.onChange(props.max);
        } else if (event.key === "Enter" && props.onReset) {
          event.preventDefault();
          props.onReset();
        }
      }}
      onPointerDown={props.onPointerDown}
      role="separator"
      title={props.onReset ? `${props.label}. Double-click or press Enter to reset.` : props.label}
      type="button"
    ><span aria-hidden /></button>
  );
}

type JsonPreview = { text: string; truncated: boolean };

function boundedJsonPreview(value: unknown, maxItems = 600, maxDepth = 10): JsonPreview {
  const seen = new WeakSet<object>();
  let itemCount = 0;
  let truncated = false;
  function visit(current: unknown, depth: number): unknown {
    itemCount += 1;
    if (itemCount > maxItems || depth > maxDepth) {
      truncated = true;
      return "[Preview truncated]";
    }
    if (typeof current === "bigint") return current.toString();
    if (typeof current === "function") return "[Function]";
    if (typeof current === "undefined") return "[Undefined]";
    if (!current || typeof current !== "object") return typeof current === "string" && current.length > 2_000 ? `${current.slice(0, 2_000)}...[truncated]` : current;
    if (seen.has(current)) return "[Circular]";
    seen.add(current);
    if (Array.isArray(current)) {
      const limit = Math.min(current.length, 150);
      if (limit < current.length) truncated = true;
      const values = current.slice(0, limit).map((item) => visit(item, depth + 1));
      if (limit < current.length) values.push("[Preview truncated: " + (current.length - limit) + " more items]");
      return values;
    }
    const entries = Object.entries(current as Record<string, unknown>);
    const limit = Math.min(entries.length, 150);
    if (limit < entries.length) truncated = true;
    const objectPreview = Object.fromEntries(entries.slice(0, limit).map(([key, item]) => [key, visit(item, depth + 1)]));
    if (limit < entries.length) objectPreview.__preview__ = "[Preview truncated: " + (entries.length - limit) + " more properties]";
    return objectPreview;
  }
  return { text: JSON.stringify(visit(value, 0), null, 2), truncated };
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function CodeViewer(props: { label: string; code: string; language?: string; filename?: string }) {
  const [wrap, setWrap] = useState(false);
  const [query, setQuery] = useState("");
  const matchCount = query ? props.code.toLowerCase().split(query.toLowerCase()).length - 1 : 0;
  return (
    <section className="code-viewer">
      <Toolbar label={`${props.label} tools`}>
        <strong>{props.label}</strong>
        <label className="code-viewer-search"><span className="visually-hidden">Find in {props.label}</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Find" type="search" value={query} /></label>
        {query ? <span className="code-viewer-matches">{matchCount} matches</span> : null}
        <Tooltip content={wrap ? "Use horizontal scrolling" : "Wrap long lines"}><IconButton aria-pressed={wrap} label="Toggle line wrapping" onClick={() => setWrap((current) => !current)}><WrapText aria-hidden size={14} /></IconButton></Tooltip>
        <Tooltip content="Copy visible source"><IconButton label="Copy source" onClick={() => {
          void navigator.clipboard?.writeText(props.code)
            .then(() => notifyGlobalAlert({ id: `copy:${props.label}`, tone: "success", message: `${props.label} copied.` }))
            .catch(() => notifyGlobalAlert({ id: `copy:${props.label}`, tone: "error", message: `${props.label} could not be copied.` }));
        }}><Copy aria-hidden size={14} /></IconButton></Tooltip>
        {props.filename ? <Tooltip content={`Download ${props.filename}`}><IconButton label="Download source" onClick={() => {
          try {
            downloadText(props.filename!, props.code);
            notifyGlobalAlert({ id: `download:${props.filename}`, tone: "success", message: `${props.filename} download started.` });
          } catch {
            notifyGlobalAlert({ id: `download:${props.filename}`, tone: "error", message: `${props.filename} could not be downloaded.` });
          }
        }}><Download aria-hidden size={14} /></IconButton></Tooltip> : null}
      </Toolbar>
      <pre className={wrap ? "wrap" : ""} data-language={props.language}><code>{props.code}</code></pre>
    </section>
  );
}

export function JsonViewer(props: { label: string; value: unknown; defaultOpen?: boolean; filename?: string }) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const preview = open ? boundedJsonPreview(props.value) : null;
  return (
    <details className="json-viewer" onToggle={(event) => setOpen(event.currentTarget.open)} open={open}>
      <summary><span>{props.label}</span><small>{open ? "Hide details" : "View details"}</small></summary>
      {preview ? <>
        {preview.truncated ? <InlineNotice message="This preview is bounded for browser performance. Open a focused payload or server export when the full object is needed." tone="info" /> : null}
        <CodeViewer code={preview.text} {...(props.filename ? { filename: props.filename } : {})} label={props.label} language="json" />
      </> : null}
    </details>
  );
}
export function KeyValue(props: { rows: Array<[string, string]> }) {
  return (
    <dl className="key-value-list">
      {props.rows.map(([key, value], index) => (
        <div key={`${key}:${index}`}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SummaryStrip(props: { items: Array<[string, string | number]> }) {
  return (
    <div className="summary-strip">
      {props.items.map(([label, value], index) => (
        <div key={`${label}:${index}`}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function StatusBadge(props: { value: string }) {
  const tone = fluxiqStatusTone(props.value);
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertTriangle : tone === "danger" ? XCircle : tone === "info" ? Info : Circle;
  return <span className={`status-badge-pill tone-${tone}`} title={props.value}><Icon size={12} aria-hidden /><span>{fluxiqStatusLabel(props.value)}</span></span>;
}

export function SpecDatum(props: { label: string; value: string }) {
  return (
    <div className="spec-datum">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function Segmented(props: { value: string; options: string[]; onChange(value: string): void; label?: string }) {
  return (
    <div aria-label={props.label ?? "Options"} className="segmented-control" role="group">
      {props.options.map((option) => (
        <button aria-pressed={props.value === option} className={props.value === option ? "selected" : ""} key={option} onClick={() => props.onChange(option)} type="button">
          {option}
        </button>
      ))}
    </div>
  );
}

export type DialogProps = {
  title: string;
  children: ReactNode;
  className?: string;
  description?: string;
  busy?: boolean;
  closeOnEscape?: boolean;
  dialogRole?: "dialog" | "alertdialog";
  onClose(): void;
};

export function Modal(props: DialogProps) {
  function submitOnEnter(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
    const submitButton = event.currentTarget.querySelector<HTMLButtonElement>(
      ".modal-actions .button-primary:not(:disabled), [data-modal-submit]:not(:disabled)",
    );
    if (!submitButton) return;
    event.preventDefault();
    submitButton.click();
  }
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-backdrop" data-overlay-root="modal">
      <ModalContent {...props} onKeyDown={submitOnEnter} overlayMode="modal" />
    </div>,
    document.body,
  );
}

export function ModalContent(props: DialogProps & { onKeyDown?(event: KeyboardEvent<HTMLElement>): void; overlayMode?: Extract<OverlayEnvironmentMode, "modal" | "drawer"> }) {
  const panelRef = useRef<HTMLElement>(null);
  const behaviorRef = useRef({ busy: false, closeOnEscape: true, onClose: props.onClose });
  const titleId = `dialog-title-${useId().replace(/:/g, "")}`;
  const descriptionId = props.description ? `${titleId}-description` : undefined;
  const busy = Boolean(props.busy || useInheritedOperationBusy());
  behaviorRef.current = { busy, closeOnEscape: props.closeOnEscape !== false, onClose: props.onClose };

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = panel.closest<HTMLElement>("[data-overlay-root]") ?? panel;
    const release = acquireOverlayEnvironment(document, {
      mode: props.overlayMode ?? "modal",
      panel,
      root,
      returnFocus,
      canDismiss: () => behaviorRef.current.closeOnEscape && !behaviorRef.current.busy,
      onEscape: () => behaviorRef.current.onClose(),
      trapFocus: true
    });
    const initial = panel.querySelector<HTMLElement>("[data-autofocus], [autofocus], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)");
    (initial ?? panel).focus({ preventScroll: true });
    return () => {
      release();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    props.onKeyDown?.(event);
  }

  return (
    <section
      aria-busy={busy || undefined}
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className={`modal-panel${props.className ? ` ${props.className}` : ""}`}
      onKeyDown={handleKeyDown}
      ref={panelRef}
      role={props.dialogRole ?? "dialog"}
      tabIndex={-1}
    >
      <div className="panel-heading">
        <div className="dialog-heading-copy">
          <h2 className="panel-title" id={titleId}>{props.title}</h2>
          {props.description ? <p id={descriptionId}>{props.description}</p> : null}
        </div>
        <IconButton disabled={busy} label="Close" onClick={props.onClose}><X size={16} aria-hidden /></IconButton>
      </div>
      <fieldset className="modal-operation-boundary" disabled={busy}>{props.children}</fieldset>
    </section>
  );
}

export function AlertDialog(props: {
  title: string;
  description: string;
  confirmLabel: string;
  objectLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <Modal busy={Boolean(props.busy)} closeOnEscape={!props.busy} description={props.description} dialogRole="alertdialog" title={props.title} onClose={props.onCancel}>
      {props.objectLabel ? <div className="dialog-object-label"><strong>{props.objectLabel}</strong></div> : null}
      <div className="modal-actions">
        <Button disabled={props.busy} onClick={props.onCancel}>Cancel</Button>
        <Button busy={Boolean(props.busy)} data-modal-submit onClick={props.onConfirm} variant={props.danger ? "danger" : "primary"}>{props.confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export type AuthorizationCredentials = { password: string; pin: string; totp: string };
export type AuthorizationRequirements = { password?: boolean; pin?: boolean; totp?: boolean };

export function AuthorizationDialog(props: {
  title: string;
  description: string;
  actionLabel: string;
  credentials: AuthorizationCredentials;
  requirements: AuthorizationRequirements;
  busy?: boolean;
  error?: string;
  onCancel(): void;
  onChange(credentials: AuthorizationCredentials): void;
  onAuthorize(): void;
}) {
  const ready = (!props.requirements.password || Boolean(props.credentials.password))
    && (!props.requirements.pin || props.credentials.pin.length >= 4)
    && (!props.requirements.totp || props.credentials.totp.length === 6);
  return (
    <Modal busy={Boolean(props.busy)} closeOnEscape={!props.busy} description={props.description} title={props.title} onClose={props.onCancel}>
      <div className="dialog-form">
        {props.requirements.password ? <Field {...(props.error ? { error: props.error } : {})} label="Password" required><input autoComplete="current-password" data-autofocus type="password" value={props.credentials.password} onChange={(event) => props.onChange({ ...props.credentials, password: event.target.value })} /></Field> : null}
        {props.requirements.pin ? <Field {...(!props.requirements.password && props.error ? { error: props.error } : {})} hint="Use your current security PIN." label="PIN" required><input autoComplete="off" inputMode="numeric" value={props.credentials.pin} onChange={(event) => props.onChange({ ...props.credentials, pin: event.target.value.replace(/\D/g, "").slice(0, 12) })} /></Field> : null}
        {props.requirements.totp ? <Field {...(!props.requirements.password && !props.requirements.pin && props.error ? { error: props.error } : {})} hint="Enter the current six-digit authenticator code." label="Authenticator code" required><input autoComplete="one-time-code" inputMode="numeric" value={props.credentials.totp} onChange={(event) => props.onChange({ ...props.credentials, totp: event.target.value.replace(/\D/g, "").slice(0, 6) })} /></Field> : null}
      </div>
      <div className="modal-actions">
        <Button disabled={props.busy} onClick={props.onCancel}>Cancel</Button>
        <Button busy={Boolean(props.busy)} data-modal-submit disabled={!ready} onClick={props.onAuthorize} variant="primary">{props.actionLabel}</Button>
      </div>
    </Modal>
  );
}

export function Drawer(props: DialogProps & { side?: "left" | "right" }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="drawer-backdrop" data-overlay-root="drawer">
      <ModalContent {...props} className={`drawer-panel ${props.side ?? "right"}${props.className ? ` ${props.className}` : ""}`} overlayMode="drawer" />
    </div>,
    document.body,
  );
}
export function InlineNotice(props: { tone: AlertTone; title?: string; message: string; action?: ReactNode }) {
  const Icon = props.tone === "success" ? CheckCircle2 : props.tone === "warning" ? AlertTriangle : props.tone === "error" ? XCircle : Info;
  return (
    <div className={`inline-notice ${props.tone}`} role={props.tone === "error" ? "alert" : "status"}>
      <Icon aria-hidden size={16} />
      <span>
        {props.title ? <strong>{props.title}</strong> : null}
        <small>{props.message}</small>
      </span>
      {props.action ? <div className="inline-notice-action">{props.action}</div> : null}
    </div>
  );
}

export function LoadingState(props: { label: string; detail?: string; compact?: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite" className={`loading-state${props.compact ? " compact" : ""}`} role="status">
      <LoaderCircle aria-hidden className="spin" size={props.compact ? 15 : 20} />
      <span><strong>{props.label}</strong>{props.detail ? <small>{props.detail}</small> : null}</span>
    </div>
  );
}

export function Skeleton(props: { lines?: number; label?: string }) {
  const lines = Math.max(1, Math.min(12, props.lines ?? 3));
  return (
    <div aria-label={props.label ?? "Loading content"} aria-busy="true" className="skeleton" role="status">
      {Array.from({ length: lines }, (_, index) => <span aria-hidden key={index} style={{ width: `${index === lines - 1 ? 62 : 100}%` }} />)}
    </div>
  );
}

export function Progress(props: { label: string; value?: number; detail?: string }) {
  const value = props.value === undefined ? undefined : Math.max(0, Math.min(100, props.value));
  return (
    <div className="progress">
      <div><strong>{props.label}</strong>{props.detail ? <span>{props.detail}</span> : null}{value !== undefined ? <output>{Math.round(value)}%</output> : null}</div>
      <div aria-label={props.label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={value === undefined ? undefined : Math.round(value)} className={value === undefined ? "progress-bar indeterminate" : "progress-bar"} role="progressbar">
        <span style={value === undefined ? undefined : { width: `${value}%` }} />
      </div>
    </div>
  );
}

export function EmptyState(props: { title: string; description: string; icon?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`empty-state${props.compact ? " compact" : ""}`}>
      {props.icon ? <span className="empty-state-icon" aria-hidden>{props.icon}</span> : null}
      <strong>{props.title}</strong>
      <p>{props.description}</p>
      {props.action ? <div className="empty-state-action">{props.action}</div> : null}
    </div>
  );
}
export function StatusText({ value }: { value: string }) {
  useEffect(() => {
    if (!value) return;
    const tone = toneFromMessage(value);
    notifyGlobalAlert({ tone, title: titleFromTone(tone), message: value });
  }, [value]);
  return null;
}

export function VisualAlert(props: { tone: AlertTone; title?: string; message: string }) {
  return <InlineNotice {...props} />;
}

export function GlobalAlertViewport() {
  const [alerts, setAlerts] = useState<GlobalAlertItem[]>([]);
  const [pausedIds, setPausedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const onAlert = (event: Event) => {
      const detail = (event as CustomEvent<GlobalAlertPayload>).detail;
      if (!detail?.message?.trim()) return;
      const key = detail.id ?? `${detail.tone}:${detail.title ?? ""}:${detail.message}`;
      const ttlMs = detail.ttlMs ?? (detail.tone === "error" ? 10_000 : 6_000);
      const alert: GlobalAlertItem = {
        id: key,
        tone: detail.tone,
        ...(detail.title ? { title: detail.title } : {}),
        message: detail.message,
        createdAt: Date.now(),
        ttlMs,
        ...(detail.actionLabel ? { actionLabel: detail.actionLabel } : {}),
        ...(detail.onAction ? { onAction: detail.onAction } : {})
      };
      setAlerts((current) => [alert, ...current.filter((item) => item.id !== key)].slice(0, 4));
    };
    window.addEventListener("fluxiq:global-alert", onAlert);
    return () => window.removeEventListener("fluxiq:global-alert", onAlert);
  }, []);
  useEffect(() => {
    if (!alerts.length) return;
    const timers = alerts.filter((alert) => !pausedIds.has(alert.id)).map((alert) => window.setTimeout(() => {
      setAlerts((current) => current.filter((item) => item.id !== alert.id));
    }, alert.ttlMs));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [alerts, pausedIds]);
  if (!alerts.length) return null;
  return (
    <div className="global-alert-viewport" aria-label="Notifications">
      {alerts.map((alert) => (
        <GlobalAlertCard
          key={alert.id}
          alert={alert}
          onDismiss={() => setAlerts((current) => current.filter((item) => item.id !== alert.id))}
          onPause={(paused) => setPausedIds((current) => {
            const next = new Set(current);
            if (paused) next.add(alert.id);
            else next.delete(alert.id);
            return next;
          })}
        />
      ))}
    </div>
  );
}

function GlobalAlertCard(props: { alert: GlobalAlertItem; onDismiss(): void; onPause(paused: boolean): void }) {
  const Icon = props.alert.tone === "success" ? CheckCircle2 : props.alert.tone === "warning" ? AlertTriangle : props.alert.tone === "error" ? XCircle : Info;
  return (
    <div
      className={`global-alert ${props.alert.tone}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) props.onPause(false);
      }}
      onFocus={() => props.onPause(true)}
      onMouseEnter={() => props.onPause(true)}
      onMouseLeave={() => props.onPause(false)}
      role={props.alert.tone === "error" ? "alert" : "status"}
    >
      <Icon size={16} aria-hidden />
      <span>
        {props.alert.title ? <strong>{props.alert.title}</strong> : null}
        <small>{props.alert.message}</small>
      </span>
      {props.alert.actionLabel && props.alert.onAction ? (
        <button className="global-alert-action" onClick={() => { props.alert.onAction?.(); props.onDismiss(); }} type="button">
          {props.alert.actionLabel}
        </button>
      ) : null}
      <button className="global-alert-dismiss" onClick={props.onDismiss} title="Dismiss notification" aria-label="Dismiss notification" type="button">
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}

export function toneFromMessage(value: string): AlertTone {
  const text = value.toLowerCase();
  if (/\b(failed|failure|error|invalid|must|cannot|required|unknown|disabled|denied)\b/.test(text)) return "error";
  if (/\b(waiting|pending|scheduled|started|running|setup)\b/.test(text)) return "warning";
  if (/\b(created|updated|saved|enabled|finished|rebuilt|started|synced|successful)\b/.test(text)) return "success";
  return "info";
}

export function titleFromTone(tone: AlertTone): string {
  if (tone === "success") return "Success";
  if (tone === "warning") return "Attention";
  if (tone === "error") return "Action failed";
  return "Notice";
}
