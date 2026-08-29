import {
  applyCustomFolderCreate,
  applySubflowCategoryCreate
} from "../model/local-mutations";
import {
  mergeCreatedFlowIntoProjectFlows,
  mergeFlowDetails,
  upsertSubflowSummaryIntoProjectFlows
} from "../model/project-change-reconciliation";
import { automationFlowPreset } from "../model/live-helpers";
import type {
  AutomationHierarchyCommandDependencies,
  AutomationHierarchyExecutionResult
} from "./command-executor-contracts";
import {
  failure,
  hierarchySubflowParent,
  loadHierarchyFlow,
  normalizeSubflowCategories,
  randomId,
  success
} from "./command-executor-support";
import type { AutomationHierarchyDialogTransaction } from "./dialog-transaction";
export async function executeHierarchyCreateCommand(
  transaction: Extract<AutomationHierarchyDialogTransaction, { kind: "create" }>,
  dependencies: AutomationHierarchyCommandDependencies
): Promise<AutomationHierarchyExecutionResult> {
  const projectId = dependencies.projectId;
  const name = transaction.name.trim();
  if (transaction.createKind === "flow") {
    if (!projectId) return failure("Open a project before creating a flow.");
    const created = await dependencies.commands.createFlow({
      projectId,
      authorizationPin: transaction.authorizationPin,
      name,
      description: "Visual Flow created in Automation Studio."
    });
    if (!created.ok || !created.payload?.flow) return failure(created.error ?? "Flow could not be saved.");
    const preset = automationFlowPreset(created.payload.flow, transaction.flowOrigin);
    const saved = transaction.flowOrigin === "blank"
      ? created
      : await dependencies.commands.saveFlow({ projectId, authorizationPin: transaction.authorizationPin, flow: preset });
    if (!saved.ok) return failure(saved.error ?? "Flow was created but its preset could not be saved.");
    const flow = saved.payload?.flow ?? created.payload.flow;
    dependencies.rememberFlow(flow.flowId, flow);
    dependencies.updateProjectFlows((current) => mergeCreatedFlowIntoProjectFlows(current, flow));
    dependencies.openCreatedFlow(flow.flowId);
    dependencies.notifyChanged(["flow", "summary"], [flow.flowId]);
    return success();
  }

  const parent = transaction.parentId ? dependencies.nodeById.get(transaction.parentId) ?? null : null;
  const subflowParent = parent ? hierarchySubflowParent(parent) : null;
  if (subflowParent) {
    return transaction.createKind === "subflow"
      ? createSubflow(transaction, subflowParent, dependencies)
      : createSubflowCategory(transaction, subflowParent, dependencies);
  }

  const timestamp = dependencies.now?.() ?? Date.now();
  const id = dependencies.createId?.() ?? "custom-" + transaction.createKind + "-" + timestamp;
  dependencies.updateCustomNodes((current) => applyCustomFolderCreate(current, {
    id,
    kind: transaction.createKind,
    category: transaction.category,
    label: name,
    parentId: transaction.parentId
  }).next);
  return success();
}

async function createSubflow(
  transaction: Extract<AutomationHierarchyDialogTransaction, { kind: "create" }>,
  parent: { flowId: string; parentCategoryId: string | null },
  dependencies: AutomationHierarchyCommandDependencies
): Promise<AutomationHierarchyExecutionResult> {
  if (!dependencies.projectId) return failure("Open a project before creating a subflow.");
  const result = await dependencies.commands.createSubflow({
    projectId: dependencies.projectId,
    flowId: parent.flowId,
    authorizationPin: transaction.authorizationPin,
    name: transaction.name,
    role: "utility",
    parentCategoryId: parent.parentCategoryId
  });
  if (!result.ok || !result.payload?.subflow) return failure(result.error ?? "Subflow could not be created.");
  const subflow = result.payload.subflow;
  dependencies.commitSubflowChanged(parent.flowId, subflow.subflowId);
  dependencies.notifyChanged(["flow", "subflow", "summary"], [parent.flowId, subflow.subflowId]);
  dependencies.updateProjectFlows((current) => upsertSubflowSummaryIntoProjectFlows(current, parent.flowId, subflow));
  dependencies.openCreatedSubflow(subflow.graphFlowId ?? parent.flowId + "." + subflow.subflowId + ".graph");
  return success();
}

async function createSubflowCategory(
  transaction: Extract<AutomationHierarchyDialogTransaction, { kind: "create" }>,
  parent: { flowId: string; parentCategoryId: string | null },
  dependencies: AutomationHierarchyCommandDependencies
): Promise<AutomationHierarchyExecutionResult> {
  if (!dependencies.projectId) return failure("Open a project before creating a subflow category.");
  const loaded = await loadHierarchyFlow(parent.flowId, dependencies);
  if (!loaded.ok) return loaded;
  const categories = normalizeSubflowCategories(loaded.flow.metadata?.subflowCategories);
  if (categories.some((category) => category.parentId === parent.parentCategoryId && category.name.toLowerCase() === transaction.name.toLowerCase())) {
    return failure("A subflow category with that name already exists in this folder.");
  }
  const now = dependencies.now?.() ?? Date.now();
  const category = {
    id: dependencies.createId?.() ?? "subflow-category." + randomId(now),
    name: transaction.name,
    parentId: parent.parentCategoryId,
    createdAt: now,
    updatedAt: now
  };
  const nextFlow = {
    ...loaded.flow,
    metadata: { ...(loaded.flow.metadata ?? {}), subflowCategories: [...categories, category] }
  };
  const result = await dependencies.commands.saveFlow({
    projectId: dependencies.projectId,
    authorizationPin: transaction.authorizationPin,
    flow: nextFlow
  });
  if (!result.ok || !result.payload?.flow) return failure(result.error ?? "Subflow category could not be saved.");
  dependencies.rememberFlow(parent.flowId, result.payload.flow);
  dependencies.updateProjectFlows((current) => applySubflowCategoryCreate(
    mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow: result.payload!.flow }]),
    parent.flowId,
    category
  ).next);
  dependencies.notifyChanged(["flow", "subflow", "summary"], [parent.flowId, category.id]);
  return success();
}
