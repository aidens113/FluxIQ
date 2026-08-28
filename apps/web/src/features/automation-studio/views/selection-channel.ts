"use client";

import type { AutomationSelection } from "../types";

const automationGraphSelectionEvent = "automation-studio:graph-selection";

export function publishAutomationGraphSelection(selection: AutomationSelection | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AutomationSelection | null>(automationGraphSelectionEvent, { detail: selection }));
}

export function subscribeAutomationGraphSelection(listener: (selection: AutomationSelection | null) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const receive = (event: Event) => listener((event as CustomEvent<AutomationSelection | null>).detail ?? null);
  window.addEventListener(automationGraphSelectionEvent, receive);
  return () => window.removeEventListener(automationGraphSelectionEvent, receive);
}
