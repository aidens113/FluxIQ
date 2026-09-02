export type OverlayEnvironmentMode = "modal" | "drawer" | "menu" | "nonmodal";

type FocusTarget = {
  focus(options?: FocusOptions): void;
  isConnected?: boolean;
};

export type OverlayEnvironmentOptions = {
  mode: OverlayEnvironmentMode;
  panel: HTMLElement;
  root: HTMLElement;
  returnFocus: FocusTarget | null;
  canDismiss?(): boolean;
  onEscape?(): void;
  onPointerDownOutside?(): void;
  onViewportChange?(): void;
  additionalInsideElements?(): Array<Element | null>;
  trapFocus?: boolean;
};

type OriginalElementState = {
  ariaHidden: string | null;
  inert: boolean;
};

type OverlayEnvironmentState = {
  entries: OverlayEnvironmentOptions[];
  originalOverflow: string;
  isolated: Map<HTMLElement, OriginalElementState>;
  removeListeners: (() => void) | null;
};

const environmentByDocument = new WeakMap<Document, OverlayEnvironmentState>();
const focusableSelector = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function acquireOverlayEnvironment(documentRef: Document, options: OverlayEnvironmentOptions): () => void {
  const state = environmentByDocument.get(documentRef) ?? {
    entries: [],
    originalOverflow: documentRef.body.style.overflow,
    isolated: new Map<HTMLElement, OriginalElementState>(),
    removeListeners: null
  };
  state.entries.push(options);
  if (!environmentByDocument.has(documentRef)) {
    environmentByDocument.set(documentRef, state);
    state.removeListeners = installEnvironmentListeners(documentRef, state);
  }
  applyEnvironment(documentRef, state);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const index = state.entries.indexOf(options);
    if (index < 0) return;
    const wasTop = index === state.entries.length - 1;
    state.entries.splice(index, 1);
    applyEnvironment(documentRef, state);
    if (!state.entries.length) {
      state.removeListeners?.();
      restoreIsolation(state);
      documentRef.body.style.overflow = state.originalOverflow;
      environmentByDocument.delete(documentRef);
    }
    if (wasTop && options.returnFocus?.isConnected !== false) {
      options.returnFocus?.focus({ preventScroll: true });
    }
  };
}

export function overlayEnvironmentDepth(documentRef: Document): number {
  return environmentByDocument.get(documentRef)?.entries.length ?? 0;
}

export function overlayEnvironmentListenerCount(documentRef: Document): number {
  return environmentByDocument.get(documentRef)?.removeListeners ? 1 : 0;
}

export type FloatingOverlayCloseReason = "backdrop" | "escape" | "explicit";

export function canCloseFloatingOverlay(busy: boolean, reason: FloatingOverlayCloseReason): boolean {
  return reason === "explicit" || !busy;
}

function installEnvironmentListeners(documentRef: Document, state: OverlayEnvironmentState): () => void {
  const onKeyDown = (event: Event) => {
    const keyboardEvent = event as globalThis.KeyboardEvent;
    const top = state.entries.at(-1);
    if (!top) return;
    if (keyboardEvent.key === "Escape" && top.onEscape && (top.canDismiss?.() ?? true)) {
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      top.onEscape();
      return;
    }
    if (keyboardEvent.key === "Tab" && top.trapFocus) trapFocus(keyboardEvent, top.panel);
  };
  const onPointerDown = (event: Event) => {
    const top = state.entries.at(-1);
    if (!top?.onPointerDownOutside || !(top.canDismiss?.() ?? true)) return;
    const target = event.target as Node | null;
    const inside = target && (top.panel.contains(target)
      || (top.additionalInsideElements?.() ?? []).some((element) => element?.contains(target)));
    if (!inside) top.onPointerDownOutside();
  };
  const preventBackgroundScroll = (event: Event) => {
    const hasModal = state.entries.some((entry) => isModalMode(entry.mode));
    const top = state.entries.at(-1);
    if (hasModal && top && !top.panel.contains(event.target as Node | null)) event.preventDefault();
  };
  const onViewportChange = () => {
    for (const entry of [...state.entries].reverse()) entry.onViewportChange?.();
  };

  documentRef.addEventListener("keydown", onKeyDown, true);
  documentRef.addEventListener("pointerdown", onPointerDown, true);
  documentRef.addEventListener("wheel", preventBackgroundScroll, { capture: true, passive: false });
  documentRef.addEventListener("touchmove", preventBackgroundScroll, { capture: true, passive: false });
  documentRef.defaultView?.addEventListener("resize", onViewportChange);
  documentRef.defaultView?.addEventListener("scroll", onViewportChange, true);
  return () => {
    documentRef.removeEventListener("keydown", onKeyDown, true);
    documentRef.removeEventListener("pointerdown", onPointerDown, true);
    documentRef.removeEventListener("wheel", preventBackgroundScroll, true);
    documentRef.removeEventListener("touchmove", preventBackgroundScroll, true);
    documentRef.defaultView?.removeEventListener("resize", onViewportChange);
    documentRef.defaultView?.removeEventListener("scroll", onViewportChange, true);
  };
}

function applyEnvironment(documentRef: Document, state: OverlayEnvironmentState) {
  restoreIsolation(state);
  let topModalIndex = -1;
  for (let index = state.entries.length - 1; index >= 0; index -= 1) {
    if (isModalMode(state.entries[index]!.mode)) {
      topModalIndex = index;
      break;
    }
  }
  const topModal = topModalIndex >= 0 ? state.entries[topModalIndex] : undefined;
  documentRef.body.style.overflow = topModal ? "hidden" : state.originalOverflow;
  if (!topModal) return;
  const activeRoots = new Set(state.entries.slice(topModalIndex).map((entry) => entry.root));
  for (const child of Array.from(documentRef.body.children)) {
    if (activeRoots.has(child as HTMLElement)) continue;
    const element = child as HTMLElement;
    state.isolated.set(element, { ariaHidden: element.getAttribute("aria-hidden"), inert: element.inert });
    element.setAttribute("aria-hidden", "true");
    element.inert = true;
  }
}

function restoreIsolation(state: OverlayEnvironmentState) {
  for (const [element, original] of state.isolated) {
    if (original.ariaHidden === null) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", original.ariaHidden);
    element.inert = original.inert;
  }
  state.isolated.clear();
}

function trapFocus(event: globalThis.KeyboardEvent, panel: HTMLElement) {
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
  if (!focusable.length) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && panel.ownerDocument.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && panel.ownerDocument.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function isModalMode(mode: OverlayEnvironmentMode): boolean {
  return mode === "modal" || mode === "drawer";
}
