"use client";

import { automationInspectorReferenceOptions, type InspectorPanelContext } from "../../inspector";
import { automationGraphDraftIdentity } from "../../graph/draft-store";
import { createAutomationProjectViewModelSelector } from "../../model/project-view-model";
import type { AutomationSelection } from "../../shared/selection-contracts";
import { automationEntityCollectionSelector, automationEntityScope } from "../../stores/project-data-store";
import type { AutomationWorkspacePrefs } from "../../workspace/layout";
import { automationStudioViewId } from "../../views/view-registry";
import { createAutomationDirectViewConnector, type AutomationDirectViewConnectorState } from "./direct-view-connector";

export type AutomationCanonicalConnectorScope = {
  projectId: string | null;
  getWorkspacePrefs(): AutomationWorkspacePrefs;
  loadFlowDetail(flowId: string): Promise<unknown>;
  loadFlowMetadata(flowId: string): Promise<void>;
  loadNodeDefinitions(): Promise<void>;
  loadRecording(recordingId: string): Promise<unknown>;
  loadTimeline(recordingId: string): Promise<unknown>;
};

const emptyList = Object.freeze([]) as unknown as any[];
const emptyRecord = Object.freeze({}) as Record<string, any>;
const emptyArtifacts = Object.freeze({ tasks: [], routines: [], configs: [], flows: [] });
const emptyPipeline = Object.freeze({
  normalizationReviews: [], miningRuns: [], evidenceFacts: [], evidenceObservations: [],
  stateActionCorrelations: [], evidenceClaims: [], learnedTaskModels: [], policyProposals: [], replayResults: []
});

function resource<Value>(state: AutomationDirectViewConnectorState, key: string, fallback: Value): Value {
  return state.projectData.resources.has(key)
    ? state.projectData.resources.get(key) as Value
    : fallback;
}

function collection(state: AutomationDirectViewConnectorState, kind: Parameters<typeof automationEntityCollectionSelector>[0]) {
  return automationEntityCollectionSelector(kind)(state.projectData) as any[];
}

function createProjectionSelector() {
  const select = createAutomationProjectViewModelSelector();
  return (state: AutomationDirectViewConnectorState, scope: AutomationCanonicalConnectorScope) => {
    const prefs = scope.getWorkspacePrefs();
    return select({
      hasActiveProject: Boolean(scope.projectId),
      canonical: resource<any>(state, "snapshot", null)?.payload?.canonical ?? emptyRecord,
      pipelineArtifacts: resource(state, "pipelineArtifacts", emptyPipeline),
      snapshotProblems: resource<any>(state, "snapshot", null)?.payload?.problems ?? emptyList,
      projectRecordings: collection(state, "recordings"),
      projectTimelines: collection(state, "timelines"),
      projectFlows: collection(state, "flows"),
      projectArtifacts: resource(state, "projectArtifacts", emptyArtifacts),
      indexedStateSources: resource(state, "indexedStateSources", emptyRecord),
      nativeNodeDefinitions: resource(state, "nativeNodeDefinitions", emptyList),
      publishedFlowDefinitions: resource(state, "publishedFlowDefinitions", emptyList),
      customHierarchyNodes: resource(state, "customHierarchyNodes", emptyList),
      deletedHierarchyIds: resource(state, "deletedHierarchyIds", emptyList),
      selection: state.selection.selection,
      lastOpenFlowId: typeof prefs.viewStates?.[automationStudioViewId.flowEditor]?.lastOpenFlowId === "string"
        ? prefs.viewStates[automationStudioViewId.flowEditor]!.lastOpenFlowId as string
        : null,
      lastOpenTaskId: null
    });
  };
}

const selectionScopes = () => ["selection", "state-open", "preview"] as const;
const flowScopes = () => [
  automationEntityScope("flows"),
  automationEntityScope("recordings"),
  automationEntityScope("timelines"),
  "resource:snapshot",
  "resource:projectArtifacts",
  "resource:nativeNodeDefinitions",
  "resource:publishedFlowDefinitions",
  "resource:taskGraphDrafts",
  "resource:indexedStateSources",
  "resource:customHierarchyNodes",
  "resource:deletedHierarchyIds"
] as const;
const recordingScopes = () => [
  automationEntityScope("recordings"),
  automationEntityScope("timelines"),
  "resource:snapshot"
] as const;
const runtimeScopes = () => [
  automationEntityScope("flows"),
  automationEntityScope("timelines"),
  automationEntityScope("runs"),
  "resource:snapshot",
  "resource:pipelineArtifacts"
] as const;
const selectedFlowScopes = () => [
  automationEntityScope("flows"),
  "resource:snapshot"
] as const;

export function selectAutomationConnectorFlow(state: AutomationDirectViewConnectorState, scope: AutomationCanonicalConnectorScope) {
  const selection = state.selection.selection;
  const prefs = scope.getWorkspacePrefs();
  const selectedId = selection?.kind === "flow"
    ? selection.id
    : typeof prefs.viewStates?.[automationStudioViewId.flowEditor]?.lastOpenFlowId === "string"
      ? prefs.viewStates[automationStudioViewId.flowEditor]!.lastOpenFlowId as string
      : null;
  if (!selectedId) return { entry: null, flow: null };
  const entry = state.projectData.entities.flows.get(selectedId) as any;
  return { entry: entry ?? null, flow: entry?.flow ?? entry ?? null };
}

export const AutomationClientsConnectedView = createAutomationDirectViewConnector({
  id: automationStudioViewId.clients,
  placeholder: (scope: AutomationCanonicalConnectorScope) => ({ projectId: scope.projectId }),
  projectScopes: () => emptyList,
  selectModel: (_state, scope) => ({ projectId: scope.projectId })
});

export const AutomationFlowEditorConnectedView = createAutomationDirectViewConnector({
  id: automationStudioViewId.flowEditor,
  placeholder: () => ({
    editable: false, entries: [], policy: null, taskGraph: null, nativeNodeDefinitions: [],
    recordings: [], selectedNode: null, focusRequest: null, selectedTimeline: null, signals: []
  }) as any,
  projectScopes: flowScopes,
  selectionScopes,
  activationKey: (state, scope: AutomationCanonicalConnectorScope) => selectAutomationConnectorFlow(state, scope).flow?.flowId ?? "none",
  onActive: (state, scope: AutomationCanonicalConnectorScope, model: any) => {
    const flow = selectAutomationConnectorFlow(state, scope);
    if (flow.entry?.source === "canonical" && flow.flow?.metadata?.summaryOnly === true) {
      void scope.loadFlowDetail(flow.flow.flowId);
    }
    if (!(model.nativeNodeDefinitions?.length ?? 0)) void scope.loadNodeDefinitions();
  },
  selectModel: () => emptyRecord as any,
  createModelSelector: () => {
    const project = createProjectionSelector();
    return (state, scope) => {
      const view = project(state, scope as AutomationCanonicalConnectorScope);
      const drafts = resource<Record<string, any>>(state, "taskGraphDrafts", emptyRecord);
      const draftKey = automationGraphDraftIdentity(view.selectedTaskGraph);
      return {
        editable: view.selectedFlowEntry?.source === "canonical",
        entries: view.selectedTimelineEntries,
        policy: view.selectedPolicy,
        taskGraph: view.selectedTaskGraph,
        ...(draftKey && drafts[draftKey] ? { taskGraphDraft: drafts[draftKey] } : {}),
        nativeNodeDefinitions: view.availableNodeDefinitions,
        recordings: view.recordings,
        selectedNode: view.selectedNode,
        focusRequest: null,
        selectedTimeline: view.selectedTimeline,
        signals: view.signals
      } as any;
    };
  }
});

export const AutomationRecordingConnectedView = createAutomationDirectViewConnector({
  id: automationStudioViewId.recordingTimeline,
  placeholder: (scope: AutomationCanonicalConnectorScope) => ({
    actionStatus: "", projectId: scope.projectId, entries: [], notes: [], recordings: [],
    recordingProcessing: null, selectedEntry: null, selectedRecording: null,
    selectedTimeline: null, timelines: []
  }) as any,
  projectScopes: recordingScopes,
  runtimeScopes: () => ["action-status", "recording-processing"],
  selectionScopes,
  activationKey: (_state, _scope, model: any) => model.selectedRecording?.recordingId ?? "none",
  onActive: (_state, scope, model: any) => {
    const recordingId = model.selectedRecording?.recordingId;
    if (recordingId && model.selectedRecording?.metadata?.summaryOnly === true) {
      void scope.loadRecording(recordingId);
    }
    if (recordingId && !model.selectedTimeline) void scope.loadTimeline(recordingId);
  },
  selectModel: () => emptyRecord as any,
  createModelSelector: () => {
    const project = createProjectionSelector();
    return (state, scope) => {
      const view = project(state, scope as AutomationCanonicalConnectorScope);
      return {
        actionStatus: state.runtimeStatus.actionStatus,
        projectId: scope.projectId,
        entries: view.selectedTimelineEntries,
        notes: view.selectedRecordingNotes,
        recordings: view.recordings,
        recordingProcessing: state.runtimeStatus.recordingProcessing,
        selectedEntry: view.selectedEntry,
        selectedRecording: view.selectedRecording,
        selectedTimeline: view.selectedTimeline,
        timelines: view.timelines
      } as any;
    };
  }
});

function createFlowDetailConnector(id:
  | typeof automationStudioViewId.router
  | typeof automationStudioViewId.subflows
  | typeof automationStudioViewId.instructions
  | typeof automationStudioViewId.settings
) {
  return createAutomationDirectViewConnector({
    id,
    placeholder: (scope: AutomationCanonicalConnectorScope) => ({ flow: null, projectId: scope.projectId }) as any,
    projectScopes: selectedFlowScopes,
    selectionScopes,
    activationKey: (state, scope) => selectAutomationConnectorFlow(state, scope).flow?.flowId ?? "none",
    onActive: (state, scope) => {
      const selected = selectAutomationConnectorFlow(state, scope);
      if (selected.entry?.source === "canonical" && selected.flow?.metadata?.summaryOnly === true) {
        void scope.loadFlowDetail(selected.flow.flowId);
      }
    },
    selectModel: (state, scope) => ({
      flow: selectAutomationConnectorFlow(state, scope).flow,
      projectId: scope.projectId
    }) as any
  });
}

export const AutomationRouterConnectedView = createFlowDetailConnector(automationStudioViewId.router);
export const AutomationSubflowsConnectedView = createFlowDetailConnector(automationStudioViewId.subflows);
export const AutomationInstructionsConnectedView = createFlowDetailConnector(automationStudioViewId.instructions);
export const AutomationSettingsConnectedView = createFlowDetailConnector(automationStudioViewId.settings);

export const AutomationAdaptationsConnectedView = createAutomationDirectViewConnector({
  id: automationStudioViewId.adaptations,
  placeholder: (scope: AutomationCanonicalConnectorScope) => ({ flow: null, projectId: scope.projectId }),
  projectScopes: selectedFlowScopes,
  selectionScopes,
  activationKey: (state, scope: AutomationCanonicalConnectorScope) => selectAutomationConnectorFlow(state, scope).flow?.flowId ?? "none",
  onActive: (state, scope: AutomationCanonicalConnectorScope) => {
    const selected = selectAutomationConnectorFlow(state, scope);
    if (selected.entry?.source === "canonical" && selected.flow?.metadata?.summaryOnly === true) {
      void scope.loadFlowDetail(selected.flow.flowId);
    }
  },
  selectModel: (state, scope) => {
      const prefs = scope.getWorkspacePrefs();
      const flow = selectAutomationConnectorFlow(state, scope).flow;
      const saved = prefs.viewStates?.[automationStudioViewId.adaptations];
      return {
        flow,
        projectId: scope.projectId,
        ...(saved && saved.flowId === flow?.flowId && typeof saved.selectedAdaptationId === "string"
          ? { requestedAdaptationId: saved.selectedAdaptationId }
          : {})
      };
  }
});

export const AutomationRuntimeConnectedView = createAutomationDirectViewConnector({
  id: automationStudioViewId.runtime,
  placeholder: (scope: AutomationCanonicalConnectorScope) => ({
    flow: null, projectId: scope.projectId, pipelineArtifacts: emptyPipeline,
    selectedTimeline: null, models: [], policies: [], runtimeSessions: []
  }) as any,
  projectScopes: runtimeScopes,
  selectionScopes,
  selectModel: (state, scope) => {
      const flow = selectAutomationConnectorFlow(state, scope).flow;
      const canonical = resource<any>(state, "snapshot", null)?.payload?.canonical ?? emptyRecord;
      const pipeline = resource(state, "pipelineArtifacts", emptyPipeline);
      const timelines = collection(state, "timelines");
      const selectedTimeline = state.selection.selection?.kind === "timeline"
        ? timelines.find((timeline) => timeline.normalizedTimelineId === state.selection.selection?.id
          || timeline.timeline?.some((entry: any) => entry.id === state.selection.selection?.id)) ?? null
        : null;
      return {
        flow,
        projectId: scope.projectId,
        pipelineArtifacts: pipeline,
        selectedTimeline,
        models: pipeline.learnedTaskModels ?? canonical.learnedTaskModels ?? [],
        policies: canonical.policyGraphs ?? [],
        runtimeSessions: collection(state, "runs")
      } as any;
  }
});

export const AutomationProblemsConnectedView = createAutomationDirectViewConnector({
  id: automationStudioViewId.problems,
  placeholder: () => ({ currentObjectId: null, problems: [] }),
  projectScopes: () => ["resource:snapshot"],
  selectionScopes,
  selectModel: (state) => {
      const selection = state.selection.selection;
      const snapshotProblems = resource<any>(state, "snapshot", null)?.payload?.problems ?? emptyList;
      return {
        currentObjectId: selection?.id ?? null,
        ...(selection?.id
          ? { currentObjectLabel: selection.id }
          : {}),
        problems: snapshotProblems
      };
  }
});

export const AutomationInspectorConnectedView = createAutomationDirectViewConnector({
  id: automationStudioViewId.inspector,
  placeholder: () => ({ context: null }),
  projectScopes: () => [...flowScopes(), "resource:flowPublications", "resource:flowDependencyInfo"],
  selectionScopes,
  activationKey: (state, scope: AutomationCanonicalConnectorScope) => selectAutomationConnectorFlow(state, scope).flow?.flowId ?? "none",
  onActive: (state, scope: AutomationCanonicalConnectorScope) => {
    const selected = selectAutomationConnectorFlow(state, scope);
    if (selected.flow?.flowId && resource(state, "flowMetadataFlowId", null) !== selected.flow.flowId) {
      void scope.loadFlowMetadata(selected.flow.flowId);
    }
  },
  selectModel: () => emptyRecord as any,
  createModelSelector: () => {
    const project = createProjectionSelector();
    return (state, scope) => {
      const view = project(state, scope as AutomationCanonicalConnectorScope);
      const selection = state.selection.selection;
      if (!selection) return { context: null };
      const dependency = resource<any>(state, "flowDependencyInfo", emptyRecord);
      const context: InspectorPanelContext = {
        selection,
        policy: view.selectedPolicy,
        flow: view.selectedTaskGraph,
        node: view.selectedNode,
        recording: view.selectedRecording,
        entry: view.selectedEntry,
        signal: view.selectedSignal,
        timelineEntries: selection.kind === "timeline" ? view.selectedTimelineEntries : [],
        flowPublicationCount: selection.kind === "flow"
          ? resource<any[]>(state, "flowPublications", emptyList).length
          : 0,
        flowDependencies: {
          dependencies: selection.kind === "flow" ? dependency.dependencies?.length ?? 0 : 0,
          usedBy: selection.kind === "flow" ? dependency.usedBy?.length ?? 0 : 0,
          availableUpgrades: selection.kind === "flow" ? dependency.availableUpgrades?.length ?? 0 : 0
        },
        referenceOptions: selection.kind === "editor-node"
          ? automationInspectorReferenceOptions({
            flow: view.selectedTaskGraph,
            nodeDefinitions: view.availableNodeDefinitions,
            policies: view.policies,
            pipelineArtifacts: resource(state, "pipelineArtifacts", emptyPipeline)
          })
          : {},
        statePanel: null
      };
      return { context };
    };
  }
});

export const AutomationStateConnectedView = createAutomationDirectViewConnector({
  id: automationStudioViewId.state,
  placeholder: () => ({ input: emptyRecord, loading: null }) as any,
  projectScopes: () => [...flowScopes(), ...runtimeScopes(), "resource:pipelineArtifacts"],
  selectionScopes,
  selectModel: () => emptyRecord as any,
  createModelSelector: () => {
    const project = createProjectionSelector();
    return (state, scope) => {
      const view = project(state, scope as AutomationCanonicalConnectorScope);
      return {
        input: {
          selection: state.selection.selection as AutomationSelection | null,
          selectedNode: view.selectedNode,
          selectedEntry: view.selectedEntry,
          selectedProposal: view.selectedProposal,
          selectedRecording: view.selectedRecording,
          selectedTimeline: view.selectedTimeline,
          policy: view.selectedPolicy,
          taskGraph: view.selectedTaskGraph,
          pipelineArtifacts: resource(state, "pipelineArtifacts", emptyPipeline),
          recordings: view.recordings,
          timelines: view.timelines,
          runtimeSessions: collection(state, "runs"),
          signals: view.signals,
          indexedStateSources: Object.values(resource(state, "indexedStateSources", emptyRecord))
        },
        loading: state.selection.pendingStateOpen
      } as any;
    };
  }
});
