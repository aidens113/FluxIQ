"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import {
  acquireOverlayEnvironment,
  canCloseFloatingOverlay,
  type FloatingOverlayCloseReason
} from "./overlay-environment";

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
  const titleId = useId();
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseEnvironment = acquireOverlayEnvironment(document, returnFocus, { lockScroll: false });
    const initial = panel?.querySelector<HTMLElement>(focusableSelector());
    (initial ?? panel)?.focus({ preventScroll: true });
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
    update();
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(panel);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [props.anchor, props.preferredWidth]);

  function requestClose(reason: FloatingOverlayCloseReason) {
    if (canCloseFloatingOverlay(Boolean(props.busy), reason)) props.onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      requestClose("escape");
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector())
    ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

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
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) requestClose("backdrop");
      }}
      style={{ position: "fixed", inset: 0, zIndex: 80 }}
    >
      <section
        aria-busy={props.busy || undefined}
        aria-label={props.ariaLabel}
        aria-labelledby={titleId}
        aria-modal="true"
        className={props.className}
        onKeyDown={handleKeyDown}
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
    "[autofocus]",
    "a[href]",
    "button:not(:disabled)",
    "input:not(:disabled)",
    "select:not(:disabled)",
    "textarea:not(:disabled)",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");
}
