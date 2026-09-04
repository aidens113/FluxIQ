"use client";

import { useCallback } from "react";
import type { NodeStatePhase } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationWorkspacePrefs } from "../workspace/layout";
import {
  automationStudioObjectViewInstanceId,
  automationStudioViewBaseId,
  automationStudioViewId,
  automationStudioViewObjectId
} from "../views/view-registry";
import type { createAutomationWorkspaceCommands } from "../workspace/commands/workspace-commands";
import type { AutomationLiveDomainCommands } from "./domain-commands";
import type { AutomationStatePublication } from "../state/commands";
import { isAutomationSelection, recordingIdFromStateSourceId, stateOpenNodeMetadata } from "../model/live-helpers";
import { stringRecordValue } from "../model/timeline-resolution";
import { resolveActionPreviewEntryId } from "../model/timeline-resolution";
import { runAutomationPresentationTransaction } from "../presentation/transaction";

type WorkspaceCommands = ReturnType<typeof createAutomationWorkspaceCommands>;
type StateRequest = { nodeId?: string; sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string; proposalId?: string; recordingId?: string; timelineEntryId?: string; stateSnapshotId?: string; repairAttempted?: boolean };
type NavigationOptions = {
  activeProjectId: string | null;
  workspacePrefs: AutomationWorkspacePrefs;
  commands: WorkspaceCommands;
  updatePrefs: (updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs, options?: { persist?: boolean }) => void;
  liveCommands: AutomationLiveDomainCommands;
  selection: AutomationSelection | null;
  selectedNode: any;
  selectedFlow: any;
  selectedProposal: any;
  selectedRecording: any;
  selectedTimeline: any;
  timelineEntryById: ReadonlyMap<string, { recordingId?: string | null }>;
  setSelection: (next: AutomationSelection | null | ((current: AutomationSelection | null) => AutomationSelection | null)) => void;
  setPendingStateOpen: (next: any) => void;
  setBottomPreviewEntryId: (next: string | null) => void;
  setRecordingPrimaryKind: (next: "recording" | null) => void;
  setIndexedStateSources: (next: any) => void;
  setActionStatus: (status: string) => void;
  getSnapshot?: () => Pick<
    NavigationOptions,
    "activeProjectId" | "workspacePrefs" | "selection" | "selectedNode" | "selectedFlow"
      | "selectedProposal" | "selectedRecording" | "selectedTimeline" | "timelineEntryById"
  >;
};

export function useAutomationSelectionNavigation(options: NavigationOptions) {
  const openView = useCallback((viewId: string, mode: "preview" | "new-pane-or-focus" = "preview") => {
    const current = options.getSnapshot?.() ?? options;
    const flowId = automationStudioViewObjectId(viewId)
      ?? flowIdForSelection(current.selection)
      ?? current.selectedFlow?.flowId
      ?? null;
    const instanceId = automationStudioObjectViewInstanceId(viewId, flowId);
    options.commands.openView(instanceId, mode);
    if (automationStudioViewBaseId(viewId) !== automationStudioViewId.flowEditor) return;
    if (current.selection?.kind === "flow"
      || current.selection?.kind === "editor-node"
      || current.selection?.kind === "editor-mode") return;
    const savedSelection = current.workspacePrefs.viewStates?.[instanceId]?.selection;
    if (isAutomationSelection(savedSelection)) options.setSelection(savedSelection);
  }, [options]);
  const showRecordingPreview = useCallback(() => {
    options.updatePrefs((current) => ({
      ...current,
      bottomDock: { ...current.bottomDock, activeViewId: "recording-action-preview", expanded: true },
      bottomTimelineCollapsed: false
    }), { persist: true });
  }, [options.updatePrefs]);
  const selectAndFollow = useCallback((next: AutomationSelection, flowMode: "preview" | "new-pane-or-focus" = "preview") => {
    runAutomationPresentationTransaction(() => {
      if (next.kind !== "state") options.setPendingStateOpen(null);
      if (next.kind === "timeline") options.setBottomPreviewEntryId(next.id);
      else if (next.kind !== "state") options.setBottomPreviewEntryId(null);
      options.setSelection(next);
      if ((next.kind === "editor-node" || next.kind === "editor-mode") && next.flowId) {
        options.updatePrefs((current) => {
          const instanceId = automationStudioObjectViewInstanceId(automationStudioViewId.flowEditor, next.flowId);
          const currentFlowState = current.viewStates?.[instanceId] ?? {};
          return {
            ...current,
            viewStates: {
              ...current.viewStates,
              [instanceId]: {
                ...currentFlowState,
                lastOpenFlowId: next.flowId,
                selection: next
              }
            }
          };
        }, { persist: true });
      }
      const destinationViewId = next.kind === "recording" || next.kind === "timeline"
        ? automationStudioViewId.recordingTimeline
        : next.kind === "signal" || next.kind === "state"
          ? automationStudioViewId.state
          : next.kind === "policy"
            ? automationStudioViewId.flowEditor
            : null;
      if (destinationViewId) {
        options.updatePrefs((current) => ({
          ...current,
          viewStates: {
            ...current.viewStates,
            [destinationViewId]: {
              ...(current.viewStates?.[destinationViewId] ?? {}),
              selection: next
            }
          }
        }), { persist: true });
      }
      if (next.kind === "recording" || next.kind === "timeline") {
        options.setRecordingPrimaryKind("recording");
        showRecordingPreview();
      }
      if (next.kind === "signal" || next.kind === "state") openView(automationStudioViewId.state);
      if (next.kind === "policy") openView(automationStudioViewId.flowEditor);
      if (next.kind === "flow") {
        options.updatePrefs((current) => {
          const instanceId = automationStudioObjectViewInstanceId(automationStudioViewId.flowEditor, next.id);
          const currentFlowState = current.viewStates?.[instanceId] ?? {};
          if (currentFlowState.lastOpenFlowId === next.id && currentFlowState.selection === next) return current;
          return {
            ...current,
            viewStates: {
              ...current.viewStates,
              [instanceId]: { ...currentFlowState, lastOpenFlowId: next.id, selection: next }
            }
          };
        }, { persist: true });
        openView(automationStudioViewId.flowEditor, flowMode);
      }
    });
    return true;
  }, [openView, options, showRecordingPreview]);
  const openState = useCallback(async (request: StateRequest) => {
    const current = options.getSnapshot?.() ?? options;
    const nodeId = request.nodeId ?? current.selectedNode?.id;
    const nodeMetadata = stateOpenNodeMetadata(nodeId, current.selectedNode);
    const recordingId = request.recordingId
      ?? stringRecordValue(nodeMetadata, "recordingId")
      ?? current.selectedRecording?.recordingId
      ?? current.selectedProposal?.metadata?.recordingId
      ?? current.selectedProposal?.recordingId
      ?? recordingIdFromStateSourceId(request.sourceId);
    const timelineEntryId = request.timelineEntryId
      ?? stringRecordValue(nodeMetadata, "actionEntryId")
      ?? stringRecordValue(nodeMetadata, "timelineEntryId");
    const stateSnapshotId = request.stateSnapshotId ?? stringRecordValue(nodeMetadata, "stateSnapshotId");
    const proposalId = request.proposalId
      ?? (current.selection?.kind === "state" ? current.selection.proposalId : undefined)
      ?? current.selectedProposal?.proposalId;
    const stateRef = stringRecordValue(nodeMetadata, "stateRef");
    const outcome = await options.liveCommands.openState<any>({
      phase: request.phase ?? "input",
      ...(nodeId ? { nodeId } : {}),
      ...(current.selectedFlow?.flowId ? { flowId: current.selectedFlow.flowId } : {}),
      ...(request.sourceId ? { sourceId: request.sourceId } : {}),
      ...(request.evidenceId ? { evidenceId: request.evidenceId } : {}),
      ...(request.factPath ? { factPath: request.factPath } : {}),
      ...(proposalId ? { proposalId } : {}),
      ...(recordingId ? { recordingId } : {}),
      ...(timelineEntryId ? { timelineEntryId } : {}),
      ...(stateSnapshotId ? { stateSnapshotId } : {}),
      ...(stateRef ? { stateRef } : {})
    }, (event: AutomationStatePublication<any>) => publishState(options, request, event, recordingId, timelineEntryId, stateSnapshotId));
    if (outcome.status === "failure") options.setActionStatus(outcome.error);
  }, [options]);
  const openTimelineEntryState = useCallback((recordingId: string, entryId: string) => {
    void openState({ recordingId, timelineEntryId: entryId, phase: "input" });
  }, [openState]);
  const selectPreviewEntry = useCallback((entryId: string) => {
    const current = options.getSnapshot?.() ?? options;
    const recordingId = current.selectedRecording?.recordingId ?? current.timelineEntryById.get(entryId)?.recordingId;
    const activePane = current.workspacePrefs.panes.find((pane) => pane.id === current.workspacePrefs.activePaneId) ?? current.workspacePrefs.panes[0];
    if (automationStudioViewBaseId(activePane?.activeViewId ?? "") === automationStudioViewId.state && recordingId) return openTimelineEntryState(recordingId, entryId);
    if (automationStudioViewBaseId(activePane?.activeViewId ?? "") === automationStudioViewId.recordingTimeline || current.workspacePrefs.panes.some((pane) => automationStudioViewBaseId(pane.activeViewId) === automationStudioViewId.recordingTimeline)) {
      selectAndFollow({ kind: "timeline", id: entryId });
      return;
    }
    if (current.workspacePrefs.panes.some((pane) => automationStudioViewBaseId(pane.activeViewId) === automationStudioViewId.state) && recordingId) return openTimelineEntryState(recordingId, entryId);
    selectAndFollow({ kind: "timeline", id: entryId });
  }, [openTimelineEntryState, options, selectAndFollow]);
  const openSubflow = useCallback(async (parentFlowId: string, subflowId: string, mode: "preview" | "new-pane-or-focus" = "preview", knownGraphFlowId?: string) => {
    if (!parentFlowId || !subflowId) return;
    const outcome = await options.liveCommands.resolveSubflowEditor(parentFlowId, subflowId, knownGraphFlowId);
    if (outcome.status === "success") selectAndFollow({ kind: "flow", id: outcome.value.graphFlowId }, mode);
    else if (outcome.status === "failure") options.setActionStatus(outcome.error);
  }, [options.liveCommands, options.setActionStatus, selectAndFollow]);

  return { openState, openSubflow, openTimelineEntryState, openView, selectAndFollow, selectPreviewEntry };
}

function flowIdForSelection(selection: AutomationSelection | null): string | null {
  if (selection?.kind === "flow") return selection.id;
  if (selection?.kind === "editor-node" || selection?.kind === "editor-mode") return selection.flowId ?? null;
  return null;
}

function publishState(
  options: NavigationOptions,
  request: StateRequest,
  event: AutomationStatePublication<any>,
  recordingId: string | undefined,
  timelineEntryId: string | undefined,
  stateSnapshotId: string | undefined
) {
  const current = options.getSnapshot?.() ?? options;
  if (event.kind === "intent") {
    if (timelineEntryId) {
      options.setBottomPreviewEntryId(resolveActionPreviewEntryId(current.selectedTimeline ?? current.selectedRecording, timelineEntryId));
      options.setRecordingPrimaryKind("recording");
    }
    options.setPendingStateOpen(event.loading ? {
      key: event.requestKey,
      recordingId,
      phase: request.phase ?? "input",
      ...(timelineEntryId ? { timelineEntryId } : {}),
      ...(stateSnapshotId ? { stateSnapshotId } : {})
    } : null);
    options.setSelection(event.selection);
    options.commands.openView(automationStudioViewId.state, "preview");
    return;
  }
  if (event.kind === "failure") {
    options.setPendingStateOpen((current: any) => current?.key === event.requestKey ? null : current);
    options.setActionStatus(event.error);
    return;
  }
  if (event.detail) options.setIndexedStateSources((current: any) => ({ ...current, [event.detail!.source.id]: event.detail! }));
  if (event.resolved?.entryId) {
    options.setBottomPreviewEntryId(resolveActionPreviewEntryId(current.selectedTimeline ?? current.selectedRecording, event.resolved.entryId));
    options.setRecordingPrimaryKind("recording");
  }
  options.setSelection(event.selection);
  options.setPendingStateOpen((current: any) => current?.key === event.requestKey ? null : current);
  options.commands.openView(automationStudioViewId.state, "preview");
}
