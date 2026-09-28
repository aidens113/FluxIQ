import { isDirtyAutomationView, subscribeDirtyViewRegistry } from "../dirty-view-registry";
import { trackAutomationSubscription } from "../../testing/resource-telemetry";

export type AutomationViewActivityRef = { current: boolean };

// How many inactive views stay mounted. Everything a view holds in `useState`
// dies with its mount, and these views hold a great deal: the State view keeps
// its mode, source, phase and selected evidence; Problems keeps six filters and
// its page cursor; the Router keeps an in-progress route draft. At six on a
// desktop and three on a narrow screen, opening a fourth tab silently threw
// away the first one's filters, and the person had set those filters two
// seconds earlier.
//
// Eviction already refuses to drop an active view or a dirty one, so the cap is
// only a bound on memory, never a correctness rule. Raising it costs mounted
// React trees, which is why it is a cap at all and not simply removed; twelve
// covers every tab a pane can realistically hold now that a preview tab
// replaces rather than appends, and six still bounds a phone.
export const AUTOMATION_WARM_VIEW_DESKTOP_CAP = 12;
export const AUTOMATION_WARM_VIEW_CONSTRAINED_CAP = 6;

export type AutomationWarmViewRegistry = {
  activity(paneId: string, viewId: string): AutomationViewActivityRef;
  isWarm(paneId: string, viewId: string): boolean;
  markWarm(paneId: string, viewId: string): void;
  reconcileDirtyPins(): void;
  getRevision(): number;
  retainedCount(): number;
  setLimit(limit: number): void;
  subscribe(listener: () => void): () => void;
  reset(projectKey: string): void;
};

export function createAutomationWarmViewRegistry(options: {
  projectKey: string;
  limit?: number;
  isDirty?: (viewId: string) => boolean;
  eligible?: (viewId: string) => boolean;
}): AutomationWarmViewRegistry {
  let projectKey = options.projectKey;
  let limit = normalizedLimit(options.limit ?? AUTOMATION_WARM_VIEW_DESKTOP_CAP);
  let revision = 0;
  let clock = 0;
  const warmKeys = new Map<string, { paneId: string; viewId: string; usedAt: number }>();
  const activityByKey = new Map<string, AutomationViewActivityRef>();
  const listeners = new Set<() => void>();
  const keyFor = (paneId: string, viewId: string) => `${projectKey}:${paneId}:${viewId}`;
  const publish = () => {
    revision += 1;
    for (const listener of listeners) listener();
  };
  const evict = () => {
    let changed = false;
    while (warmKeys.size > limit) {
      const candidate = [...warmKeys.entries()]
        .filter(([key, value]) => !activityByKey.get(key)?.current && !(options.isDirty ?? isDirtyAutomationView)(value.viewId))
        .sort((left, right) => left[1].usedAt - right[1].usedAt)[0];
      if (!candidate) break;
      warmKeys.delete(candidate[0]);
      activityByKey.delete(candidate[0]);
      changed = true;
    }
    return changed;
  };

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
      const key = keyFor(paneId, viewId);
      if (options.eligible && !options.eligible(viewId)) {
        if (warmKeys.delete(key)) publish();
        return;
      }
      const existed = warmKeys.has(key);
      warmKeys.set(key, { paneId, viewId, usedAt: ++clock });
      const evicted = evict();
      if (!existed || evicted) publish();
    },
    reconcileDirtyPins() {
      if (evict()) publish();
    },
    getRevision: () => revision,
    retainedCount: () => warmKeys.size,
    setLimit(nextLimit) {
      const next = normalizedLimit(nextLimit);
      if (next === limit) return;
      limit = next;
      if (evict()) publish();
    },
    subscribe(listener) {
      const releaseTelemetry = trackAutomationSubscription();
      listeners.add(listener);
      return () => { listeners.delete(listener); releaseTelemetry(); };
    },
    reset(nextProjectKey) {
      projectKey = nextProjectKey;
      warmKeys.clear();
      activityByKey.clear();
      publish();
    }
  };
}

export function subscribeAutomationWarmViewRegistryToDirtyViews(
  warm: AutomationWarmViewRegistry
): () => void {
  return subscribeDirtyViewRegistry(warm.reconcileDirtyPins);
}

function normalizedLimit(limit: number): number {
  return Math.max(1, Math.floor(limit));
}
