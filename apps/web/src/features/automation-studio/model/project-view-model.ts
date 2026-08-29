import {
  automationHierarchyNodeIsGeneratedFlowStructure,
  flowHierarchyNodes,
  type AutomationHierarchyNode
} from "../hierarchy/model";
import { automationStudioFlowScope, automationStudioWorkspaceBreadcrumbs } from "../navigation";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationViewInstance } from "../views/view-types";
import { automationStudioViewDefinition } from "../views/view-registry";
import { isPersistableHierarchyNode, mergeById } from "./project-artifacts";
import {
  createAutomationEntityIndexesSelector,
  subflowHierarchyScopeKey,
  type AutomationEntityIndexes
} from "./entity-indexes";
import {
  resolveAutomationSelection,
  type AutomationSelectionResolution
} from "./selection-resolution";

export type AutomationProjectViewModelInput = {
  hasActiveProject: boolean;
  canonical: any;
  pipelineArtifacts: any;
  snapshotProblems: any[];
  projectRecordings: any[];
  projectTimelines: any[];
  projectFlows: any[];
  projectArtifacts: any;
  indexedStateSources: Record<string, any>;
  nativeNodeDefinitions: any[];
  publishedFlowDefinitions: any[];
  customHierarchyNodes: AutomationHierarchyNode[];
  deletedHierarchyIds: string[];
  selection: AutomationSelection | null;
  lastOpenFlowId: string | null;
  lastOpenTaskId: string | null;
};

type AutomationProjectDerivedSources = {
  recordings: any[];
  timelines: any[];
  registries: any[];
  models: any[];
  proposals: any[];
  recordingFlowProposals: any[];
  hierarchyProposals: any[];
  policies: any[];
  snapshotProblems: any[];
  signals: any[];
  availableNodeDefinitions: any[];
  indexedStateSourceList: any[];
  projectTasks: any[];
  artifactFlows: any[];
  hierarchyNodes: AutomationHierarchyNode[];
  projectFlowUrlScopeSignature: string;
  indexes: AutomationEntityIndexes;
};

export type AutomationProjectViewModel = AutomationProjectDerivedSources & AutomationSelectionResolution & {
  selectedTimelineEntries: any[];
  selectedRecordingNotes: any[];
  activeFlowScope: ReturnType<typeof automationStudioFlowScope> | null;
  breadcrumbFlow: any | null;
  breadcrumbSubflow: AutomationHierarchyNode | null;
  viewLabelForSelection: (view: AutomationViewInstance, selection?: AutomationSelection | null) => string;
  viewWithTitleData: (view: AutomationViewInstance, selection?: AutomationSelection | null) => AutomationViewInstance;
  workspaceBreadcrumbsForView: (viewId: string, viewLabel: string) => ReturnType<typeof automationStudioWorkspaceBreadcrumbs>;
};

function sameEntitySourceInput(left: AutomationProjectViewModelInput | null, right: AutomationProjectViewModelInput): boolean {
  return Boolean(left
    && left.hasActiveProject === right.hasActiveProject
    && left.canonical === right.canonical
    && left.pipelineArtifacts === right.pipelineArtifacts
    && left.projectRecordings === right.projectRecordings
    && left.projectTimelines === right.projectTimelines
    && left.projectFlows === right.projectFlows
    && left.projectArtifacts === right.projectArtifacts
    && left.indexedStateSources === right.indexedStateSources
    && left.nativeNodeDefinitions === right.nativeNodeDefinitions
    && left.publishedFlowDefinitions === right.publishedFlowDefinitions
    && left.customHierarchyNodes === right.customHierarchyNodes
    && left.deletedHierarchyIds === right.deletedHierarchyIds);
}

function sameSourceInput(left: AutomationProjectViewModelInput | null, right: AutomationProjectViewModelInput): boolean {
  return sameEntitySourceInput(left, right) && left?.snapshotProblems === right.snapshotProblems;
}

function flowScopeSignature(projectFlows: any[]): string {
  return projectFlows.map((entry) => {
    const flow = entry?.flow ?? entry;
    return [
      flow?.flowId ?? "",
      flow?.metadata?.subflowGraph === true ? "subflow" : "flow",
      flow?.metadata?.parentFlowId ?? "",
      flow?.metadata?.parentSubflowId ?? ""
    ].join(":");
  }).join("|");
}
export function createAutomationProjectViewModelSelector() {
  const selectIndexes = createAutomationEntityIndexesSelector();
  let previousSourceInput: AutomationProjectViewModelInput | null = null;
  let previousSources: AutomationProjectDerivedSources | null = null;
  let previousInput: AutomationProjectViewModelInput | null = null;
  let previousModel: AutomationProjectViewModel | null = null;

  function deriveSources(input: AutomationProjectViewModelInput): AutomationProjectDerivedSources {
    if (sameEntitySourceInput(previousSourceInput, input) && previousSources) {
      previousSourceInput = input;
      if (previousSources.snapshotProblems === input.snapshotProblems) return previousSources;
      previousSources = { ...previousSources, snapshotProblems: input.snapshotProblems };
      return previousSources;
    }

    const canonical = input.canonical ?? {};
    const pipelineArtifacts = input.pipelineArtifacts ?? {};
    const recordings = input.hasActiveProject
      ? input.projectRecordings
      : mergeById(input.projectRecordings, canonical.recordingSessions ?? [], "recordingId");
    const timelines = input.hasActiveProject
      ? input.projectTimelines
      : mergeById(input.projectTimelines, canonical.normalizedTimelines ?? [], "normalizedTimelineId");
    const registries = canonical.signalRegistries ?? [];
    const models = mergeById(pipelineArtifacts.learnedTaskModels ?? [], canonical.learnedTaskModels ?? [], "learnedTaskModelId");
    const proposals = pipelineArtifacts.policyProposals ?? [];
    const recordingFlowProposals = pipelineArtifacts.recordingFlowProposals ?? [];
    const hierarchyProposals = [...proposals, ...recordingFlowProposals];
    const policies = canonical.policyGraphs ?? [];
    const snapshotProblems = input.snapshotProblems;
    const signals = registries.flatMap((registry: any) =>
      (registry.definitions ?? []).map((signal: any) => ({ ...signal, registryId: registry.registryId }))
    );
    const availableNodeDefinitions = [...input.nativeNodeDefinitions, ...input.publishedFlowDefinitions];
    const indexedStateSourceList = Object.values(input.indexedStateSources);
    const projectTasks = input.projectArtifacts.tasks ?? [];
    const artifactFlows = input.projectArtifacts.flows ?? [];

    const generatedFlowNodes = flowHierarchyNodes(input.projectFlows, { recordings, proposals: hierarchyProposals });
    const generatedHierarchyIds = new Set(generatedFlowNodes.map((node) => node.id));
    const deletedIds = new Set(input.deletedHierarchyIds);
    const hierarchyNodes = [
      ...generatedFlowNodes,
      ...input.customHierarchyNodes.filter((node) => isPersistableHierarchyNode(node) && node.category === "flow")
    ].filter((node) =>
      !deletedIds.has(node.id)
      || (generatedHierarchyIds.has(node.id) && automationHierarchyNodeIsGeneratedFlowStructure(node))
    );

    const indexes = selectIndexes({
      flowEntries: input.projectFlows,
      artifactFlows,
      tasks: projectTasks,
      recordings,
      timelines,
      proposals: hierarchyProposals,
      policies,
      signals,
      hierarchyNodes
    });

    previousSourceInput = input;
    previousSources = {
      recordings,
      timelines,
      registries,
      models,
      proposals,
      recordingFlowProposals,
      hierarchyProposals,
      policies,
      snapshotProblems,
      signals,
      availableNodeDefinitions,
      indexedStateSourceList,
      projectTasks,
      artifactFlows,
      hierarchyNodes,
      projectFlowUrlScopeSignature: flowScopeSignature(input.projectFlows),
      indexes
    };
    return previousSources;
  }
  return (input: AutomationProjectViewModelInput): AutomationProjectViewModel => {
    if (previousInput
      && sameSourceInput(previousInput, input)
      && previousInput.selection === input.selection
      && previousInput.lastOpenFlowId === input.lastOpenFlowId
      && previousInput.lastOpenTaskId === input.lastOpenTaskId
      && previousModel) return previousModel;

    const sources = deriveSources(input);
    const resolved = resolveAutomationSelection({
      indexes: sources.indexes,
      flowEntries: input.projectFlows,
      tasks: sources.projectTasks,
      proposals: sources.hierarchyProposals,
      policies: sources.policies,
      selection: input.selection,
      lastOpenFlowId: input.lastOpenFlowId,
      lastOpenTaskId: input.lastOpenTaskId
    });
    const activeFlowScope = resolved.selectedFlow?.flowId
      ? automationStudioFlowScope(resolved.selectedFlow.flowId, input.projectFlows)
      : null;
    const breadcrumbFlow = activeFlowScope
      ? sources.indexes.flowById.get(activeFlowScope.flowId) ?? null
      : null;
    const breadcrumbSubflow = activeFlowScope?.subflowId
      ? sources.indexes.subflowHierarchyNodeByScope.get(subflowHierarchyScopeKey(activeFlowScope.flowId, activeFlowScope.subflowId)) ?? null
      : null;

    function viewDefinition(view: AutomationViewInstance) {
      return automationStudioViewDefinition(view.id, { hasFlow: Boolean(resolved.selectedFlow) });
    }

    function viewLabelForSelection(view: AutomationViewInstance, sourceSelection: AutomationSelection | null = input.selection): string {
      const definition = viewDefinition(view);
      const recording = resolved.recordingForSelection(sourceSelection);
      if (definition?.kind === "recordings") return `Timeline: ${recording?.name ?? recording?.recordingId ?? "Recording"}`;
      if (definition?.kind === "design") return resolved.selectedFlow ? `Flow: ${resolved.selectedFlow.name}` : "Flow: None";
      if (definition?.kind === "state") return `State: ${resolved.selectedNode?.label ?? sourceSelection?.id ?? "View"}`;
      return definition?.label ?? view.label;
    }

    function workspaceBreadcrumbsForView(viewId: string, viewLabel: string) {
      return automationStudioWorkspaceBreadcrumbs({
        flowId: activeFlowScope?.flowId,
        flowName: breadcrumbFlow?.name ?? (activeFlowScope?.subflowId ? null : resolved.selectedFlow?.name),
        subflowId: activeFlowScope?.subflowId,
        subflowName: breadcrumbSubflow?.label ?? (activeFlowScope?.subflowId ? resolved.selectedFlow?.name : null),
        viewId,
        viewLabel
      });
    }
    previousInput = input;
    previousModel = {
      ...sources,
      ...resolved,
      selectedTimelineEntries: resolved.selectedTimeline?.timeline ?? resolved.selectedRecording?.timeline ?? [],
      selectedRecordingNotes: resolved.selectedRecording?.notes ?? [],
      activeFlowScope,
      breadcrumbFlow,
      breadcrumbSubflow,
      viewLabelForSelection,
      viewWithTitleData: (view, sourceSelection = input.selection) => {
        const definition = viewDefinition(view);
        return {
          ...view,
          ...(definition ? { id: definition.id, type: definition.kind, icon: definition.icon } : {}),
          label: viewLabelForSelection(view, sourceSelection)
        };
      },
      workspaceBreadcrumbsForView
    };
    return previousModel;
  };
}