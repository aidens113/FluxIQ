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
