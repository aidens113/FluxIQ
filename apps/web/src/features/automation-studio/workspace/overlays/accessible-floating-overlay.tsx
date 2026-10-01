"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { acquireOverlayEnvironment } from "../../../programs/overlay-environment";

export type OverlayAnchor = { top: number; right: number; bottom: number; left: number };

type FloatingPosition = {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
};

const margin = 12;

export function AccessibleFloatingOverlay(props: {
  anchor: OverlayAnchor;
  ariaLabel: string;
  busy?: boolean;
  children: ReactNode;
  className: string;
  onClose(): void;
  preferredWidth: number;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const behaviorRef = useRef({ busy: Boolean(props.busy), onClose: props.onClose });
  const updatePositionRef = useRef<() => void>(() => undefined);
  const titleId = useId();
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  behaviorRef.current = { busy: Boolean(props.busy), onClose: props.onClose };

  useEffect(() => {
    const panel = panelRef.current;
    const root = rootRef.current;
    if (!panel || !root) return;
    const documentRef = panel.ownerDocument;
    const active = documentRef.activeElement as HTMLElement | null;
    const returnFocus = active && typeof active.focus === "function" ? active : null;
    const releaseEnvironment = acquireOverlayEnvironment(documentRef, {
      mode: "nonmodal",
      panel,
      root,
      returnFocus,
      canDismiss: () => !behaviorRef.current.busy,
      onEscape: () => behaviorRef.current.onClose(),
      onPointerDownOutside: () => behaviorRef.current.onClose(),
      onViewportChange: () => updatePositionRef.current()
    });
    function eligible(element: HTMLElement) {
      const focusable = ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(element.tagName)
        || element.hasAttribute("tabindex") || (element.tagName === "A" && element.hasAttribute("href")) || element.isContentEditable;
      if (!focusable || !element.isConnected || element.ownerDocument !== documentRef || element.hidden || element.matches(":disabled")
        || (element.tagName === "INPUT" && (element as HTMLInputElement).type === "hidden")
        || element.closest('[hidden], [inert], [aria-hidden="true"]') || !element.getClientRects().length) return false;
      const visibility = documentRef.defaultView?.getComputedStyle(element).visibility;
      return visibility !== "hidden" && visibility !== "collapse";
    }
    function first(selector: string) {
      return Array.from(panel!.querySelectorAll<HTMLElement>(selector)).find(eligible);
    }
    if (documentRef.visibilityState !== "hidden" && (typeof documentRef.hasFocus !== "function" || documentRef.hasFocus()) && root.isConnected && eligible(panel)) {
      // Selector lists follow DOM order, so explicit autofocus needs its own tiers.
      const initial = first("[data-autofocus]") ?? first("[autofocus]") ?? first(focusableSelector());
      (initial ?? panel).focus({ preventScroll: true });
    }
    return releaseEnvironment;
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setPosition(calculateFloatingPosition(
          props.anchor,
          props.preferredWidth,
          panel.scrollHeight,
          window.innerWidth,
          window.innerHeight
        ));
      });
    };
    updatePositionRef.current = update;
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(panel);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      updatePositionRef.current = () => undefined;
    };
  }, [props.anchor, props.preferredWidth]);

  if (typeof document === "undefined") return null;
  const fallback = calculateFloatingPosition(
    props.anchor,
    props.preferredWidth,
    240,
    window.innerWidth,
    window.innerHeight
  );
  const resolved = position ?? fallback;

  return createPortal(
    <div
      aria-hidden="false"
      data-overlay-root="nonmodal"
      ref={rootRef}
      style={{ position: "fixed", inset: 0, zIndex: "var(--layer-popover)" }}
    >
      <section
        aria-busy={props.busy || undefined}
        aria-label={props.ariaLabel}
        aria-labelledby={titleId}
        className={props.className}
        ref={panelRef}
        role="dialog"
        style={{
          left: resolved.left,
          maxHeight: resolved.maxHeight,
          maxWidth: `calc(100vw - ${margin * 2}px)`,
          overflow: "auto",
          position: "absolute",
          top: resolved.top,
          width: resolved.width
        }}
        tabIndex={-1}
      >
        <span className="visually-hidden" id={titleId}>{props.ariaLabel}</span>
        {props.children}
      </section>
    </div>,
    document.body
  );
}

export function calculateFloatingPosition(
  anchor: OverlayAnchor,
  preferredWidth: number,
  contentHeight: number,
  viewportWidth: number,
  viewportHeight: number
): FloatingPosition {
  const width = Math.max(0, Math.min(preferredWidth, viewportWidth - margin * 2));
  const maxHeight = Math.max(0, viewportHeight - margin * 2);
  const height = Math.min(Math.max(0, contentHeight), maxHeight);
  const left = clamp(anchor.left, margin, Math.max(margin, viewportWidth - width - margin));
  const below = anchor.bottom + 8;
  const above = anchor.top - height - 8;
  const top = below + height <= viewportHeight - margin
    ? below
    : clamp(above, margin, Math.max(margin, viewportHeight - height - margin));
  return { left, maxHeight, top, width };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function focusableSelector(): string {
  return [
    "a[href]",
    "button:not(:disabled)",
    "input:not(:disabled)",
    "select:not(:disabled)",
    "textarea:not(:disabled)",
    "[tabindex]:not([tabindex='-1'])",
    '[contenteditable="true"]'
  ].join(",");
}
