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
  input: { scope: AutomationFlowCommandScope; flowId: string; signal?: AbortSignal },
  capabilities: LoaderCapabilities
): Promise<AutomationFlowCommandOutcome<{ flow: TFlow; source: "cache" | "network" }>> {
  const preflight = flowCommandPreflight<{ flow: TFlow; source: "cache" | "network" }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  const cached = capabilities.cache?.get<TFlow>("flow", input.scope.projectId, input.flowId);
  if (cached) return { status: "success", value: { flow: cached, source: "cache" } };
  try {
    const response = await capabilities.api.post<{ flow?: TFlow }>(AUTOMATION_FLOW_ENDPOINTS.detail, {
      projectId: input.scope.projectId,
      flowId: input.flowId
    }, input.signal ? { signal: input.signal } : {});
    const postflight = flowCommandPostflight<{ flow: TFlow; source: "cache" | "network" }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    if (!response.ok || !response.payload?.flow) return flowCommandRequestFailure(response, "Flow details could not be loaded.");
    const flow = capabilities.cache?.set("flow", input.scope.projectId, input.flowId, response.payload.flow) ?? response.payload.flow;
    return { status: "success", value: { flow, source: "network" } };
  } catch (error) {
    return flowCommandThrownFailure(error, input.signal, "Flow details could not be loaded.");
  }
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
