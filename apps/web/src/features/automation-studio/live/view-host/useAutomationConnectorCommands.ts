"use client";

import { useMemo } from "react";
import { automationStudioViewId } from "../../views/view-registry";
import { useStableAutomationEvent } from "../useStableAutomationEvent";

type Command = (...args: any[]) => any;

export type AutomationConnectorCommandHandlers = {
  appendRecordingMarker: Command;
  appendRecordingNote: Command;
  createSubflow: Command;
  deleteRecording: Command;
  discardGraphDraft: Command;
  finalizeRecording: Command;
  listProblems: Command;
  openAdaptation: Command;
  openInspector: Command;
  openNodeState(nodeId: string): unknown;
  openProblem: Command;
  openProblems: Command;
  openReadinessTarget: Command;
  openState: Command;
  openSubflow: Command;
  openTimelineEntryState: Command;
  refreshRecordings: Command;
  reloadGraph: Command;
  restoreGraphDraft: Command;
  saveGraph: Command;
  selectAdaptation: Command;
  setGraphDirty: Command;
  setSelection: Command;
  updateGraphDraft: Command;
  updateRecording: Command;
};

export function useAutomationConnectorCommands(handlers: AutomationConnectorCommandHandlers) {
  const stable = {
    appendRecordingMarker: useStableAutomationEvent(handlers.appendRecordingMarker),
    appendRecordingNote: useStableAutomationEvent(handlers.appendRecordingNote),
    createSubflow: useStableAutomationEvent(handlers.createSubflow),
    deleteRecording: useStableAutomationEvent(handlers.deleteRecording),
    discardGraphDraft: useStableAutomationEvent(handlers.discardGraphDraft),
    finalizeRecording: useStableAutomationEvent(handlers.finalizeRecording),
    listProblems: useStableAutomationEvent(handlers.listProblems),
    openAdaptation: useStableAutomationEvent(handlers.openAdaptation),
    openInspector: useStableAutomationEvent(handlers.openInspector),
    openNodeState: useStableAutomationEvent(handlers.openNodeState),
    openProblem: useStableAutomationEvent(handlers.openProblem),
    openProblems: useStableAutomationEvent(handlers.openProblems),
    openReadinessTarget: useStableAutomationEvent(handlers.openReadinessTarget),
    openState: useStableAutomationEvent(handlers.openState),
    openSubflow: useStableAutomationEvent(handlers.openSubflow),
    openTimelineEntryState: useStableAutomationEvent(handlers.openTimelineEntryState),
    refreshRecordings: useStableAutomationEvent(handlers.refreshRecordings),
    reloadGraph: useStableAutomationEvent(handlers.reloadGraph),
    restoreGraphDraft: useStableAutomationEvent(handlers.restoreGraphDraft),
    saveGraph: useStableAutomationEvent(handlers.saveGraph),
    selectAdaptation: useStableAutomationEvent(handlers.selectAdaptation),
    setGraphDirty: useStableAutomationEvent(handlers.setGraphDirty),
    setSelection: useStableAutomationEvent(handlers.setSelection),
    updateGraphDraft: useStableAutomationEvent(handlers.updateGraphDraft),
    updateRecording: useStableAutomationEvent(handlers.updateRecording)
  };
  return useMemo(() => ({
    [automationStudioViewId.clients]: {},
    [automationStudioViewId.flowEditor]: {
      onSaveGraph: stable.saveGraph,
      onGraphDraftChange: stable.updateGraphDraft,
      onDirtyChange: stable.setGraphDirty,
      onOpenValidation: stable.openInspector,
      onOpenNodeState: stable.openNodeState,
      onRestoreDraft: stable.restoreGraphDraft,
      onDiscardDraft: stable.discardGraphDraft,
      onReloadGraph: stable.reloadGraph,
      setSelection: stable.setSelection
    },
    [automationStudioViewId.recordingTimeline]: {
      onAppendRecordingMarker: stable.appendRecordingMarker,
      onAppendRecordingNote: stable.appendRecordingNote,
      onDeleteRecording: stable.deleteRecording,
      onFinalizeRecording: stable.finalizeRecording,
      onOpenTimelineEntryState: stable.openTimelineEntryState,
      onRefreshRecordings: stable.refreshRecordings,
      onUpdateRecording: stable.updateRecording,
      setSelection: stable.setSelection
    },
    [automationStudioViewId.state]: { setSelection: stable.setSelection },
    [automationStudioViewId.runtime]: {
      onOpenAdaptation: stable.openAdaptation,
      onOpenReadinessTarget: stable.openReadinessTarget
    },
    [automationStudioViewId.problems]: {
      onOpenProblem: stable.openProblem,
      onListProblems: stable.listProblems
    },
    [automationStudioViewId.inspector]: {
      onOpenState: stable.openState,
      onUpdateEditorNodeSelection: stable.setSelection
    },
    [automationStudioViewId.router]: { onCreateSubflow: stable.createSubflow },
    [automationStudioViewId.subflows]: { onOpenSubflow: stable.openSubflow },
    [automationStudioViewId.instructions]: {},
    [automationStudioViewId.adaptations]: { onSelectedAdaptationChange: stable.selectAdaptation },
    [automationStudioViewId.settings]: {}
  }), Object.values(stable));
}
