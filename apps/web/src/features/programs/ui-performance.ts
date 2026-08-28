"use client";

import { useEffect, useRef } from "react";
import { evaluateLongTaskBudget, evaluateRenderBudget } from "./ui-performance-budgets";

declare global {
  interface Window {
    __FLUXIQ_ENABLE_UI_PERFORMANCE_COUNTERS__?: boolean;
  }
}

export type UiRenderMetric = {
  component: string;
  count: number;
  commitDelayMs: number;
  sincePreviousCommitMs?: number;
  recordedAt: number;
};

export type UiLongTaskMetric = {
  scope: string;
  name: string;
  startTime: number;
  duration: number;
  recordedAt: number;
};

export type AutomationStudioPerformanceCounterKind = "studio-shell-render" | "view-render" | "request-lifecycle" | "hierarchy-save-request" | "draft-write";

export type AutomationStudioPerformanceCounterEvent = {
  kind: AutomationStudioPerformanceCounterKind;
  name: string;
  amount: number;
  recordedAt: number;
  metadata?: Record<string, string | number | boolean | undefined> | undefined;
};

export type AutomationStudioPerformanceCountersSnapshot = {
  counts: Record<AutomationStudioPerformanceCounterKind, number>;
  byName: Record<string, number>;
  events: AutomationStudioPerformanceCounterEvent[];
};

const AUTOMATION_STUDIO_COUNTER_KINDS: AutomationStudioPerformanceCounterKind[] = ["studio-shell-render", "view-render", "request-lifecycle", "hierarchy-save-request", "draft-write"];
const EMPTY_AUTOMATION_STUDIO_COUNTERS = Object.fromEntries(AUTOMATION_STUDIO_COUNTER_KINDS.map((kind) => [kind, 0])) as Record<AutomationStudioPerformanceCounterKind, number>;
let automationStudioPerformanceCounters: AutomationStudioPerformanceCountersSnapshot = { counts: { ...EMPTY_AUTOMATION_STUDIO_COUNTERS }, byName: {}, events: [] };
const automationStudioPerformanceSubscribers = new Set<() => void>();

export function useUiRenderMetric(component: string): void {
  const renderCount = useRef(0);
  const previousCommitAt = useRef<number | null>(null);
  const renderStartedAt = performance.now();
  renderCount.current += 1;

  useEffect(() => {
    if (!uiPerformanceRenderHooksEnabled()) return;
    const recordedAt = performance.now();
    const detail: UiRenderMetric = {
      component,
      count: renderCount.current,
      commitDelayMs: recordedAt - renderStartedAt,
      ...(previousCommitAt.current === null ? {} : { sincePreviousCommitMs: recordedAt - previousCommitAt.current }),
      recordedAt
    };
    previousCommitAt.current = recordedAt;
    window.dispatchEvent(new CustomEvent<UiRenderMetric>("ui-render:metric", { detail }));
    if (component === "AutomationStudioLive") recordAutomationStudioShellRender(component);
    else if (component.startsWith("AutomationStudio")) recordAutomationStudioViewRender(component);
    for (const violation of evaluateRenderBudget(detail)) {
      window.dispatchEvent(new CustomEvent("ui-performance:budget-violation", { detail: violation }));
    }
  });
}

export function getAutomationStudioPerformanceCounters(): AutomationStudioPerformanceCountersSnapshot {
  return automationStudioPerformanceCounters;
}

export function subscribeAutomationStudioPerformanceCounters(listener: () => void): () => void {
  automationStudioPerformanceSubscribers.add(listener);
  return () => automationStudioPerformanceSubscribers.delete(listener);
}

export function resetAutomationStudioPerformanceCounters(): void {
  automationStudioPerformanceCounters = { counts: { ...EMPTY_AUTOMATION_STUDIO_COUNTERS }, byName: {}, events: [] };
  notifyAutomationStudioPerformanceSubscribers();
}

export function recordAutomationStudioShellRender(component = "AutomationStudioLive", metadata?: AutomationStudioPerformanceCounterEvent["metadata"]): void {
  recordAutomationStudioPerformanceCounter({ kind: "studio-shell-render", name: component, metadata });
}

export function recordAutomationStudioViewRender(view: string, metadata?: AutomationStudioPerformanceCounterEvent["metadata"]): void {
  recordAutomationStudioPerformanceCounter({ kind: "view-render", name: view, metadata });
}

export function recordAutomationStudioRequestLifecycle(name: string, metadata?: AutomationStudioPerformanceCounterEvent["metadata"]): void {
  recordAutomationStudioPerformanceCounter({ kind: "request-lifecycle", name, metadata });
}

export function recordAutomationStudioHierarchySaveRequest(metadata?: AutomationStudioPerformanceCounterEvent["metadata"]): void {
  recordAutomationStudioPerformanceCounter({ kind: "hierarchy-save-request", name: "save-project-hierarchy", metadata });
}

export function recordAutomationStudioDraftWrite(name: string, metadata?: AutomationStudioPerformanceCounterEvent["metadata"]): void {
  recordAutomationStudioPerformanceCounter({ kind: "draft-write", name, metadata });
}

export function recordAutomationStudioPerformanceCounter(input: Omit<AutomationStudioPerformanceCounterEvent, "amount" | "recordedAt"> & { amount?: number }): void {
  if (!uiPerformanceInstrumentationEnabled()) return;
  const amount = input.amount ?? 1;
  const event: AutomationStudioPerformanceCounterEvent = { ...input, amount, recordedAt: nowForUiPerformance() };
  const key = automationStudioCounterKey(event.kind, event.name);
  automationStudioPerformanceCounters = {
    counts: { ...automationStudioPerformanceCounters.counts, [event.kind]: (automationStudioPerformanceCounters.counts[event.kind] ?? 0) + amount },
    byName: { ...automationStudioPerformanceCounters.byName, [key]: (automationStudioPerformanceCounters.byName[key] ?? 0) + amount },
    events: appendBoundedCounterEvents(automationStudioPerformanceCounters.events, event)
  };
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<AutomationStudioPerformanceCounterEvent>("automation-studio:performance-counter", { detail: event }));
  notifyAutomationStudioPerformanceSubscribers();
}

export function automationStudioCounterKey(kind: AutomationStudioPerformanceCounterKind, name: string): string {
  return `${kind}:${name}`;
}

export function useUiLongTaskMetrics(scope: string): void {
  useEffect(() => {
    if (!uiPerformanceRenderHooksEnabled()) return;
    return startUiLongTaskObserver(scope, (detail) => {
      window.dispatchEvent(new CustomEvent<UiLongTaskMetric>("ui-long-task:metric", { detail }));
      for (const violation of evaluateLongTaskBudget(detail)) {
        window.dispatchEvent(new CustomEvent("ui-performance:budget-violation", { detail: violation }));
      }
    });
  }, [scope]);
}

export function startUiLongTaskObserver(scope: string, onMetric: (metric: UiLongTaskMetric) => void): (() => void) | undefined {
  if (typeof PerformanceObserver === "undefined") return undefined;
  if (PerformanceObserver.supportedEntryTypes && !PerformanceObserver.supportedEntryTypes.includes("longtask")) return undefined;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) onMetric(uiLongTaskMetricFromEntry(scope, entry));
  });
  try {
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    observer.disconnect();
    return undefined;
  }
  return () => observer.disconnect();
}

export function uiLongTaskMetricFromEntry(scope: string, entry: Pick<PerformanceEntry, "name" | "startTime" | "duration">): UiLongTaskMetric {
  return { scope, name: entry.name, startTime: entry.startTime, duration: entry.duration, recordedAt: performance.now() };
}

function uiPerformanceRenderHooksEnabled(): boolean {
  return typeof window !== "undefined" && window.__FLUXIQ_ENABLE_UI_PERFORMANCE_COUNTERS__ === true;
}
function uiPerformanceInstrumentationEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return typeof window !== "undefined" && window.__FLUXIQ_ENABLE_UI_PERFORMANCE_COUNTERS__ === true;
}

function notifyAutomationStudioPerformanceSubscribers(): void {
  for (const subscriber of automationStudioPerformanceSubscribers) subscriber();
}

function appendBoundedCounterEvents(events: AutomationStudioPerformanceCounterEvent[], event: AutomationStudioPerformanceCounterEvent, limit = 500): AutomationStudioPerformanceCounterEvent[] {
  return [...events.slice(-(limit - 1)), event];
}

function nowForUiPerformance(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}



