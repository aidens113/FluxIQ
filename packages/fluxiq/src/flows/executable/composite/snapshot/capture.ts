import type { ExecutableFlowSnapshot } from "./contracts.ts";
import { digestExecutableFlowSnapshot } from "./digest.ts";
import { getCallFlowConfiguration } from "../configuration.ts";

/** Captures executable content and dependency pins without publication/display state. */
export function captureExecutableFlowSnapshot(
  flow: Pick<ExecutableFlowSnapshot, "flowId" | "scope" | "interface" | "errors" | "nodes" | "edges" | "executionDefaults" | "regions" | "regionHandoffs">,
  version: string,
  metadata: { dependencyDigests?: Map<string, string>; requiredRuntimeCapabilities?: Iterable<string> } = {}
): ExecutableFlowSnapshot {
  const interfaceSnapshot = structuredClone(flow.interface);
  const dependenciesById = new Map<string, { flowId: string; version: string; flowDigest?: string }>();
  for (const node of flow.nodes) {
    const call = getCallFlowConfiguration(node);
    if (!call) continue;
    const key = `${call.target.flowId}@${call.target.version}`;
    const dependencyDigest = metadata.dependencyDigests?.get(key);
    dependenciesById.set(key, { flowId: call.target.flowId, version: call.target.version, ...(dependencyDigest ? { flowDigest: dependencyDigest } : {}) });
  }
  const dependencies = [...dependenciesById.values()];
  const requiredRuntimeCapabilities = [...new Set([...(flow.regions ?? []).flatMap((region) => region.requiredRuntimeCapabilities ?? []), ...(metadata.requiredRuntimeCapabilities ?? [])])].sort();
  const digest = digestExecutableFlowSnapshot({ flowId: flow.flowId, version, scope: flow.scope, interface: interfaceSnapshot, errors: flow.errors, nodes: flow.nodes, edges: flow.edges, regions: flow.regions, regionHandoffs: flow.regionHandoffs, executionDefaults: flow.executionDefaults, dependencies, requiredRuntimeCapabilities });
  return { flowId: flow.flowId, version, scope: structuredClone(flow.scope), flowDigest: digest, dependencies, requiredRuntimeCapabilities, ...(flow.executionDefaults ? { executionDefaults: structuredClone(flow.executionDefaults) } : {}), interface: interfaceSnapshot, errors: structuredClone(flow.errors), nodes: structuredClone(flow.nodes), edges: structuredClone(flow.edges), ...(flow.regions ? { regions: structuredClone(flow.regions) } : {}), ...(flow.regionHandoffs ? { regionHandoffs: structuredClone(flow.regionHandoffs) } : {}) };
}
