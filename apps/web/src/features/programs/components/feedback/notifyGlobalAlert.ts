"use client";

import type { AlertTone } from "./tone";

// Exported so GlobalAlertViewport can type the event detail it receives. The
// components barrel re-exports notifyGlobalAlert by name, not this type, so
// the public surface stays exactly what shared-ui.tsx published before.
export type GlobalAlertPayload = {
  tone: AlertTone;
  title?: string;
  message: string;
  id?: string;
  ttlMs?: number;
  actionLabel?: string;
  onAction?: () => void;
};

export function notifyGlobalAlert(payload: GlobalAlertPayload) {
  if (typeof window === "undefined" || !payload.message.trim()) return;
  window.dispatchEvent(new CustomEvent<GlobalAlertPayload>("fluxiq:global-alert", { detail: payload }));
}
