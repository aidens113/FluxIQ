"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CurrentUser } from "../../programs/types";
import type { AutomationStudioUiCachePort } from "../workspace/cache";
import type { AutomationWorkspaceRenderStore } from "../workspace/render-store";
import { createAutomationWorkspaceCommandPort } from "../workspace/commands/port";
import { createAutomationWorkspaceCommands } from "../workspace/commands/workspace-commands";
import {
  AUTOMATION_WARM_VIEW_CONSTRAINED_CAP,
  AUTOMATION_WARM_VIEW_DESKTOP_CAP,
  createAutomationWarmViewRegistry,
  subscribeAutomationWarmViewRegistryToDirtyViews
} from "../workspace/commands/warm-activation";
import { normalizeAutomationWorkspacePrefs, type AutomationWorkspacePrefs } from "../workspace/layout";
import { persistentAutomationWorkspacePrefs } from "../model/workspace-persistence";
import { automationWorkspacePrefsSameRuntimeState } from "../model/workspace-persistence";
import { automationStudioViewDefinition } from "../views/view-registry";

export type AutomationWorkspaceRuntimeOptions = {
  activeProjectId: string | null;
  currentUserId: CurrentUser["id"];
  loadedProjectHierarchyId: string | null;
  uiCache: AutomationStudioUiCachePort;
  workspaceRenderStore: AutomationWorkspaceRenderStore;
  constrained?: boolean;
};

export function useAutomationWorkspaceRuntime(options: AutomationWorkspaceRuntimeOptions) {
  const queueRef = useRef<{ frame: number | null; timeout: number | null; flushing: boolean; commits: Array<() => void> }>({
    frame: null,
    timeout: null,
    flushing: false,
    commits: []
  });
  const lastCachedPrefsRef = useRef<AutomationWorkspacePrefs | null>(null);
  const lastCachedProjectRef = useRef<string | null>(null);
  const schedule = useCallback((commit: () => void) => {
    const queue = queueRef.current;
    if (queue.flushing) return commit();
    queue.commits.push(commit);
    if (queue.frame !== null || queue.timeout !== null) return;
    queue.frame = window.requestAnimationFrame(() => {
      queue.frame = null;
      queue.timeout = window.setTimeout(() => {
        queue.timeout = null;
        const commits = queue.commits.splice(0);
        queue.flushing = true;
        try {
          commits.forEach((queuedCommit) => queuedCommit());
        }
        finally { queue.flushing = false; }
      }, 0);
    });
  }, []);
  useEffect(() => () => {
    if (queueRef.current.frame !== null) window.cancelAnimationFrame(queueRef.current.frame);
    if (queueRef.current.timeout !== null) window.clearTimeout(queueRef.current.timeout);
    queueRef.current.commits.length = 0;
  }, []);

  const warm = useMemo(
    () => createAutomationWarmViewRegistry({
      projectKey: options.activeProjectId ?? "no-project",
      limit: options.constrained ? AUTOMATION_WARM_VIEW_CONSTRAINED_CAP : AUTOMATION_WARM_VIEW_DESKTOP_CAP,
      eligible: (viewId) => automationStudioViewDefinition(viewId)?.lifecycle.keepMounted === "warm"
    }),
    [options.activeProjectId]
  );
  useEffect(() => {
    warm.setLimit(options.constrained ? AUTOMATION_WARM_VIEW_CONSTRAINED_CAP : AUTOMATION_WARM_VIEW_DESKTOP_CAP);
  }, [options.constrained, warm]);
  useEffect(() => subscribeAutomationWarmViewRegistryToDirtyViews(warm), [warm]);
  const port = useMemo(() => createAutomationWorkspaceCommandPort(options.workspaceRenderStore, {
    schedule,
    onCommit: (prefs, commit) => {
      if (!options.activeProjectId || options.loadedProjectHierarchyId !== options.activeProjectId) return;
      const durablePrefs = persistentAutomationWorkspacePrefs(prefs);
      lastCachedProjectRef.current = options.activeProjectId;
      lastCachedPrefsRef.current = durablePrefs;
      options.uiCache.scheduleWorkspacePrefsWrite({
        projectId: options.activeProjectId,
        userId: options.currentUserId,
        prefs: durablePrefs,
        delayMs: commit.persist ? 200 : 80
      });
      if (!commit.persist) return;
      options.uiCache.markProjectUiMutation(options.activeProjectId);
      options.workspaceRenderStore.markSaveRequested();
    }
  }), [
    options.activeProjectId,
    options.currentUserId,
    options.loadedProjectHierarchyId,
    schedule,
    options.uiCache,
    options.workspaceRenderStore,
  ]);
  const commands = useMemo(() => createAutomationWorkspaceCommands({ port }), [port]);

  const updatePrefs = useCallback((
    updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs,
    updateOptions: { persist?: boolean } = {}
  ) => {
    const shouldPersist = updateOptions.persist === true;
    const current = options.workspaceRenderStore.getPrefs();
    const candidate = updater(current);
    if (candidate === current) return;
    const next = normalizeAutomationWorkspacePrefs(candidate);
    if (automationWorkspacePrefsSameRuntimeState(current, next)) return;
    if (options.activeProjectId && shouldPersist) options.uiCache.markProjectUiMutation(options.activeProjectId);
    options.workspaceRenderStore.replace(next);
    if (options.activeProjectId && options.loadedProjectHierarchyId === options.activeProjectId) {
      const prefs = persistentAutomationWorkspacePrefs(next);
      lastCachedProjectRef.current = options.activeProjectId;
      lastCachedPrefsRef.current = prefs;
      options.uiCache.scheduleWorkspacePrefsWrite({
        projectId: options.activeProjectId,
        userId: options.currentUserId,
        prefs,
        delayMs: shouldPersist ? 400 : 1_200
      });
    }
    if (shouldPersist) options.workspaceRenderStore.markSaveRequested();
  }, [options]);

  const resetCachedPrefs = useCallback(() => {
    lastCachedProjectRef.current = null;
    lastCachedPrefsRef.current = null;
  }, []);
  const replacePrefs = useCallback((nextOrUpdater: AutomationWorkspacePrefs | ((current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs)) => {
    const current = options.workspaceRenderStore.getPrefs();
    const next = typeof nextOrUpdater === "function" ? nextOrUpdater(current) : nextOrUpdater;
    if (next !== current) options.workspaceRenderStore.replace(next);
  }, [options.workspaceRenderStore]);

  return { commands, port, replacePrefs, resetCachedPrefs, schedule, updatePrefs, warm };
}
