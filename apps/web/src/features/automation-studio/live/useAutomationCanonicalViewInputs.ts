"use client";

import { useMemo } from "react";
import { automationInspectorReferenceOptions, type InspectorPanelContext } from "../inspector";
import type { AutomationGraphFocusRequest } from "../flow-editor/flow-editor-types";
import type { AutomationSelection } from "../shared/selection-contracts";
import { automationStudioViewId } from "../views/view-registry";
import type { AutomationCanonicalViewHostInput, AutomationCanonicalViewPublisherInputs } from "./view-host";

type ModelState = {
  activeProjectId: string | null;
  actionStatus: string;
  availableNodeDefinitions: any[];
  flowDependencyInfo: any;
  flowPublications: any[];
  focusRequest: AutomationGraphFocusRequest | null;
  indexedStateSourceList: any[];
  models: any[];
  pendingStateOpen: any;
  pipelineArtifacts: any;
  policies: any[];
  problems: any[];
  recordingProcessing: any;
  requestedAdaptationId?: string;
  recordings: any[];
  recoverableDraft: { savedAt: number; stale: boolean } | null;
  runtimeSessions: any[];
  selectedEntry: any;
  selectedFlow: any;
  selectedFlowEntry: any;
  selectedNode: any;
  selectedPolicy: any;
  selectedProposal: any;
  selectedRecording: any;
  selectedRecordingNotes: any[];
  selectedSignal: any;
  selectedTaskGraph: any;
  selectedTaskGraphDraft: any;
  selectedTimeline: any;
  selectedTimelineEntries: any[];
  selection: AutomationSelection | null;
  signals: any[];
  timelines: any[];
};

type ViewCommands = {
  adaptations: AutomationCanonicalViewHostInput<typeof automationStudioViewId.adaptations>["commands"];
  flowEditor: AutomationCanonicalViewHostInput<typeof automationStudioViewId.flowEditor>["commands"];
  inspector: AutomationCanonicalViewHostInput<typeof automationStudioViewId.inspector>["commands"];
  instructions: AutomationCanonicalViewHostInput<typeof automationStudioViewId.instructions>["commands"];
  problems: AutomationCanonicalViewHostInput<typeof automationStudioViewId.problems>["commands"];
  recording: AutomationCanonicalViewHostInput<typeof automationStudioViewId.recordingTimeline>["commands"];
  router: AutomationCanonicalViewHostInput<typeof automationStudioViewId.router>["commands"];
  runtime: AutomationCanonicalViewHostInput<typeof automationStudioViewId.runtime>["commands"];
  settings: AutomationCanonicalViewHostInput<typeof automationStudioViewId.settings>["commands"];
  state: AutomationCanonicalViewHostInput<typeof automationStudioViewId.state>["commands"];
  subflows: AutomationCanonicalViewHostInput<typeof automationStudioViewId.subflows>["commands"];
};

export function useAutomationCanonicalViewInputs(state: ModelState, commands: ViewCommands): AutomationCanonicalViewPublisherInputs {
  const inspectorReferenceOptions = useMemo(() => state.selection?.kind === "editor-node"
    ? automationInspectorReferenceOptions({
      flow: state.selectedTaskGraph,
      nodeDefinitions: state.availableNodeDefinitions,
      policies: state.policies,
      pipelineArtifacts: state.pipelineArtifacts
    })
    : {}, [state.availableNodeDefinitions, state.pipelineArtifacts, state.policies, state.selectedTaskGraph, state.selection?.kind]);
  const inspectorContext = useMemo<InspectorPanelContext | null>(() => state.selection ? ({
    selection: state.selection,
    policy: state.selectedPolicy,
    flow: state.selectedTaskGraph,
    node: state.selectedNode,
    recording: state.selectedRecording,
    entry: state.selectedEntry,
    signal: state.selectedSignal,
    timelineEntries: state.selection.kind === "timeline" ? state.selectedTimelineEntries : [],
    flowPublicationCount: state.selection.kind === "flow" ? state.flowPublications.length : 0,
    flowDependencies: state.selection.kind === "flow" ? {
      dependencies: state.flowDependencyInfo?.dependencies?.length ?? 0,
      usedBy: state.flowDependencyInfo?.usedBy?.length ?? 0,
      availableUpgrades: state.flowDependencyInfo?.availableUpgrades?.length ?? 0
    } : { dependencies: 0, usedBy: 0, availableUpgrades: 0 },
    referenceOptions: inspectorReferenceOptions,
    statePanel: null
  }) : null, [inspectorReferenceOptions, state]);

  return useMemo(() => ({
    clients: {
      activity: "warm", label: "Connected Clients", state: "live",
      model: { projectId: state.activeProjectId }, commands: {}
    },
    flowEditor: {
      activity: "warm",
      label: state.selectedFlow ? "Flow: " + state.selectedFlow.name : "Flow: None",
      model: {
        editable: state.selectedFlowEntry?.source === "canonical",
        entries: state.selectedTimelineEntries,
        policy: state.selectedPolicy,
        taskGraph: state.selectedTaskGraph,
        ...(state.selectedTaskGraphDraft ? { taskGraphDraft: state.selectedTaskGraphDraft } : {}),
        ...(state.recoverableDraft ? { recoverableDraft: state.recoverableDraft } : {}),
        nativeNodeDefinitions: state.availableNodeDefinitions,
        recordings: state.recordings,
        selectedNode: state.selectedNode,
        focusRequest: state.focusRequest,
        selectedTimeline: state.selectedTimeline,
        signals: state.signals
      },
      commands: commands.flowEditor
    },
    recordingTimeline: {
      activity: "warm", label: "Timeline: " + (state.selectedRecording?.name ?? state.selectedRecording?.recordingId ?? "Recording"), state: "live",
      model: {
        actionStatus: state.actionStatus,
        projectId: state.activeProjectId,
        entries: state.selectedTimelineEntries,
        notes: state.selectedRecordingNotes,
        recordings: state.recordings,
        recordingProcessing: state.recordingProcessing,
        selectedEntry: state.selectedEntry,
        selectedRecording: state.selectedRecording,
        selectedTimeline: state.selectedTimeline,
        timelines: state.timelines
      },
      commands: commands.recording
    },
    state: {
      activity: "warm", label: state.selectedNode?.label ? "State: " + state.selectedNode.label : "State View",
      model: {
        input: {
          selection: state.selection,
          selectedNode: state.selectedNode,
          selectedEntry: state.selectedEntry,
          selectedProposal: state.selectedProposal,
          selectedRecording: state.selectedRecording,
          selectedTimeline: state.selectedTimeline,
          policy: state.selectedPolicy,
          taskGraph: state.selectedTaskGraph,
          pipelineArtifacts: state.pipelineArtifacts,
          recordings: state.recordings,
          timelines: state.timelines,
          runtimeSessions: state.runtimeSessions,
          signals: state.signals,
          indexedStateSources: state.indexedStateSourceList
        },
        loading: state.pendingStateOpen
      },
      commands: commands.state
    },
    runtime: {
      activity: "warm", label: "Runtime Debug",
      model: {
        flow: state.selectedTaskGraph,
        projectId: state.activeProjectId,
        pipelineArtifacts: state.pipelineArtifacts,
        selectedTimeline: state.selectedTimeline,
        models: state.models,
        policies: state.policies,
        runtimeSessions: state.runtimeSessions
      }, commands: commands.runtime
    },
    problems: {
      activity: "warm", label: "Problems",
      model: {
        currentObjectId: state.selection?.id ?? null,
        ...(state.selectedNode?.label || state.selection?.id ? { currentObjectLabel: state.selectedNode?.label ?? state.selection?.id } : {}),
        problems: state.problems
      }, commands: commands.problems
    },
    inspector: { activity: "warm", label: "Inspector", model: { context: inspectorContext }, commands: commands.inspector },
    router: { activity: "warm", label: "Router", model: { flow: state.selectedTaskGraph, projectId: state.activeProjectId }, commands: commands.router },
    subflows: { activity: "warm", label: "Subflows", model: { flow: state.selectedTaskGraph, projectId: state.activeProjectId }, commands: commands.subflows },
    instructions: { activity: "warm", label: "Instructions", model: { flow: state.selectedTaskGraph, projectId: state.activeProjectId }, commands: commands.instructions },
    adaptations: { activity: "warm", label: "Adaptations", model: { flow: state.selectedTaskGraph, projectId: state.activeProjectId, ...(state.requestedAdaptationId ? { requestedAdaptationId: state.requestedAdaptationId } : {}) }, commands: commands.adaptations },
    settings: { activity: "warm", label: "Settings", model: { flow: state.selectedTaskGraph, projectId: state.activeProjectId }, commands: commands.settings }
  }), [commands, inspectorContext, state]);
}