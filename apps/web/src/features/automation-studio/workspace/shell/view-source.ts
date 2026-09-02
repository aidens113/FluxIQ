"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { AutomationWorkspaceViewEntry, AutomationWorkspaceViewSource } from "./contracts";
import { trackAutomationSubscription } from "../../testing/resource-telemetry";

export const automationWorkspaceMaxSubscribedViews = 64;
const automationWorkspaceMaxViewIdsExamined = automationWorkspaceMaxSubscribedViews * 2;

export function createAutomationWorkspaceViewSource(
  entries: Iterable<readonly [string, AutomationWorkspaceViewEntry]> = []
): AutomationWorkspaceViewSource {
  const values = new Map(entries);
  const revisions = new Map<string, number>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    get: (viewId) => values.get(viewId) ?? null,
    getRevision: (viewId) => revisions.get(viewId) ?? 0,
    replace(viewId, entry) {
      if (values.get(viewId) === entry || (!values.has(viewId) && entry === null)) return false;
      if (entry) values.set(viewId, entry);
      else values.delete(viewId);
      revisions.set(viewId, (revisions.get(viewId) ?? 0) + 1);
      for (const listener of listeners.get(viewId) ?? []) listener();
      return true;
    },
    subscribe(viewId, listener) {
      const releaseTelemetry = trackAutomationSubscription();
      const viewListeners = listeners.get(viewId) ?? new Set<() => void>();
      viewListeners.add(listener);
      listeners.set(viewId, viewListeners);
      return () => {
        viewListeners.delete(listener);
        if (!viewListeners.size) listeners.delete(viewId);
        releaseTelemetry();
      };
    }
  };
}

export function boundedAutomationWorkspaceViewIds(
  viewIds: readonly string[],
  priorityViewId?: string
): string[] {
  const bounded: string[] = [];
  const seen = new Set<string>();
  const examined = Math.min(viewIds.length, automationWorkspaceMaxViewIdsExamined);
  for (let index = 0; index < examined && bounded.length < automationWorkspaceMaxSubscribedViews; index += 1) {
    const viewId = viewIds[index];
    if (!viewId || seen.has(viewId)) continue;
    seen.add(viewId);
    bounded.push(viewId);
  }
  if (priorityViewId && !seen.has(priorityViewId)) {
    if (bounded.length === automationWorkspaceMaxSubscribedViews) bounded.pop();
    bounded.push(priorityViewId);
  }
  return bounded;
}

export function useAutomationWorkspaceView(
  source: AutomationWorkspaceViewSource,
  viewId: string
): AutomationWorkspaceViewEntry | null {
  const subscribe = useCallback((listener: () => void) => source.subscribe(viewId, listener), [source, viewId]);
  const getRevision = useCallback(() => source.getRevision(viewId), [source, viewId]);
  useSyncExternalStore(subscribe, getRevision, getRevision);
  return source.get(viewId);
}

export function useAutomationWorkspaceViews(
  source: AutomationWorkspaceViewSource,
  viewIds: readonly string[],
  priorityViewId?: string
): AutomationWorkspaceViewEntry[] {
  const boundedIds = boundedAutomationWorkspaceViewIds(viewIds, priorityViewId);
  const key = boundedIds.join("\u0000");
  const subscribe = useCallback((listener: () => void) => {
    const unsubscribes = boundedIds.map((viewId) => source.subscribe(viewId, listener));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [key, source]);
  const getSnapshot = useCallback(
    () => boundedIds.map((viewId) => source.getRevision(viewId)).join(":"),
    [key, source]
  );
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return boundedIds
    .map((viewId) => source.get(viewId))
    .filter((entry): entry is AutomationWorkspaceViewEntry => Boolean(entry));
}
