import type { AutomationStudioFlowDocument, AutomationStudioTaskArtifact, PolicyGraph } from "fluxiq/automation-studio";
import type { AutomationHierarchyNode } from "../hierarchy/model";

export function mergeById<TItem extends Record<string, unknown>>(primary: TItem[], secondary: TItem[], idKey: keyof TItem): TItem[] {
  const seen = new Set<string>();
  const merged: TItem[] = [];
  for (const item of [...primary, ...secondary]) {
    const id = String(item[idKey] ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
}

export function isPersistableHierarchyNode(node: AutomationHierarchyNode): boolean {
  return node.kind !== "task" || !node.sourceId?.startsWith("draft.");
}

export function taskPolicyId(taskId: string): string {
  return `policy.${taskId.replace(/[^a-zA-Z0-9._-]+/g, ".")}.saved`;
}

export function taskFlowId(taskId: string): string {
  return `task.${taskId.replace(/[^a-zA-Z0-9._-]+/g, ".")}.graph`;
}

export function flowToTaskPolicy(
  flow: AutomationStudioFlowDocument | null | undefined,
  task: AutomationStudioTaskArtifact | null | undefined,
): PolicyGraph | null {
  if (!flow) return null;
  const policyId = typeof flow.metadata?.policyId === "string" ? flow.metadata.policyId : taskPolicyId(task?.taskId ?? flow.ownerId ?? flow.flowId);
  const nodes = flow.nodes.map((node, index) => {
    const values = node.parameterValues && typeof node.parameterValues === "object" ? node.parameterValues : {};
    const actions = Array.isArray(values.actions) ? values.actions : [];
    const eligibility = values.eligibility && typeof values.eligibility === "object" ? values.eligibility : { type: "all", conditions: [] };
    const successConditions =
      values.successConditions && typeof values.successConditions === "object" ? values.successConditions : { type: "all", conditions: [] };
    const timeout = values.timeout && typeof values.timeout === "object" ? values.timeout : { timeoutMs: 5000 };
    const retry = values.retry && typeof values.retry === "object" ? values.retry : { maxAttempts: 1, backoffMs: 500 };
    const recovery = values.recovery && typeof values.recovery === "object" ? values.recovery : { strategy: "pause" };
    return {
      id: node.id,
      label: node.label ?? node.id,
      description: node.description ?? "",
      eligibility,
      actions,
      successConditions,
      failureConditions: values.failureConditions && typeof values.failureConditions === "object" ? values.failureConditions : { type: "none", conditions: [] },
      timeout,
      retry,
      recovery,
      outgoingEdges: [],
      sourceEvidence: [],
      generatedMetadata: { generatedBy: "task_flow", generatedAt: flow.updatedAt ?? Date.now(), confidence: 0.5 },
      metadata: { ...(node.metadata ?? {}), position: node.position, nodeDefinitionId: node.definitionId, parameterValues: values, order: index },
    };
  });
  const edges = flow.edges.map((edge, index) => ({
    id: edge.id,
    fromNodeId: edge.sourceNodeId,
    toNodeId: edge.targetNodeId,
    label: edge.label ?? (typeof edge.metadata?.label === "string" ? edge.metadata.label : "Next"),
    metadata: { ...(edge.metadata ?? {}), order: index },
  }));
  return {
    schemaVersion: "0.1",
    policyId,
    taskId: task?.taskId ?? flow.ownerId,
    version: "0.1",
    nodes: nodes.map((node) => ({ ...node, outgoingEdges: edges.filter((edge) => edge.fromNodeId === node.id) })),
    edges,
    sourceEvidence: [],
    generatedMetadata: { generatedBy: "task_flow", generatedAt: flow.updatedAt ?? Date.now(), confidence: 0.5 },
    metadata: { ...(flow.metadata ?? {}), source: "task_flow" },
  } as unknown as PolicyGraph;
}

export function graphToTaskFlow(input: {
  task: AutomationStudioTaskArtifact;
  existingFlow?: AutomationStudioFlowDocument;
  graph: { nodes: Array<Record<string, any>>; edges: Array<Record<string, any>> };
  policy?: PolicyGraph | null;
}): AutomationStudioFlowDocument {
  const now = Date.now();
  const flowId = input.existingFlow?.flowId ?? input.task.graphId ?? input.task.policyFlowId ?? taskFlowId(input.task.taskId);
  const policyId = input.policy?.policyId ?? input.existingFlow?.metadata?.policyId ?? taskPolicyId(input.task.taskId);
  return {
    schemaVersion: "0.1",
    flowId,
    ownerKind: "task",
    ownerId: input.task.taskId,
    name: input.task.name ?? input.task.taskId,
    description: input.task.description ?? `Task graph for ${input.task.name ?? input.task.taskId}.`,
    nodes: input.graph.nodes.map((node, index) => ({
      id: node.id,
      definitionId: node.data?.nodeDefinitionId ?? (node.data?.isStart ? "builtin.control.start" : "automation.policy.step"),
      ...(node.data?.nodeDefinitionVersion ? { definitionVersion: node.data.nodeDefinitionVersion } : {}),
      label: node.data?.label ?? node.id,
      description: node.data?.customDescription || node.data?.description,
      position: { x: Math.round(node.position?.x ?? index * 340), y: Math.round(node.position?.y ?? 160) },
      parameterValues: {
        ...(node.data?.parameterValues ?? {}),
        actions: Array.isArray(node.data?.parameterValues?.actions)
          ? node.data.parameterValues.actions
          : (node.data?.actionTypes ?? []).map((actionType: string, actionIndex: number) => ({
              id: `action.${node.id}.${actionIndex + 1}`,
              actionType,
              parameters: {},
            })),
        eligibility: node.data?.parameterValues?.eligibility ?? { type: "all", conditions: [] },
        successConditions: node.data?.parameterValues?.successConditions ?? { type: "all", conditions: [] },
        timeout: node.data?.parameterValues?.timeout ?? { timeoutMs: node.data?.timeoutMs ?? 5000 },
        retry: node.data?.parameterValues?.retry ?? { maxAttempts: 1, backoffMs: 500 },
        recovery: node.data?.parameterValues?.recovery ?? { strategy: node.data?.recovery ?? "pause" },
      },
      metadata: {
        ...(input.existingFlow?.nodes.find((item) => item.id === node.id)?.metadata ?? {}),
        ...(node.data?.metadata ?? {}),
        policyId,
        policyNodeId: node.id,
        order: index,
      },
    })),
    edges: input.graph.edges.map((edge, index) => ({
      id: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      sourcePortId: edge.sourceHandle ?? edge.data?.sourcePort,
      targetPortId: edge.targetHandle ?? edge.data?.targetPort,
      label: String(edge.label ?? edge.data?.label ?? "Next"),
      metadata: { ...(edge.data ?? {}), policyId, policyEdgeId: edge.id, order: index },
    })),
    createdAt: input.existingFlow?.createdAt ?? now,
    updatedAt: now,
    metadata: { ...(input.existingFlow?.metadata ?? {}), source: "task_editor", policyId, savedAt: now },
  };
}
