"use client";

import { useCallback, useMemo, useSyncExternalStore, type ComponentProps } from "react";
import { AutomationHierarchyDialog } from "../hierarchy/AutomationHierarchyDialog";
import { automationEntityScope, type AutomationStudioStores } from "../stores";
import { resolveActionPreviewEntryId } from "../model/timeline-resolution";
import { RecordingActionPreviewDock } from "../recordings";
import type { ScopedExternalStore } from "../stores/external-store";
import { AutomationHierarchySurface } from "./AutomationHierarchySurface";

type ProjectViewSnapshot = ReturnType<() => any>;

const hierarchyProjectScopes = Object.freeze([
  automationEntityScope("flows"),
  automationEntityScope("recordings"),
  automationEntityScope("timelines"),
  "resource:snapshot",
  "resource:pipelineArtifacts",
  "resource:projectArtifacts",
  "resource:customHierarchyNodes",
  "resource:deletedHierarchyIds"
]);
const hierarchySelectionScopes = Object.freeze(["selection", "recording-primary"]);
const timelineProjectScopes = Object.freeze([
  automationEntityScope("recordings"),
  automationEntityScope("timelines")
]);
const timelineSelectionScopes = Object.freeze(["selection", "state-open", "preview"]);

type HierarchySurfaceProps = ComponentProps<typeof AutomationHierarchySurface>;

export function AutomationStudioConnectedHierarchy(props: {
  dialog: {
    execute: ComponentProps<typeof AutomationHierarchyDialog>["execute"];
    store: ComponentProps<typeof AutomationHierarchyDialog>["store"];
  };
  getProjectView(): ProjectViewSnapshot;
  stores: AutomationStudioStores;
  surface: Omit<HierarchySurfaceProps, "nodes" | "recordingPrimaryKind" | "selection">;
}) {
  const projectRevision = useScopedRevision(props.stores.projectData, hierarchyProjectScopes);
  useScopedRevision(props.stores.selection, hierarchySelectionScopes);
  const view = useMemo(
    () => props.getProjectView(),
    [projectRevision, props.getProjectView]
  );
  const selectionState = props.stores.selection.getState();
  const surfaceProps = {
    ...props.surface,
    nodes: view.hierarchyNodes,
    recordingPrimaryKind: selectionState.recordingPrimaryKind === "recording" ? "recording" as const : null,
    selection: selectionState.selection
  } as HierarchySurfaceProps;

  return <>
    <AutomationHierarchyDialog
      execute={props.dialog.execute}
      nodes={view.hierarchyNodes}
      store={props.dialog.store}
    />
    <AutomationHierarchySurface {...surfaceProps} />
  </>;
}

export function AutomationStudioConnectedTimeline(props: {
  onSelectAction(entryId: string): void;
  stores: AutomationStudioStores;
}) {
  const projectRevision = useScopedRevision(props.stores.projectData, timelineProjectScopes);
  const selectionRevision = useTimelineSelectionRevision(props.stores.selection);
  const selectionState = props.stores.selection.getState();
  const timeline = useMemo(() => resolveTimelineModel(
    props.stores.projectData.getState(),
    selectionState
  ), [projectRevision, selectionRevision, props.stores.projectData]);
  const sourceEntryId = selectionState.pendingStateOpen?.timelineEntryId
    ?? selectionState.bottomPreviewEntryId
    ?? (selectionState.selection?.kind === "state" && selectionState.selection.timelineEntryId
      ? selectionState.selection.timelineEntryId
      : undefined);
  const activePreviewEntryId = resolveActionPreviewEntryId(
    timeline.selectedTimeline ?? timeline.selectedRecording,
    sourceEntryId
  );

  return (
    <RecordingActionPreviewDock
      entries={timeline.selectedTimeline?.timeline ?? timeline.selectedRecording?.timeline ?? []}
      onSelectAction={props.onSelectAction}
      {...(activePreviewEntryId ? { selectedEntryId: activePreviewEntryId } : {})}
    />
  );
}

function useTimelineSelectionRevision(store: AutomationStudioStores["selection"]): string {
  const subscribe = useCallback((listener: () => void) => {
    const unsubscribes = timelineSelectionScopes.map((scope) => store.subscribe(listener, scope));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [store]);
  const getSnapshot = useCallback(() => {
    const state = store.getState();
    const selection = state.selection;
    const selectionKey = selection?.kind === "recording" || selection?.kind === "timeline"
      ? `${selection.kind}:${selection.id}`
      : selection?.kind === "state"
        ? `state:${selection.recordingId ?? ""}:${selection.timelineEntryId ?? ""}`
        : "unrelated";
    return [
      selectionKey,
      state.pendingStateOpen?.recordingId ?? "",
      state.pendingStateOpen?.timelineEntryId ?? "",
      state.bottomPreviewEntryId ?? ""
    ].join(":");
  }, [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function resolveTimelineModel(projectData: AutomationStudioStores["projectData"]["getState"] extends () => infer State ? State : never, selectionState: AutomationStudioStores["selection"]["getState"] extends () => infer State ? State : never) {
  const recordings = projectData.entities.recordings;
  const timelines = [...projectData.entities.timelines.values()] as any[];
  const selection = selectionState.selection;
  let selectedTimeline: any | null = null;
  let recordingId: string | null = null;
  if (selection?.kind === "recording") recordingId = selection.id;
  if (selection?.kind === "timeline") {
    selectedTimeline = timelines.find((candidate) =>
      candidate?.normalizedTimelineId === selection.id
      || candidate?.timeline?.some((entry: any) => entry?.id === selection.id)
    ) ?? null;
    recordingId = selectedTimeline?.recordingId ?? null;
  }
  if (selection?.kind === "state") {
    recordingId = selection.recordingId ?? null;
    if (!recordingId && selection.timelineEntryId) {
      selectedTimeline = timelines.find((candidate) =>
        candidate?.timeline?.some((entry: any) => entry?.id === selection.timelineEntryId)
      ) ?? null;
      recordingId = selectedTimeline?.recordingId ?? null;
    }
  }
  if (!selection) recordingId = projectData.entityIds.recordings[0] ?? null;
  const selectedRecording = recordingId ? recordings.get(recordingId) as any ?? null : null;
  if (!selectedTimeline && recordingId) {
    selectedTimeline = timelines.find((candidate) => candidate?.recordingId === recordingId) ?? null;
  }
  return { selectedRecording, selectedTimeline };
}

function useScopedRevision<State>(store: ScopedExternalStore<State>, scopes: readonly string[]): string {
  const scopeKey = scopes.join("\u001f");
  const subscribe = useCallback((listener: () => void) => {
    const unsubscribes = scopes.map((scope) => store.subscribe(listener, scope));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [scopeKey, store]);
  const getSnapshot = useCallback(
    () => scopes.map((scope) => store.getRevision(scope)).join(":"),
    [scopeKey, store]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
