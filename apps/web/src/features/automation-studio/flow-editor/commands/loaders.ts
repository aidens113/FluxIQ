import {
  AUTOMATION_FLOW_ENDPOINTS,
  flowCommandPostflight,
  flowCommandPreflight,
  flowCommandRequestFailure,
  flowCommandThrownFailure,
  type AutomationFlowCommandCapabilities,
  type AutomationFlowCommandOutcome,
  type AutomationFlowCommandScope
} from "./command-contracts";

export type AutomationFlowReadCache = {
  get<T>(scope: "flow" | "node-definitions" | "subflow", projectId: string, resourceId: string): T | null;
  set<T>(scope: "flow" | "node-definitions" | "subflow", projectId: string, resourceId: string, value: T): T;
};

type LoaderCapabilities = AutomationFlowCommandCapabilities & { cache?: AutomationFlowReadCache };

export async function loadAutomationFlowDetail<TFlow>(
  input: { scope: AutomationFlowCommandScope; flowId: string; refresh?: boolean; signal?: AbortSignal },
  capabilities: LoaderCapabilities
): Promise<AutomationFlowCommandOutcome<{ flow: TFlow; source: "cache" | "network" }>> {
  const preflight = flowCommandPreflight<{ flow: TFlow; source: "cache" | "network" }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  const cached = input.refresh ? null : capabilities.cache?.get<TFlow>("flow", input.scope.projectId, input.flowId);
  if (cached && !isAutomationFlowSummary(cached)) {
    return { status: "success", value: { flow: cached, source: "cache" } };
  }
  try {
    const nodes = new Map<string, GraphViewportNode>();
    const edges = new Map<string, GraphViewportEdge>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    let baseFlow: TFlow | null = null;
    let graphRevision = 1;
    do {
      const response: GraphViewportApiResponse<TFlow> = await capabilities.api.post<GraphViewportResponse<TFlow>>(AUTOMATION_FLOW_ENDPOINTS.detail, {
        projectId: input.scope.projectId,
        flowId: input.flowId,
        bounds: FULL_GRAPH_BOUNDS,
        limit: 500,
        ...(cursor ? { cursor } : {})
      }, input.signal ? { signal: input.signal } : {});
      if (!response.ok || !response.payload?.flow || !response.payload.page) {
        return flowCommandRequestFailure(response, "Flow details could not be loaded.");
      }
      baseFlow ??= response.payload.flow;
      graphRevision = response.payload.page.graphRevision;
      for (const node of response.payload.page.nodes ?? []) nodes.set(node.nodeId, node);
      for (const edge of [...(response.payload.page.edges ?? []), ...(response.payload.page.boundaryEdges ?? [])]) edges.set(edge.edgeId, edge);
      const nextCursor: string | null = response.payload.page.hasMore ? response.payload.page.nextCursor : null;
      if (nextCursor && seenCursors.has(nextCursor)) return { status: "failure", error: "Flow graph pagination returned a repeated cursor." };
      if (nextCursor) seenCursors.add(nextCursor);
      cursor = nextCursor;
    } while (cursor);
    const postflight = flowCommandPostflight<{ flow: TFlow; source: "cache" | "network" }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    if (!baseFlow) return { status: "failure", error: "Flow details could not be loaded." };
    const detail = loadedAutomationFlow({
      ...(baseFlow as Record<string, unknown>),
      nodes: [...nodes.values()].map(flowNodeFromViewport),
      edges: [...edges.values()].map(flowEdgeFromViewport),
      metadata: {
        ...((baseFlow as { metadata?: Record<string, unknown> }).metadata ?? {}),
        graphRevision
      }
    } as TFlow);
    const cachedFlow = capabilities.cache?.set("flow", input.scope.projectId, input.flowId, detail) ?? detail;
    return { status: "success", value: { flow: cachedFlow, source: "network" } };
  } catch (error) {
    return flowCommandThrownFailure(error, input.signal, "Flow details could not be loaded.");
  }
}

const FULL_GRAPH_BOUNDS = { minX: -9_000_000_000_000_000, minY: -9_000_000_000_000_000, maxX: 9_000_000_000_000_000, maxY: 9_000_000_000_000_000 };
type GraphViewportNode = { nodeId: string; definitionId: string; definitionVersion: string; label: string; description: string; parameterValues: Record<string, unknown>; x: number; y: number; metadata: Record<string, unknown> };
type GraphViewportEdge = { edgeId: string; sourceNodeId: string; targetNodeId: string; sourcePortId: string | null; targetPortId: string | null; label: string; metadata: Record<string, unknown> };
type GraphViewportResponse<TFlow> = {
  flow?: TFlow;
  page?: { graphRevision: number; nodes?: GraphViewportNode[]; edges?: GraphViewportEdge[]; boundaryEdges?: GraphViewportEdge[]; nextCursor: string | null; hasMore: boolean };
};
type GraphViewportApiResponse<TFlow> = { ok: boolean; payload?: GraphViewportResponse<TFlow>; error?: string; aborted?: boolean };

function flowNodeFromViewport(node: GraphViewportNode) {
  return {
    id: node.nodeId,
    definitionId: node.definitionId,
    definitionVersion: node.definitionVersion,
    ...(node.label ? { label: node.label } : {}),
    ...(node.description ? { description: node.description } : {}),
    parameterValues: node.parameterValues,
    position: { x: node.x, y: node.y },
    metadata: node.metadata
  };
}

function flowEdgeFromViewport(edge: GraphViewportEdge) {
  return {
    id: edge.edgeId,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    ...(edge.sourcePortId ? { sourcePortId: edge.sourcePortId } : {}),
    ...(edge.targetPortId ? { targetPortId: edge.targetPortId } : {}),
    ...(edge.label ? { label: edge.label } : {}),
    metadata: edge.metadata
  };
}

function isAutomationFlowSummary(flow: unknown): boolean {
  return Boolean(
    flow
    && typeof flow === "object"
    && (flow as { metadata?: Record<string, unknown> }).metadata?.summaryOnly === true
  );
}

export function loadedAutomationFlow<TFlow>(flow: TFlow): TFlow {
  if (!flow || typeof flow !== "object") return flow;
  const metadata = (flow as { metadata?: Record<string, unknown> }).metadata;
  if (!metadata || !("summaryOnly" in metadata)) return flow;
  const { summaryOnly: _summaryOnly, ...detailMetadata } = metadata;
  return { ...(flow as Record<string, unknown>), metadata: detailMetadata } as TFlow;
}

export async function loadAutomationNodeDefinitions<TNode>(
  input: { scope: AutomationFlowCommandScope; signal?: AbortSignal },
  capabilities: LoaderCapabilities
): Promise<AutomationFlowCommandOutcome<{ native: TNode[]; published: TNode[]; source: "cache" | "network" }>> {
  const resourceId = "root";
  const preflight = flowCommandPreflight<{ native: TNode[]; published: TNode[]; source: "cache" | "network" }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  const cached = capabilities.cache?.get<{ native: TNode[]; published: TNode[] }>("node-definitions", input.scope.projectId, resourceId);
  if (cached) return { status: "success", value: { ...cached, source: "cache" } };
  try {
    const options = input.signal ? { signal: input.signal } : {};
    const [nativeResponse, publishedResponse] = await Promise.all([
      capabilities.api.post<{ nodes?: TNode[] }>(AUTOMATION_FLOW_ENDPOINTS.nativeNodeDefinitions, { projectId: input.scope.projectId }, options),
      capabilities.api.post<{ nodes?: TNode[] }>(AUTOMATION_FLOW_ENDPOINTS.publishedFlowNodes, { projectId: input.scope.projectId }, options)
    ]);
    const postflight = flowCommandPostflight<{ native: TNode[]; published: TNode[]; source: "cache" | "network" }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    if (!nativeResponse.ok) return flowCommandRequestFailure(nativeResponse, "Native node definitions could not be loaded.");
    if (!publishedResponse.ok) return flowCommandRequestFailure(publishedResponse, "Published Flow nodes could not be loaded.");
    const definitions = { native: nativeResponse.payload?.nodes ?? [], published: publishedResponse.payload?.nodes ?? [] };
    capabilities.cache?.set("node-definitions", input.scope.projectId, resourceId, definitions);
    return { status: "success", value: { ...definitions, source: "network" } };
  } catch (error) {
    return flowCommandThrownFailure(error, input.signal, "Node definitions could not be loaded.");
  }
}

export async function resolveAutomationSubflowEditor(
  input: { scope: AutomationFlowCommandScope; parentFlowId: string; subflowId: string; knownGraphFlowId?: string; signal?: AbortSignal },
  capabilities: LoaderCapabilities
): Promise<AutomationFlowCommandOutcome<{ graphFlowId: string; source: "known" | "cache" | "network" }>> {
  const preflight = flowCommandPreflight<{ graphFlowId: string; source: "known" | "cache" | "network" }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  const cacheId = input.parentFlowId + ":" + input.subflowId;
  if (input.knownGraphFlowId) {
    capabilities.cache?.set("subflow", input.scope.projectId, cacheId, { graphFlowId: input.knownGraphFlowId });
    return { status: "success", value: { graphFlowId: input.knownGraphFlowId, source: "known" } };
  }
  const cached = capabilities.cache?.get<{ graphFlowId?: string }>("subflow", input.scope.projectId, cacheId);
  if (cached?.graphFlowId) return { status: "success", value: { graphFlowId: cached.graphFlowId, source: "cache" } };
  try {
    const response = await capabilities.api.post<{ subflow?: { graphFlowId?: string } }>(AUTOMATION_FLOW_ENDPOINTS.subflow, {
      projectId: input.scope.projectId,
      flowId: input.parentFlowId,
      subflowId: input.subflowId
    }, input.signal ? { signal: input.signal } : {});
    const postflight = flowCommandPostflight<{ graphFlowId: string; source: "known" | "cache" | "network" }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    const graphFlowId = response.payload?.subflow?.graphFlowId;
    if (!response.ok || !graphFlowId) return flowCommandRequestFailure(response, "Subflow graph could not be resolved.");
    capabilities.cache?.set("subflow", input.scope.projectId, cacheId, response.payload?.subflow ?? { graphFlowId });
    return { status: "success", value: { graphFlowId, source: "network" } };
  } catch (error) {
    return flowCommandThrownFailure(error, input.signal, "Subflow graph could not be resolved.");
  }
}
