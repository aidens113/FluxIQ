"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CurrentUser } from "../../programs/types";
import { automationStudioCurrentSearchParams, replaceAutomationStudioBrowserUrl } from "../model/live-helpers";
import { automationStudioDeepLinkParams } from "../navigation";
import { useAutomationProjectDeepLink, useAutomationProjectLifecycle, type AutomationProjectHydration } from "../project";
import { defaultAutomationWorkspacePrefs, normalizeAutomationWorkspacePrefs, type AutomationWorkspacePrefs } from "../workspace/layout";
import { automationWorkspacePrefsSameRuntimeState } from "../model/workspace-persistence";
import { mergeById } from "../model/project-artifacts";
import { mergeFlowDetails, mergeRecordingDetail } from "../model/project-change-reconciliation";
import { projectRuntimeSummaryFlowState, projectRuntimeSummaryPipelineState, projectRuntimeSummaryProjection, projectRuntimeSummaryRecordingState } from "../model/project-runtime-summary";
import type { AutomationLiveDomainCommands } from "./domain-commands";
import type { useAutomationStudioFoundation } from "./useAutomationStudioFoundation";

type Foundation = ReturnType<typeof useAutomationStudioFoundation>;
type Options = {
  currentUserId: CurrentUser["id"];
  pathname: string;
  activeProjectId: string | null;
  urlProjectId: string | null;
  foundation: Pick<Foundation, "projectDataPlatform" | "projectGeneration" | "uiCache" | "liveCommands" | "requests"> & {
    stores: Foundation["owners"]["studioStores"];
  };
  hierarchy: {
    getUiRevision: () => number;
    setLoadedProjectId: (value: string | null) => void;
    setCustomNodes: (value: any) => void;
    setDeletedIds: (value: any) => void;
    hydrateSidebar: (value: any) => void;
    markPersisted: (value: any) => void;
    reset: () => void;
  };
  workspace: {
    getPrefsRevision: () => number;
    replacePrefs: (value: AutomationWorkspacePrefs | ((current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs)) => void;
    resetCachedPrefs: () => void;
  };
  data: {
    setDirty: (value: boolean) => void;
    setProjectRecordings: (value: any) => void;
    setPipelineArtifacts: (value: any) => void;
    setProjectFlows: (value: any) => void;
    setRuntimeSessions: (value: any) => void;
    setNativeNodeDefinitions: (value: any) => void;
    setPublishedFlowDefinitions: (value: any) => void;
    setProjectTimelines: (value: any) => void;
  };
  schedule: (commit: () => void) => void;
};

export function useAutomationProjectRuntime(options: Options) {
  const activeProjectRef = useRef<string | null>(null);
  const openingUiRevisionRef = useRef<{ projectId: string; workspace: number; hierarchy: number } | null>(null);
  useEffect(() => { activeProjectRef.current = options.activeProjectId; }, [options.activeProjectId]);
  const applySummary = useCallback((summary: any | null) => {
    if (summary) {
      options.data.setProjectRecordings((current: any[]) => projectRuntimeSummaryRecordingState(summary, current));
      options.data.setPipelineArtifacts((current: any) => projectRuntimeSummaryPipelineState(summary, current));
      options.data.setProjectFlows((current: any[]) => projectRuntimeSummaryFlowState(summary, current));
      options.data.setRuntimeSessions(projectRuntimeSummaryProjection(summary).runtimeSessions ?? []);
    }
    return projectRuntimeSummaryProjection(summary);
  }, [options.data]);
  const cancel = useCallback((projectId: string | null) => {
    options.foundation.requests.cancelAll();
    options.foundation.projectDataPlatform.closeProject(projectId);
    if (projectId) options.foundation.uiCache.cancelProject(projectId);
  }, [options.foundation]);
  const reset = useCallback((nextProjectId: string | null) => {
    activeProjectRef.current = nextProjectId;
    const stores = options.foundation.stores;
    stores.transaction(() => {
      stores.projectData.clearProject();
      stores.projectData.activate(nextProjectId);
      stores.catalog.activate(nextProjectId);
      stores.selection.select(null);
      stores.selection.requestStateOpen(null);
      stores.selection.setBottomPreview(null);
      stores.runtimeStatus.setActionStatus("");
      stores.runtimeStatus.setFlowRunState({ phase: "idle", message: "Ready." });
      stores.runtimeStatus.setRecordingProcessing(null);
    });
    options.hierarchy.setLoadedProjectId(null);
    options.hierarchy.setCustomNodes([]);
    options.hierarchy.setDeletedIds([]);
    options.data.setDirty(false);
    options.hierarchy.reset();
    options.workspace.resetCachedPrefs();
    options.workspace.replacePrefs(defaultAutomationWorkspacePrefs());
  }, [options.data, options.foundation.stores, options.hierarchy, options.workspace]);
  const clear = useCallback((projectId: string | null) => { cancel(projectId); reset(null); }, [cancel, reset]);
  const commit = useCallback((projectId: string, hydration: AutomationProjectHydration) => {
    if (activeProjectRef.current !== projectId) return;
    const commitGeneration = options.foundation.projectGeneration.current();
    const loadedPrefs = normalizeAutomationWorkspacePrefs(hydration.hierarchy.workspacePrefs ?? defaultAutomationWorkspacePrefs());
    options.hierarchy.setCustomNodes(hydration.hierarchy.customHierarchyNodes);
    options.hierarchy.setDeletedIds(hydration.hierarchy.deletedHierarchyIds);
    const openingUi = openingUiRevisionRef.current;
    const workspaceIsUntouched = openingUi?.projectId === projectId
      && options.workspace.getPrefsRevision() === openingUi.workspace;
    const hierarchyIsUntouched = openingUi?.projectId === projectId
      && options.hierarchy.getUiRevision() === openingUi.hierarchy;
    if (workspaceIsUntouched) options.workspace.replacePrefs(loadedPrefs);
    const cacheHydrationRevision = options.workspace.getPrefsRevision();
    if (hydration.summary) applySummary(hydration.summary);
    if (workspaceIsUntouched) options.foundation.uiCache.hydrateWorkspacePrefs({
      projectId,
      userId: options.currentUserId,
      durablePrefs: loadedPrefs,
      onHydrate: (cachedPrefs) => {
        if (activeProjectRef.current !== projectId
          || !options.foundation.projectGeneration.isCurrent(commitGeneration)
          || options.workspace.getPrefsRevision() !== cacheHydrationRevision) return;
        options.workspace.replacePrefs((current) => automationWorkspacePrefsSameRuntimeState(current, cachedPrefs) ? current : cachedPrefs);
      }
    });
    const cacheHierarchyRevision = options.hierarchy.getUiRevision();
    if (hierarchyIsUntouched) options.foundation.uiCache.hydrateSidebar({
      projectId,
      userId: options.currentUserId,
      onHydrate: (sidebar) => {
        if (activeProjectRef.current === projectId
          && options.foundation.projectGeneration.isCurrent(commitGeneration)
          && options.hierarchy.getUiRevision() === cacheHierarchyRevision) {
          options.hierarchy.hydrateSidebar(sidebar);
        }
      }
    });
    options.hierarchy.markPersisted({
      customNodes: hydration.hierarchy.customHierarchyNodes,
      deletedIds: hydration.hierarchy.deletedHierarchyIds,
      workspacePrefs: loadedPrefs
    });
    options.foundation.stores.catalog.setError(null);
    options.hierarchy.setLoadedProjectId(projectId);
  }, [applySummary, options]);
  const lifecycle = useAutomationProjectLifecycle({
    generation: options.foundation.projectGeneration,
    adapters: {
      publishOpening(projectId) {
        cancel(activeProjectRef.current);
        options.foundation.projectDataPlatform.openProject(projectId);
        reset(projectId);
        openingUiRevisionRef.current = {
          projectId,
          workspace: options.workspace.getPrefsRevision(),
          hierarchy: options.hierarchy.getUiRevision()
        };
        options.foundation.stores.catalog.setError(null);
      },
      hydrate: (projectId, signal) => options.foundation.projectDataPlatform.loadHydration(projectId, signal),
      commit,
      fail(projectId, error) {
        clear(projectId);
        options.foundation.stores.catalog.setError(error instanceof Error ? error.message : "Project could not be opened.");
      },
      clear
    },
    setProjectUrl(projectId) {
      replaceAutomationStudioBrowserUrl(options.pathname, automationStudioDeepLinkParams({ projectId }, automationStudioCurrentSearchParams()));
    }
  });
  useAutomationProjectDeepLink({ activeProjectId: options.activeProjectId, projectId: options.urlProjectId, openProject: lifecycle.openProject });
  const notifyChanged = useCallback((scopes: Parameters<Foundation["projectDataPlatform"]["notifyMutation"]>[0], resourceIds: string[] = []) => {
    options.foundation.projectDataPlatform.notifyMutation(scopes, [...new Set(resourceIds)]);
  }, [options.foundation.projectDataPlatform]);
  const refreshRuntime = useCallback(async (projectId = options.activeProjectId) => {
    if (!projectId) return;
    const generation = options.foundation.projectGeneration.current();
    const summary = await options.foundation.requests.runLatest("runtime-summary", (signal) => options.foundation.projectDataPlatform.loadRuntimeSummary(projectId, signal));
    if (summary === undefined || activeProjectRef.current !== projectId || !options.foundation.projectGeneration.isCurrent(generation)) return;
    return applySummary(summary);
  }, [applySummary, options.activeProjectId, options.foundation.projectDataPlatform, options.foundation.requests]);
  const loadFlowDetails = useCallback(async (flowId: string) => {
    if (!flowId) return null;
    const generation = options.foundation.projectGeneration.current();
    const outcome = await options.foundation.liveCommands.loadFlowDetail<any>(flowId);
    if (outcome.status !== "success" || !options.foundation.projectGeneration.isCurrent(generation)) return null;
    options.schedule(() => options.data.setProjectFlows((current: any[]) => mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow: outcome.value.flow }])));
    return outcome.value.flow;
  }, [options.data, options.foundation.liveCommands, options.schedule]);
  const loadNodeDefinitions = useCallback(async () => {
    const generation = options.foundation.projectGeneration.current();
    const outcome = await options.foundation.liveCommands.loadNodeDefinitions<any>();
    if (outcome.status !== "success" || !options.foundation.projectGeneration.isCurrent(generation)) return;
    options.schedule(() => {
      options.data.setNativeNodeDefinitions((current: any) => current === outcome.value.native ? current : outcome.value.native);
      options.data.setPublishedFlowDefinitions((current: any) => current === outcome.value.published ? current : outcome.value.published);
    });
  }, [options.data, options.foundation.liveCommands, options.schedule]);
  const loadTimeline = useCallback(async (recordingId: string) => {
    const generation = options.foundation.projectGeneration.current();
    const timeline = await options.foundation.liveCommands.loadLatestNormalizedTimeline<any>(recordingId);
    if (timeline && options.foundation.projectGeneration.isCurrent(generation)) {
      options.data.setProjectTimelines((current: any[]) => mergeById([timeline], current, "normalizedTimelineId"));
    }
    return timeline;
  }, [options.data, options.foundation.liveCommands]);
  const loadRecording = useCallback(async (recordingId: string) => {
    const generation = options.foundation.projectGeneration.current();
    const recording = await options.foundation.liveCommands.loadRecordingDetail<any>(recordingId);
    if (recording && options.foundation.projectGeneration.isCurrent(generation)) {
      options.schedule(() => {
        if (options.foundation.projectGeneration.isCurrent(generation)) {
          options.data.setProjectRecordings((current: any[]) => mergeRecordingDetail(current, recording));
        }
      });
    }
    return recording;
  }, [options.data, options.foundation.liveCommands, options.schedule]);
  return { ...lifecycle, activeProjectRef, loadFlowDetails, loadNodeDefinitions, loadRecording, loadTimeline, notifyChanged, refreshRuntime };
}
