"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { AutomationStudioCacheStats } from "../controllers/useAutomationStudioCache";
import type { ProgramApiMetric, ProgramApiRequestMetric } from "../../programs/program-api";
import type { AutomationStudioPerformanceCountersSnapshot, UiLongTaskMetric, UiRenderMetric } from "../../programs/ui-performance";

declare global {
  interface Window {
    __FLUXIQ_ENABLE_AUTOMATION_STUDIO_TELEMETRY__?: boolean;
  }
}
export type AutomationStudioGraphMetric = {
  graphId: string;
  nodesMounted: number;
  edgesMounted: number;
  nodesCached: number;
  edgesCached: number;
};

export type AutomationStudioSubscriptionMetric = {
  id: string;
  kind: "push" | "poll" | "event";
  active: boolean;
  intervalMs?: number;
};

export type AutomationStudioWorkerQueueMetric = {
  id: string;
  queued: number;
  active: number;
};

export type AutomationStudioDevelopmentSnapshot = {
  activeRequests: ProgramApiRequestMetric[];
  apiMetrics: ProgramApiMetric[];
  renderMetrics: UiRenderMetric[];
  longTasks: UiLongTaskMetric[];
  cache: AutomationStudioCacheStats;
  graph: AutomationStudioGraphMetric | null;
  counters: AutomationStudioPerformanceCountersSnapshot;
  subscriptions: AutomationStudioSubscriptionMetric[];
  workerQueues: AutomationStudioWorkerQueueMetric[];
};

const EMPTY_CACHE = { entryCount: 0, estimatedBytes: 0, scopes: {} };
const EMPTY_COUNTERS: AutomationStudioPerformanceCountersSnapshot = { counts: { "studio-shell-render": 0, "view-render": 0, "request-lifecycle": 0, "hierarchy-save-request": 0, "draft-write": 0 }, byName: {}, events: [] };
let snapshot: AutomationStudioDevelopmentSnapshot = {
  activeRequests: [],
  apiMetrics: [],
  renderMetrics: [],
  longTasks: [],
  cache: EMPTY_CACHE,
  graph: null,
  counters: EMPTY_COUNTERS,
  subscriptions: [],
  workerQueues: []
};
const subscribers = new Set<() => void>();
let stopListeners: (() => void) | null = null;
let listenerUsers = 0;

export function useAutomationStudioDevelopmentTelemetry(): void {
  useEffect(() => {
    if (!automationStudioDevelopmentTelemetryEnabled()) return;
    return startAutomationStudioDevelopmentTelemetry({ force: true });
  }, []);
}

export function useAutomationStudioDevelopmentSnapshot(): AutomationStudioDevelopmentSnapshot {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    return startAutomationStudioDevelopmentTelemetry({ force: true });
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function startAutomationStudioDevelopmentTelemetry(options: { force?: boolean } = {}): () => void {
  if (!options.force && !automationStudioDevelopmentTelemetryEnabled()) return () => undefined;
  listenerUsers += 1;
  if (!stopListeners && typeof window !== "undefined") stopListeners = installListeners();
  return () => {
    listenerUsers = Math.max(0, listenerUsers - 1);
    if (!listenerUsers) {
      stopListeners?.();
      stopListeners = null;
    }
  };
}

export function emitAutomationStudioGraphMetric(metric: AutomationStudioGraphMetric): void {
  emitDevelopmentMetric("automation-studio:graph-metric", metric);
}

export function registerAutomationStudioDevelopmentSubscription(metric: Omit<AutomationStudioSubscriptionMetric, "active">): () => void {
  emitDevelopmentMetric("automation-studio:subscription-metric", { ...metric, active: true });
  return () => emitDevelopmentMetric("automation-studio:subscription-metric", { ...metric, active: false });
}

export function emitAutomationStudioWorkerQueueMetric(metric: AutomationStudioWorkerQueueMetric): void {
  emitDevelopmentMetric("automation-studio:worker-queue-metric", metric);
}

function installListeners(): () => void {
  const onRequest = (event: Event) => {
    const metric = (event as CustomEvent<ProgramApiRequestMetric>).detail;
    const active = new Map(snapshot.activeRequests.map((item) => [item.requestId, item]));
    if (metric.phase === "started") active.set(metric.requestId, metric);
    else active.delete(metric.requestId);
    update({ activeRequests: [...active.values()] });
  };
  const onApi = (event: Event) => update({ apiMetrics: appendBounded(snapshot.apiMetrics, (event as CustomEvent<ProgramApiMetric>).detail) });
  const onRender = (event: Event) => update({ renderMetrics: appendBounded(snapshot.renderMetrics, (event as CustomEvent<UiRenderMetric>).detail) });
  const onLongTask = (event: Event) => update({ longTasks: appendBounded(snapshot.longTasks, (event as CustomEvent<UiLongTaskMetric>).detail) });
  const onCache = (event: Event) => update({ cache: (event as CustomEvent<AutomationStudioCacheStats>).detail });
  const onGraph = (event: Event) => update({ graph: (event as CustomEvent<AutomationStudioGraphMetric>).detail });
  const onCounter = (event: Event) => {
    const detail = (event as CustomEvent<AutomationStudioPerformanceCountersSnapshot["events"][number]>).detail;
    update({ counters: { counts: { ...snapshot.counters.counts, [detail.kind]: (snapshot.counters.counts[detail.kind] ?? 0) + detail.amount }, byName: { ...snapshot.counters.byName, [`${detail.kind}:${detail.name}`]: (snapshot.counters.byName[`${detail.kind}:${detail.name}`] ?? 0) + detail.amount }, events: appendBounded(snapshot.counters.events, detail) } });
  };
  const onSubscription = (event: Event) => {
    const metric = (event as CustomEvent<AutomationStudioSubscriptionMetric>).detail;
    const current = new Map(snapshot.subscriptions.map((item) => [item.id, item]));
    if (metric.active) current.set(metric.id, metric);
    else current.delete(metric.id);
    update({ subscriptions: [...current.values()] });
  };
  const onWorker = (event: Event) => {
    const metric = (event as CustomEvent<AutomationStudioWorkerQueueMetric>).detail;
    const current = new Map(snapshot.workerQueues.map((item) => [item.id, item]));
    current.set(metric.id, metric);
    update({ workerQueues: [...current.values()] });
  };
  const listeners: Array<[string, EventListener]> = [
    ["program-api:request", onRequest],
    ["program-api:metric", onApi],
    ["ui-render:metric", onRender],
    ["ui-long-task:metric", onLongTask],
    ["automation-studio:cache-metric", onCache],
    ["automation-studio:graph-metric", onGraph],
    ["automation-studio:performance-counter", onCounter],
    ["automation-studio:subscription-metric", onSubscription],
    ["automation-studio:worker-queue-metric", onWorker]
  ];
  for (const [name, listener] of listeners) window.addEventListener(name, listener);
  return () => {
    for (const [name, listener] of listeners) window.removeEventListener(name, listener);
  };
}

function emitDevelopmentMetric(name: string, detail: unknown): void {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  if (!listenerUsers && !automationStudioDevelopmentTelemetryEnabled()) return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function automationStudioDevelopmentTelemetryEnabled(): boolean {
  return process.env.NODE_ENV !== "production"
    && typeof window !== "undefined"
    && window.__FLUXIQ_ENABLE_AUTOMATION_STUDIO_TELEMETRY__ === true;
}

function appendBounded<T>(items: T[], item: T, limit = 200): T[] {
  return [...items.slice(-(limit - 1)), item];
}

function update(change: Partial<AutomationStudioDevelopmentSnapshot>): void {
  snapshot = { ...snapshot, ...change };
  for (const subscriber of subscribers) subscriber();
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function getSnapshot(): AutomationStudioDevelopmentSnapshot {
  return snapshot;
}
