export type AutomationViewActivityRef = { current: boolean };

export type AutomationWarmViewRegistry = {
  activity(paneId: string, viewId: string): AutomationViewActivityRef;
  isWarm(paneId: string, viewId: string): boolean;
  markWarm(paneId: string, viewId: string): void;
  reset(projectKey: string): void;
};

export function createAutomationWarmViewRegistry(options: {
  projectKey: string;
}): AutomationWarmViewRegistry {
  let projectKey = options.projectKey;
  const warmKeys = new Set<string>();
  const activityByKey = new Map<string, AutomationViewActivityRef>();
  const keyFor = (paneId: string, viewId: string) => `${projectKey}:${paneId}:${viewId}`;

  return {
    activity(paneId, viewId) {
      const key = keyFor(paneId, viewId);
      const existing = activityByKey.get(key);
      if (existing) return existing;
      const activity = { current: false };
      activityByKey.set(key, activity);
      return activity;
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
    }
  };
}
