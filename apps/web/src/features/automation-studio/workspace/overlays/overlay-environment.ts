type FocusTarget = {
  focus(options?: FocusOptions): void;
  isConnected?: boolean;
};

type OverlayEnvironmentToken = {
  returnFocus: FocusTarget | null;
};

type OverlayEnvironmentState = {
  originalOverflow: string;
  tokens: OverlayEnvironmentToken[];
};

const environmentByDocument = new WeakMap<Document, OverlayEnvironmentState>();

export function acquireOverlayEnvironment(
  documentRef: Document,
  returnFocus: FocusTarget | null
): () => void {
  const state = environmentByDocument.get(documentRef) ?? {
    originalOverflow: documentRef.body.style.overflow,
    tokens: []
  };
  const token = { returnFocus };
  state.tokens.push(token);
  environmentByDocument.set(documentRef, state);
  documentRef.body.style.overflow = "hidden";

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const index = state.tokens.indexOf(token);
    if (index < 0) return;
    const wasTop = index === state.tokens.length - 1;
    state.tokens.splice(index, 1);

    if (!state.tokens.length) {
      documentRef.body.style.overflow = state.originalOverflow;
      environmentByDocument.delete(documentRef);
    }
    if (wasTop && returnFocus?.isConnected !== false) {
      returnFocus?.focus({ preventScroll: true });
    }
  };
}

export function overlayEnvironmentDepth(documentRef: Document): number {
  return environmentByDocument.get(documentRef)?.tokens.length ?? 0;
}

export type FloatingOverlayCloseReason = "backdrop" | "escape" | "explicit";

export function canCloseFloatingOverlay(
  busy: boolean,
  reason: FloatingOverlayCloseReason
): boolean {
  return reason === "explicit" || !busy;
}
