import type { AutomationWorkspaceRegion } from "../layout/contracts";

export type AutomationViewActivityRef = { current: boolean };

export type AutomationWarmViewRegistry = {
  activity(paneId: string, viewId: string): AutomationViewActivityRef;
  activate(region: Exclude<AutomationWorkspaceRegion, "bottom">, paneId: string, viewId: string): boolean;
  isWarm(paneId: string, viewId: string): boolean;
  markWarm(paneId: string, viewId: string): void;
  reset(projectKey: string): void;
  subscribe(paneId: string, listener: (viewId: string) => void): () => void;
};

export function createAutomationWarmViewRegistry(options: {
  projectKey: string;
}): AutomationWarmViewRegistry {
  let projectKey = options.projectKey;
  const warmKeys = new Set<string>();
  const activityByKey = new Map<string, AutomationViewActivityRef>();
  const listenersByPane = new Map<string, Set<(viewId: string) => void>>();
  const keyFor = (paneId: string, viewId: string) => `${projectKey}:${paneId}:${viewId}`;
  const prefixFor = (paneId: string) => `${projectKey}:${paneId}:`;

  return {
    activity(paneId, viewId) {
      const key = keyFor(paneId, viewId);
      const existing = activityByKey.get(key);
      if (existing) return existing;
      const activity = { current: false };
      activityByKey.set(key, activity);
      return activity;
    },
    activate(_region, paneId, viewId) {
      const key = keyFor(paneId, viewId);
      if (!warmKeys.has(key)) return false;
      const changed: Array<[AutomationViewActivityRef, boolean]> = [];
      for (const [candidateKey, activity] of activityByKey) {
        if (!candidateKey.startsWith(prefixFor(paneId))) continue;
        changed.push([activity, activity.current]);
        activity.current = candidateKey === key;
      }
      const listeners = listenersByPane.get(paneId);
      if (listeners?.size) {
        for (const listener of listeners) listener(viewId);
        return true;
      }
      for (const [activity, previous] of changed) activity.current = previous;
      return false;
    },
    isWarm(paneId, viewId) {
      return warmKeys.has(keyFor(paneId, viewId));
    },
    markWarm(paneId, viewId) {
      warmKeys.add(keyFor(paneId, viewId));
    },
    reset(nextProjectKey) {
      projectKey = nextProjectKey;
      warmKeys.clear();
      activityByKey.clear();
      listenersByPane.clear();
    },
    subscribe(paneId, listener) {
      const listeners = listenersByPane.get(paneId) ?? new Set<(viewId: string) => void>();
      listeners.add(listener);
      listenersByPane.set(paneId, listeners);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) listenersByPane.delete(paneId);
      };
    }
  };
}
