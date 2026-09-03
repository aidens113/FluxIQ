import type { AutomationStudioFlowDocument } from "fluxiq/automation-studio";
import { runAutomationGraphWorkerTask } from "../../graph/worker-tasks";
import { graphToTaskFlow } from "../../model/project-artifacts";
import {
  AUTOMATION_FLOW_ENDPOINTS,
  flowCommandPostflight,
  flowCommandPreflight,
  flowCommandRequestFailure,
  flowCommandThrownFailure,
  type AutomationFlowCommandCapabilities,
  type AutomationFlowCommandOutcome,
  type AutomationFlowCommandScope,
  type AutomationFlowScopeGuard
} from "./command-contracts";
import { loadedAutomationFlow, type AutomationFlowReadCache } from "./loaders";
import type { AutomationFlowDraftRepository } from "./draft-repository";

export type AutomationEditableFlowGraph = { nodes: Array<Record<string, any>>; edges: Array<Record<string, any>> };
type GraphPatchOperation =
  | { op: "add_node"; node: Record<string, unknown> }
  | { op: "move_node"; nodeId: string; x: number; y: number }
  | { op: "set_node_parameters"; nodeId: string; values: Record<string, unknown> }
  | { op: "delete_node"; nodeId: string }
  | { op: "add_edge"; edge: Record<string, unknown> }
  | { op: "delete_edge"; edgeId: string };
export type AutomationRecoverableFlowDraft = {
  projectId: string;
  flowId: string;
  savedAt: number;
  graph: AutomationEditableFlowGraph;
};

export function restoreAutomationFlowDraft(
  input: { scope: AutomationFlowCommandScope; draftKey: string | null; draft: AutomationRecoverableFlowDraft | null; signal?: AbortSignal },
  guard: AutomationFlowScopeGuard
): AutomationFlowCommandOutcome<{ draftKey: string; graph: AutomationEditableFlowGraph; savedAt: number }> {
  const preflight = flowCommandPreflight<{ draftKey: string; graph: AutomationEditableFlowGraph; savedAt: number }>(input.scope, guard, input.signal);
  if (preflight) return preflight;
  if (!input.draftKey || !input.draft) return { status: "failure", code: "DRAFT_REQUIRED", error: "No recoverable Flow draft is available." };
  if (input.draft.projectId !== input.scope.projectId) return { status: "stale", reason: "The recoverable draft belongs to another project." };
  return { status: "success", value: { draftKey: input.draftKey, graph: input.draft.graph, savedAt: input.draft.savedAt } };
}

export async function discardAutomationFlowDraft(
  input: { scope: AutomationFlowCommandScope; flowId: string; signal?: AbortSignal },
  capabilities: AutomationFlowScopeGuard & { drafts: AutomationFlowDraftRepository }
): Promise<AutomationFlowCommandOutcome<{ flowId: string }>> {
  const preflight = flowCommandPreflight<{ flowId: string }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  try {
    capabilities.drafts.removeSnapshot(input.scope.projectId, input.flowId);
    await capabilities.drafts.removeOperations(input.scope.projectId, input.flowId);
    const postflight = flowCommandPostflight<{ flowId: string }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    return { status: "success", value: { flowId: input.flowId } };
  } catch (error) {
    return flowCommandThrownFailure(error, input.signal, "The Flow draft could not be discarded.");
  }
}

export function persistAutomationFlowDraft(
  input: { scope: AutomationFlowCommandScope; flowId: string; baseUpdatedAt: number; graph: AutomationEditableFlowGraph; savedAt?: number; signal?: AbortSignal },
  capabilities: AutomationFlowScopeGuard & { drafts: AutomationFlowDraftRepository }
): AutomationFlowCommandOutcome<{ savedAt: number }> {
  const preflight = flowCommandPreflight<{ savedAt: number }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  const savedAt = input.savedAt ?? Date.now();
  const stored = capabilities.drafts.saveSnapshot({
    projectId: input.scope.projectId,
    flowId: input.flowId,
    baseUpdatedAt: input.baseUpdatedAt,
    savedAt,
    graph: input.graph
  });
  return stored
    ? { status: "success", value: { savedAt } }
    : { status: "failure", code: "DRAFT_STORAGE_UNAVAILABLE", error: "The Flow draft could not be preserved in browser storage." };
}

export async function updateAutomationFlowDraft(
  input: {
    scope: AutomationFlowCommandScope;
    flowId: string;
    graph: AutomationEditableFlowGraph | null;
    baseGraph: AutomationEditableFlowGraph | null;
    baseRevision: string;
    baseUpdatedAt: number;
    savedAt?: number;
    signal?: AbortSignal;
  },
  capabilities: AutomationFlowScopeGuard & { drafts: AutomationFlowDraftRepository }
): Promise<AutomationFlowCommandOutcome<{ graph: AutomationEditableFlowGraph | null; persisted: boolean; operationCount: number }>> {
  const preflight = flowCommandPreflight<{ graph: AutomationEditableFlowGraph | null; persisted: boolean; operationCount: number }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  try {
    if (!input.graph) {
      await capabilities.drafts.removeOperations(input.scope.projectId, input.flowId);
      const postflight = flowCommandPostflight<{ graph: AutomationEditableFlowGraph | null; persisted: boolean; operationCount: number }>(input.scope, capabilities, input.signal);
      return postflight ?? { status: "success", value: { graph: null, persisted: true, operationCount: 0 } };
    }
    if (!input.baseGraph) return { status: "success", value: { graph: input.graph, persisted: false, operationCount: 0 } };
    const result = await runAutomationGraphWorkerTask({
      kind: "diff-graph",
      before: input.baseGraph as any,
      after: input.graph as any,
      baseRevision: input.baseRevision,
      ...(input.savedAt !== undefined ? { now: input.savedAt } : {})
    }, { queueId: "flow-draft-diff" });
    if (result.kind !== "diff-graph") throw new Error("Flow draft worker returned an unexpected result.");
    const batch = result.batch;
    const persisted = await capabilities.drafts.saveOperations({
      projectId: input.scope.projectId,
      flowId: input.flowId,
      baseRevision: batch.baseRevision,
      baseUpdatedAt: input.baseUpdatedAt,
      savedAt: input.savedAt ?? Date.now(),
      operations: batch.operations,
      estimatedBytes: batch.estimatedBytes
    });
    const postflight = flowCommandPostflight<{ graph: AutomationEditableFlowGraph | null; persisted: boolean; operationCount: number }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    return persisted
      ? { status: "success", value: { graph: input.graph, persisted: true, operationCount: batch.operations.length } }
      : { status: "failure", code: "DRAFT_STORAGE_UNAVAILABLE", error: "The Flow operation draft could not be preserved." };
  } catch (error) {
    return flowCommandThrownFailure(error, input.signal, "The Flow draft could not be updated.");
  }
}

export async function saveAutomationFlowDraft(
  input: {
    scope: AutomationFlowCommandScope;
    flow: AutomationStudioFlowDocument;
    graph: AutomationEditableFlowGraph;
    authorizationPin: string;
    canonical: boolean;
    signal?: AbortSignal;
  },
  capabilities: AutomationFlowCommandCapabilities & { drafts: AutomationFlowDraftRepository; cache?: AutomationFlowReadCache }
): Promise<AutomationFlowCommandOutcome<{ flow: AutomationStudioFlowDocument; flowId: string }>> {
  const preflight = flowCommandPreflight<{ flow: AutomationStudioFlowDocument; flowId: string }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  if (!input.canonical) return { status: "failure", code: "READ_ONLY_FLOW", error: "Only canonical Flows can be saved." };
  if (input.authorizationPin.length < 4) return { status: "failure", code: "AUTHORIZATION_REQUIRED", error: "PIN is required to save a Flow." };
  const serialized = graphToTaskFlow({
    task: { taskId: input.flow.flowId, name: input.flow.name } as any,
    existingFlow: { ...input.flow, ownerKind: "flow", ownerId: input.flow.flowId } as any,
    graph: input.graph
  });
  const operations = createGraphPatchOperations(input.flow, serialized, input.graph);
  const baseRevision = flowGraphRevision(input.flow);
  try {
    const response = await capabilities.api.post<{
      result?: { status?: "applied" | "conflict"; currentRevision?: number };
      flow?: AutomationStudioFlowDocument;
    }>(AUTOMATION_FLOW_ENDPOINTS.applyGraphPatch, {
      projectId: input.scope.projectId,
      flowId: input.flow.flowId,
      authorizationPin: input.authorizationPin,
      baseRevision,
      mutationId: createGraphMutationId(input.flow.flowId),
      operations,
      message: "Save Flow graph"
    }, input.signal ? { signal: input.signal } : {});
    const postflight = flowCommandPostflight<{ flow: AutomationStudioFlowDocument; flowId: string }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    if (response.ok && response.payload?.result?.status === "conflict") {
      return { status: "failure", code: "FLOW_SAVE_CONFLICT", error: "This Flow changed after the draft began. The draft has been preserved." };
    }
    if (!response.ok || response.payload?.result?.status !== "applied" || !response.payload.flow) {
      const failure = flowCommandRequestFailure<{ flow: AutomationStudioFlowDocument; flowId: string }>(response, "Flow could not be saved.");
      return failure;
    }
    const savedFlow = loadedAutomationFlow(response.payload.flow);
    capabilities.cache?.set("flow", input.scope.projectId, input.flow.flowId, savedFlow);
    capabilities.drafts.removeSnapshot(input.scope.projectId, input.flow.flowId);
    await capabilities.drafts.removeOperations(input.scope.projectId, input.flow.flowId);
    return { status: "success", value: { flow: savedFlow, flowId: input.flow.flowId } };
  } catch (error) {
    return flowCommandThrownFailure(error, input.signal, "Flow could not be saved.");
  }
}

function createGraphPatchOperations(
  before: AutomationStudioFlowDocument,
  after: AutomationStudioFlowDocument,
  editorGraph: AutomationEditableFlowGraph
): GraphPatchOperation[] {
  const operations: GraphPatchOperation[] = [];
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
  const editorNodes = new Map(editorGraph.nodes.map((node) => [String(node.id), node]));
  const replacedNodeIds = new Set<string>();
  const removedNodeIds = new Set<string>();

  for (const [nodeId, node] of beforeNodes) {
    const next = afterNodes.get(nodeId);
    if (!next) removedNodeIds.add(nodeId);
    else if (nodeStructureSignature(node) !== nodeStructureSignature(next)) replacedNodeIds.add(nodeId);
  }
  const disruptedNodeIds = new Set([...removedNodeIds, ...replacedNodeIds]);
  const deletedEdgeIds = new Set<string>();
  for (const [edgeId, edge] of beforeEdges) {
    const next = afterEdges.get(edgeId);
    if (!next || edgeStructureSignature(edge) !== edgeStructureSignature(next)
      || disruptedNodeIds.has(edge.sourceNodeId) || disruptedNodeIds.has(edge.targetNodeId)) {
      deletedEdgeIds.add(edgeId);
      operations.push({ op: "delete_edge", edgeId });
    }
  }
  for (const nodeId of removedNodeIds) operations.push({ op: "delete_node", nodeId });
  for (const nodeId of replacedNodeIds) operations.push({ op: "delete_node", nodeId });
  for (const [nodeId, node] of afterNodes) {
    const previous = beforeNodes.get(nodeId);
    if (!previous || replacedNodeIds.has(nodeId)) {
      operations.push({ op: "add_node", node: graphPatchNode(before.flowId, node, editorNodes.get(nodeId)) });
      continue;
    }
    const previousPosition = previous.position ?? { x: 0, y: 0 };
    const nextPosition = node.position ?? { x: 0, y: 0 };
    if (previousPosition.x !== nextPosition.x || previousPosition.y !== nextPosition.y) {
      operations.push({ op: "move_node", nodeId, x: nextPosition.x, y: nextPosition.y });
    }
    if (graphValueSignature(previous.parameterValues ?? {}) !== graphValueSignature(node.parameterValues ?? {})) {
      operations.push({ op: "set_node_parameters", nodeId, values: node.parameterValues ?? {} });
    }
  }
  for (const [edgeId, edge] of afterEdges) {
    const previous = beforeEdges.get(edgeId);
    const connectedNodeReplaced = replacedNodeIds.has(edge.sourceNodeId) || replacedNodeIds.has(edge.targetNodeId);
    if ((!previous || deletedEdgeIds.has(edgeId) || connectedNodeReplaced)
      && afterNodes.has(edge.sourceNodeId) && afterNodes.has(edge.targetNodeId)) {
      operations.push({ op: "add_edge", edge: graphPatchEdge(before.flowId, edge) });
    }
  }
  return operations;
}

function graphPatchNode(flowId: string, node: AutomationStudioFlowDocument["nodes"][number], editorNode?: Record<string, any>): Record<string, unknown> {
  return {
    nodeId: node.id,
    flowId,
    definitionId: node.definitionId,
    definitionVersion: node.definitionVersion ?? "legacy",
    label: node.label ?? node.id,
    description: node.description ?? "",
    x: node.position?.x ?? 0,
    y: node.position?.y ?? 0,
    width: finiteDimension(editorNode?.measured?.width ?? editorNode?.width, 320),
    height: finiteDimension(editorNode?.measured?.height ?? editorNode?.height, 180),
    zIndex: Number.isFinite(Number(editorNode?.zIndex)) ? Math.trunc(Number(editorNode?.zIndex)) : 0,
    disabled: editorNode?.data?.disabled === true || node.metadata?.disabled === true,
    parameterValues: node.parameterValues ?? {},
    metadata: node.metadata ?? {}
  };
}

function graphPatchEdge(flowId: string, edge: AutomationStudioFlowDocument["edges"][number]): Record<string, unknown> {
  return {
    edgeId: edge.id,
    flowId,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    sourcePortId: edge.sourcePortId ?? null,
    targetPortId: edge.targetPortId ?? null,
    label: edge.label ?? "",
    metadata: edge.metadata ?? {}
  };
}

function nodeStructureSignature(node: AutomationStudioFlowDocument["nodes"][number]): string {
  return graphValueSignature({
    definitionId: node.definitionId,
    definitionVersion: node.definitionVersion ?? "legacy",
    label: node.label ?? node.id,
    description: node.description ?? "",
    metadata: durableGraphMetadata(node.metadata)
  });
}

function edgeStructureSignature(edge: AutomationStudioFlowDocument["edges"][number]): string {
  return graphValueSignature({
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    sourcePortId: edge.sourcePortId ?? null,
    targetPortId: edge.targetPortId ?? null,
    label: edge.label ?? "",
    metadata: durableGraphMetadata(edge.metadata)
  });
}

function durableGraphMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata) return {};
  const { order: _presentationOrder, ...durable } = metadata;
  return durable;
}

function graphValueSignature(value: unknown): string {
  return JSON.stringify(value);
}

function finiteDimension(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function flowGraphRevision(flow: AutomationStudioFlowDocument): number {
  const revision = Number((flow as AutomationStudioFlowDocument & { graphRevision?: unknown }).graphRevision ?? flow.metadata?.graphRevision ?? 1);
  return Number.isInteger(revision) && revision > 0 ? revision : 1;
}

function createGraphMutationId(flowId: string): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`;
  return `flow-editor.${flowId}.${suffix}`;
}
