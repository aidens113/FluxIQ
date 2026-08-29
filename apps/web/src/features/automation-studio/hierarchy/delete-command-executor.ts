import {
  applySubflowCategoryDelete,
  applySubflowReferenceDelete,
  type FlowObjectKind
} from "../model/local-mutations";
import {
  flowDocumentWithoutFlowObjectReferences,
  flowDocumentWithoutSubflowCategory,
  mergeFlowDetails,
  removeDeletedFlowsFromProjectFlows,
  removeFlowObjectReferencesFromProjectFlows,
  removeSubflowSummaryFromProjectFlows
} from "../model/project-change-reconciliation";
import { automationHierarchyNodeIsSubflowCategory } from "./capabilities";
import type {
  AutomationHierarchyCommandDependencies,
  AutomationHierarchyExecutionResult
} from "./command-executor-contracts";
import {
  failure,
  isHierarchyNode,
  isString,
  loadHierarchyFlow,
  removeCustomSubtree,
  success
} from "./command-executor-support";
import type { AutomationHierarchyNode } from "./contracts";
import type { AutomationHierarchyDialogTransaction } from "./dialog-transaction";
import { collectHierarchyDescendantIds } from "./model";
export async function executeHierarchyDeleteCommand(
  transaction: Extract<AutomationHierarchyDialogTransaction, { kind: "delete" }>,
  dependencies: AutomationHierarchyCommandDependencies
): Promise<AutomationHierarchyExecutionResult> {
  const root = dependencies.nodeById.get(transaction.node.id) ?? transaction.node;
  const descendantIds = collectHierarchyDescendantIds(root.id, dependencies.nodes as AutomationHierarchyNode[]);
  const deletingNodes = [root, ...descendantIds.map((id) => dependencies.nodeById.get(id)).filter(isHierarchyNode)];
  const recordingIds = deletingNodes.filter((node) => node.kind === "recording" && node.sourceId).map((node) => node.sourceId!);
  if ((root.kind === "recording" || root.category === "recording") && recordingIds.length) {
    if (!await dependencies.deleteRecordings(recordingIds, transaction.authorizationPin)) return failure("Recordings could not be deleted.");
    dependencies.updateDeletedIds((current) => current.filter((id) => !id.startsWith("recordings-client-") && !recordingIds.includes(id)));
    removeCustomSubtree(root.id, descendantIds, dependencies);
    return success();
  }

  const categoryNodes = deletingNodes.filter(automationHierarchyNodeIsSubflowCategory);
  if (automationHierarchyNodeIsSubflowCategory(root) && categoryNodes.length) {
    return deleteSubflowCategories(categoryNodes, deletingNodes, transaction.authorizationPin, dependencies);
  }

  const subflowNodes = root.kind === "subflow"
    ? deletingNodes.filter((node) => node.kind === "subflow" && node.flowId && node.sourceId)
    : [];
  if (subflowNodes.length) {
    return deleteSubflows(subflowNodes, deletingNodes, transaction.authorizationPin, dependencies);
  }

  const flowObjectNodes = deletingNodes.filter((node) => node.sourceId && node.flowId && (node.kind === "instruction" || node.kind === "adaptation"));
  if (flowObjectNodes.length && (root.kind === "instruction" || root.kind === "adaptation")) {
    return deleteFlowObjects(flowObjectNodes, deletingNodes, transaction.authorizationPin, dependencies);
  }

  const flowNodes = deletingNodes.filter((node) => node.kind === "flow" && node.sourceId && dependencies.canonicalFlowIds.has(node.sourceId));
  if (flowNodes.length) {
    if (!dependencies.projectId) return failure("Open a project before deleting flows.");
    for (const node of flowNodes) {
      const result = await dependencies.commands.deleteFlow(node.sourceId!, transaction.authorizationPin);
      if (!result.ok) return failure(result.error ?? node.label + " could not be deleted.");
    }
    dependencies.closeDeletedViews(flowNodes);
    const flowIds = flowNodes.map((node) => node.sourceId).filter(isString);
    dependencies.updateProjectFlows((current) => removeDeletedFlowsFromProjectFlows(current, flowIds));
    for (const flowId of flowIds) dependencies.clearFlowDrafts(flowId);
    dependencies.notifyChanged(["flow", "subflow", "summary"], flowIds);
    if (dependencies.selection?.kind === "flow" && flowIds.includes(dependencies.selection.id)) dependencies.setSelection(null);
  }

  const artifactNodes = deletingNodes.filter((node): node is AutomationHierarchyNode & { kind: "task" | "routine" | "config"; sourceId: string } =>
    (node.kind === "task" || node.kind === "routine" || node.kind === "config") && Boolean(node.sourceId));
  if (artifactNodes.length) {
    if (!dependencies.projectId) return failure("Open a project before deleting saved artifacts.");
    for (const node of artifactNodes) {
      const result = await dependencies.commands.deleteArtifact({
        projectId: dependencies.projectId,
        kind: node.kind,
        artifactId: node.sourceId,
        deleteOwnedArtifacts: true,
        authorizationPin: transaction.authorizationPin
      });
      if (!result.ok) return failure(result.error ?? node.label + " could not be deleted from disk.");
    }
    dependencies.closeDeletedViews(deletingNodes);
    dependencies.notifyChanged(["summary"], artifactNodes.map((node) => node.sourceId));
    const deletedTasks = new Set(artifactNodes.filter((node) => node.kind === "task").map((node) => node.sourceId));
    if (dependencies.selection?.kind === "policy" && deletedTasks.has(dependencies.selection.id)) {
      const nextTask = dependencies.projectTasks.find((task) => task.taskId && !deletedTasks.has(task.taskId));
      dependencies.setSelection(nextTask?.taskId ? { kind: "policy", id: nextTask.taskId } : null);
    }
  }

  const persistedNodeIds = new Set([...artifactNodes, ...flowNodes].map((node) => node.id));
  const hierarchyOnlyIds = [root.id, ...descendantIds].filter((id) => !persistedNodeIds.has(id));
  if (hierarchyOnlyIds.length) dependencies.updateDeletedIds((current) => [...new Set([...current, ...hierarchyOnlyIds])]);
  removeCustomSubtree(root.id, descendantIds, dependencies);
  return success();
}

async function deleteSubflowCategories(
  categoryNodes: AutomationHierarchyNode[],
  deletingNodes: AutomationHierarchyNode[],
  authorizationPin: string,
  dependencies: AutomationHierarchyCommandDependencies
): Promise<AutomationHierarchyExecutionResult> {
  if (!dependencies.projectId) return failure("Open a project before deleting subflow categories.");
  const byFlow = new Map<string, string[]>();
  for (const node of categoryNodes) {
    if (node.flowId && node.sourceId) byFlow.set(node.flowId, [...(byFlow.get(node.flowId) ?? []), node.sourceId]);
  }
  for (const [flowId, categoryIds] of byFlow) {
    const loaded = await loadHierarchyFlow(flowId, dependencies);
    if (!loaded.ok) return loaded;
    const nextFlow = categoryIds.reduce((flow, categoryId) => flowDocumentWithoutSubflowCategory(flow, categoryId), loaded.flow);
    const saved = await dependencies.commands.saveFlow({ projectId: dependencies.projectId, authorizationPin, flow: nextFlow });
    if (!saved.ok) return failure(saved.error ?? "Subflow category could not be deleted.");
    const flow = saved.payload?.flow ?? nextFlow;
    dependencies.rememberFlow(flowId, flow);
    dependencies.updateProjectFlows((current) => categoryIds.reduce(
      (entries, categoryId) => applySubflowCategoryDelete(entries, flowId, categoryId).next,
      mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow }])
    ));
  }
  dependencies.closeDeletedViews(deletingNodes);
  dependencies.notifyChanged(["flow", "subflow", "summary"], [...byFlow.keys(), ...categoryNodes.map((node) => node.sourceId).filter(isString)]);
  return success();
}

async function deleteSubflows(
  subflows: AutomationHierarchyNode[],
  deletingNodes: AutomationHierarchyNode[],
  authorizationPin: string,
  dependencies: AutomationHierarchyCommandDependencies
): Promise<AutomationHierarchyExecutionResult> {
  if (!dependencies.projectId) return failure("Open a project before deleting subflows.");
  for (const node of subflows) {
    const result = await dependencies.commands.deleteSubflow({
      projectId: dependencies.projectId,
      flowId: node.flowId!,
      subflowId: node.sourceId!,
      authorizationPin
    });
    if (!result.ok) return failure(result.error ?? node.label + " could not be deleted.");
    dependencies.updateProjectFlows((current) => applySubflowReferenceDelete(
      removeSubflowSummaryFromProjectFlows(
        removeDeletedFlowsFromProjectFlows(current, typeof node.metadata?.graphFlowId === "string" ? [node.metadata.graphFlowId] : []),
        node.flowId!,
        [node.sourceId!]
      ),
      node.flowId!,
      node.sourceId!
    ).next);
    if (typeof node.metadata?.graphFlowId === "string") dependencies.clearFlowDrafts(node.metadata.graphFlowId);
  }
  dependencies.closeDeletedViews(deletingNodes);
  dependencies.notifyChanged(["flow", "subflow", "summary"], subflows.flatMap((node) => [
    node.flowId!,
    node.sourceId!,
    typeof node.metadata?.graphFlowId === "string" ? node.metadata.graphFlowId : ""
  ]).filter(Boolean));
  if (dependencies.selection?.kind === "flow" && subflows.some((node) => node.metadata?.graphFlowId === dependencies.selection?.id)) {
    dependencies.setSelection(null);
  }
  return success();
}

async function deleteFlowObjects(
  nodes: AutomationHierarchyNode[],
  deletingNodes: AutomationHierarchyNode[],
  authorizationPin: string,
  dependencies: AutomationHierarchyCommandDependencies
): Promise<AutomationHierarchyExecutionResult> {
  if (!dependencies.projectId) return failure("Open a project before removing Flow objects.");
  const byFlow = new Map<string, Array<{ kind: FlowObjectKind; ids: string[] }>>();
  for (const node of nodes) {
    const kind: FlowObjectKind = node.kind === "instruction" ? "instruction" : "adaptation";
    byFlow.set(node.flowId!, [...(byFlow.get(node.flowId!) ?? []), { kind, ids: [node.sourceId!] }]);
  }
  for (const [flowId, removals] of byFlow) {
    const loaded = await loadHierarchyFlow(flowId, dependencies);
    if (!loaded.ok) return loaded;
    let nextFlow = loaded.flow;
    for (const removal of removals) nextFlow = flowDocumentWithoutFlowObjectReferences(nextFlow, removal.kind, removal.ids);
    const saved = await dependencies.commands.saveFlow({ projectId: dependencies.projectId, authorizationPin, flow: nextFlow });
    if (!saved.ok) return failure(saved.error ?? "Flow object could not be removed.");
    const flow = saved.payload?.flow ?? nextFlow;
    dependencies.rememberFlow(flowId, flow);
    dependencies.updateProjectFlows((current) => removals.reduce(
      (entries, removal) => removeFlowObjectReferencesFromProjectFlows(entries, flowId, removal.kind, removal.ids),
      mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow }])
    ));
  }
  dependencies.closeDeletedViews(deletingNodes);
  dependencies.notifyChanged(["flow", "summary"], nodes.flatMap((node) => [node.flowId!, node.sourceId!]).filter(Boolean));
  return success();
}

