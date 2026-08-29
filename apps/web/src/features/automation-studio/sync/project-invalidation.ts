import type { AutomationStudioProjectDataAccess } from "../cache/project-data-access";
import type { AutomationHierarchyNode } from "../hierarchy/model";
import {
  reconcileCustomHierarchyNodesFromChangeFeed,
  reconcilePipelineArtifactsFromChangeFeed,
  reconcileProjectFlowsFromChangeFeed,
  reconcileRecordingsFromChangeFeed,
  reconcileRuntimeSessionsFromChangeFeed
} from "../model/project-change-reconciliation";
import type { AutomationStudioStores } from "../stores/studio-stores";
import {
  emitAutomationStudioFeedReconciliationDiagnostic,
  type AutomationStudioScopedInvalidation
} from "./project-sync";

export type AutomationStudioHierarchyReconciliation = {
  getNodes(): AutomationHierarchyNode[];
  replaceNodes(nodes: AutomationHierarchyNode[]): void;
};

export function applyAutomationProjectInvalidations(input: {
  projectId: string;
  invalidations: AutomationStudioScopedInvalidation[];
  data: AutomationStudioProjectDataAccess;
  stores: AutomationStudioStores;
  hierarchy: AutomationStudioHierarchyReconciliation;
}): void {
  if (!input.invalidations.length || input.stores.projectData.getState().activeProjectId !== input.projectId) return;

  for (const invalidation of input.invalidations) {
    input.data.invalidate(input.projectId, invalidation.cacheScopes, invalidation.cacheResourceIds);
    if (invalidation.reconciliation.diagnostic) {
      emitAutomationStudioFeedReconciliationDiagnostic({
        projectId: input.projectId,
        entityKind: invalidation.entityKind,
        entityId: invalidation.entityId,
        operation: invalidation.event.operation,
        sequence: invalidation.event.sequence,
        reason: invalidation.reconciliation.diagnostic
      });
    }
  }

  const deleteEvents = input.invalidations
    .map((invalidation) => invalidation.event)
    .filter((event) => event.operation === "delete");
  if (!deleteEvents.length) return;

  const state = input.stores.projectData.getState();
  const currentFlows = [...state.entities.flows.values()] as any[];
  const currentRecordings = [...state.entities.recordings.values()] as any[];
  const currentRuns = [...state.entities.runs.values()] as any[];
  const currentPipeline = state.resources.get("pipelineArtifacts") as any;
  const currentHierarchy = input.hierarchy.getNodes();
  const nextFlows = deleteEvents.reduce((next, event) => reconcileProjectFlowsFromChangeFeed(next, event).next, currentFlows);
  const nextRecordings = deleteEvents.reduce((next, event) => reconcileRecordingsFromChangeFeed(next, event).next, currentRecordings);
  const nextRuns = deleteEvents.reduce((next, event) => reconcileRuntimeSessionsFromChangeFeed(next, event).next, currentRuns);
  const nextPipeline = deleteEvents.reduce((next, event) => reconcilePipelineArtifactsFromChangeFeed(next, event).next, currentPipeline);
  const nextHierarchy = deleteEvents.reduce((next, event) => reconcileCustomHierarchyNodesFromChangeFeed(next, event).next, currentHierarchy);

  input.stores.transaction(() => {
    if (nextFlows !== currentFlows) input.stores.projectData.replaceAll("flows", nextFlows.map((item, index) => [flowId(item, index), item]));
    if (nextRecordings !== currentRecordings) input.stores.projectData.replaceAll("recordings", nextRecordings.map((item, index) => [recordingId(item, index), item]));
    if (nextRuns !== currentRuns) input.stores.projectData.replaceAll("runs", nextRuns.map((item, index) => [runId(item, index), item]));
    if (nextPipeline !== currentPipeline) input.stores.projectData.setResource("pipelineArtifacts", nextPipeline);
  });
  if (nextHierarchy !== currentHierarchy) input.hierarchy.replaceNodes(nextHierarchy);
}

const flowId = (value: any, index: number) => String(value?.flow?.flowId ?? value?.flowId ?? value?.id ?? `index:${index}`);
const recordingId = (value: any, index: number) => String(value?.recordingId ?? value?.id ?? `index:${index}`);
const runId = (value: any, index: number) => String(value?.runId ?? value?.id ?? `index:${index}`);