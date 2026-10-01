"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { acquireOverlayEnvironment } from "../../overlay-environment";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

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
  const alive = useRef(true);
  const lifetime = useRef({ open: props.defaultOpen ?? false, epoch: 0, last: false, restoreEpoch: -1, actingEpoch: -1 });
  const currentOptions = useRef(props.options);
  currentOptions.current = props.options;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const ownedFocus = useRef<HTMLElement | null>(null);
  const epoch = lifetime.current.epoch;
  const entryId = props.options.find(option => option.id === focusedId && !option.disabled)?.id
    ?? props.options.find(option => !option.disabled)?.id;

  function current(expected: number) { return alive.current && lifetime.current.open && lifetime.current.epoch === expected; }
  function activeDocument(panel: HTMLElement) { return panel.ownerDocument.visibilityState !== "hidden" && panel.ownerDocument.hasFocus(); }
  function eligible(element: HTMLElement) {
    const visibility = element.ownerDocument.defaultView?.getComputedStyle(element).visibility;
    return element.isConnected && !element.matches(":disabled") && element.getAttribute("aria-disabled") !== "true"
      && !element.closest('[hidden], [inert], [aria-hidden="true"]') && element.getClientRects().length > 0
      && visibility !== "hidden" && visibility !== "collapse";
  }
  function targets(panel: HTMLElement) { return Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(eligible); }
  function focusItem(element: HTMLElement, panel: HTMLElement) {
    ownedFocus.current = element;
    setFocusedId(element === panel ? null : element.getAttribute("data-menu-option"));
    element.focus({ preventScroll: true });
  }
  function closeMenu(expected: number, restore = false) {
    if (!current(expected)) return;
    lifetime.current.restoreEpoch = restore ? expected : -1;
    lifetime.current.open = false;
    lifetime.current.epoch += 1;
    setOpen(false);
  }

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    if (!open) return;
    const panel = menuRef.current;
    const trigger = triggerRef.current?.querySelector<HTMLElement>("button") ?? null;
    if (!panel) return;
    const document = panel.ownerDocument;
    const options = {
      mode: "menu" as const,
      panel,
      root: panel,
      returnFocus: null as HTMLElement | null,
      additionalInsideElements: () => [triggerRef.current],
      onEscape: () => closeMenu(epoch, true),
      onPointerDownOutside: () => closeMenu(epoch),
      onViewportChange: () => { if (current(epoch)) updateMenuPosition(); }
    };
    const release = acquireOverlayEnvironment(document, options);
    if (activeDocument(panel)) {
      const items = targets(panel);
      focusItem((lifetime.current.last ? items.at(-1) : items[0]) ?? panel, panel);
    }
    return () => {
      const active = document.activeElement;
      if (alive.current && lifetime.current.restoreEpoch === epoch && trigger && eligible(trigger) && activeDocument(panel)
        && (!active || active === document.body || panel.contains(active) || !active.isConnected)) options.returnFocus = trigger;
      release();
    };
  }, [open, epoch]);

  useEffect(() => {
    const panel = menuRef.current;
    if (!current(epoch) || !panel || !activeDocument(panel)) return;
    const active = panel.ownerDocument.activeElement;
    const prior = ownedFocus.current;
    if (active && !panel.contains(active) && !(active === panel.ownerDocument.body && prior?.isConnected === false)) return;
    const items = targets(panel);
    if (!items.includes(active as HTMLElement)) focusItem(items[0] ?? panel, panel);
  }, [props.options, open, epoch]);

  function toggleMenu() {
    if (!alive.current || lifetime.current.epoch !== epoch) return;
    if (lifetime.current.open) {
      closeMenu(epoch, true);
      return;
    }
    lifetime.current.open = true;
    lifetime.current.last = false;
    lifetime.current.epoch += 1;
    updateMenuPosition();
    setOpen(true);
  }

  function triggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (nativeKey(event) || !["ArrowDown", "ArrowUp"].includes(event.key) || event.shiftKey
      || event.currentTarget.ownerDocument.activeElement !== event.currentTarget || !activeDocument(event.currentTarget)
      || !eligible(event.currentTarget) || lifetime.current.epoch !== epoch || !alive.current) return;
    event.preventDefault();
    if (current(epoch)) {
      const panel = menuRef.current;
      if (panel) { const items = targets(panel); focusItem((event.key === "ArrowUp" ? items.at(-1) : items[0]) ?? panel, panel); }
      return;
    }
    lifetime.current.open = true;
    lifetime.current.last = event.key === "ArrowUp";
    lifetime.current.epoch += 1;
    updateMenuPosition();
    setOpen(true);
  }

  function nativeKey(event: KeyboardEvent<HTMLElement>) {
    return event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey
      || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
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

  function menuKey(event: KeyboardEvent<HTMLDivElement>) {
    const panel = event.currentTarget;
    if (nativeKey(event) || !current(epoch) || menuRef.current !== panel || !activeDocument(panel)
      || event.target !== panel.ownerDocument.activeElement || !panel.contains(panel.ownerDocument.activeElement)) return;
    if (event.key === "Tab") {
      const trigger = triggerRef.current?.querySelector<HTMLElement>("button");
      closeMenu(epoch);
      if (trigger && eligible(trigger)) trigger.focus({ preventScroll: true });
    } else if (!event.shiftKey && event.key === "Escape") {
      event.preventDefault(); closeMenu(epoch, true);
    } else if (!event.shiftKey && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      const items = targets(panel); if (!items.length) return;
      const index = items.indexOf(panel.ownerDocument.activeElement as HTMLElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : event.key === "ArrowUp" ? index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length : (index + 1) % items.length;
      event.preventDefault(); focusItem(items[next]!, panel);
    }
  }

  function activate(option: MenuOption, event: { defaultPrevented?: boolean; preventDefault(): void }) {
    const panel = menuRef.current;
    const valid = current(epoch) && lifetime.current.actingEpoch !== epoch && !option.disabled
      && currentOptions.current.includes(option) && panel && activeDocument(panel)
      && targets(panel).some(item => item.getAttribute("data-menu-option") === option.id);
    if (!valid) { event.preventDefault(); return; }
    if (event.defaultPrevented) return;
    lifetime.current.actingEpoch = epoch;
    try { if (!option.href) option.onSelect?.(); }
    finally { if (lifetime.current.actingEpoch === epoch) lifetime.current.actingEpoch = -1; closeMenu(epoch); }
  }

  function optionFocus(option: MenuOption) {
    const panel = menuRef.current;
    if (!current(epoch) || !panel || !activeDocument(panel) || option.disabled || !currentOptions.current.includes(option)) return;
    const active = panel.ownerDocument.activeElement as HTMLElement;
    if (!targets(panel).includes(active) || active.getAttribute("data-menu-option") !== option.id) return;
    ownedFocus.current = active; setFocusedId(option.id);
  }

  const popover = open ? (
    <div
      aria-label={props.label}
      className="menu-popover menu-popover-portal"
      onKeyDown={menuKey}
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      id={menuId}
      style={position ? { maxHeight: position.maxHeight, right: position.right, top: position.top } : undefined}
    >
      {props.options.map((option) => option.href && option.disabled ? (
        <span aria-disabled data-menu-option={option.id} className={option.danger ? "danger" : undefined} key={option.id} role="menuitem" tabIndex={-1}>
          {option.icon}<span>{option.label}</span>
        </span>
      ) : option.href ? (
        <Link className={option.danger ? "danger" : undefined} data-menu-option={option.id} href={option.href} key={option.id} onClick={event => activate(option, event)} onFocus={() => optionFocus(option)} role="menuitem" tabIndex={option.id === entryId ? 0 : -1}>
          {option.icon}<span>{option.label}</span>
        </Link>
      ) : (
        <button
          className={option.danger ? "danger" : undefined}
          disabled={option.disabled}
          data-menu-option={option.id}
          key={option.id}
          onClick={event => activate(option, event)}
          onFocus={() => optionFocus(option)}
          role="menuitem"
          type="button"
          tabIndex={!option.disabled && option.id === entryId ? 0 : -1}
        >
          {option.icon}<span>{option.label}</span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="menu" ref={triggerRef}>
      {props.iconOnly
        ? <IconButton aria-controls={menuId} aria-expanded={open} aria-haspopup="menu" label={props.label} onClick={toggleMenu} onKeyDown={triggerKey}>{props.icon}</IconButton>
        : <Button aria-controls={menuId} aria-expanded={open} aria-haspopup="menu" aria-label={props.label} onClick={toggleMenu} onKeyDown={triggerKey} size="compact" variant="secondary">
          {props.icon}<span>{props.label}</span><ChevronDown aria-hidden size={14} />
        </Button>}
      {popover && typeof document !== "undefined" ? createPortal(popover, document.body) : popover}
    </div>
  );
}
