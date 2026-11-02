import type { ExecutableFlow } from "../graph/index.ts";

export function normalizeExecutableFlow<TFlow extends ExecutableFlow>(flow: TFlow): TFlow {
  const normalized = structuredClone(flow);
  normalized.nodes.sort((a, b) => a.id.localeCompare(b.id));
  normalized.edges.sort((a, b) => a.id.localeCompare(b.id));
  normalized.interface.inputs.sort((a, b) => a.id.localeCompare(b.id));
  normalized.interface.outputs.sort((a, b) => a.id.localeCompare(b.id));
  normalized.errors.sort((a, b) => a.id.localeCompare(b.id));
  normalized.variables.sort((a, b) => a.id.localeCompare(b.id));
  normalized.regions?.sort((a, b) => a.id.localeCompare(b.id));
  normalized.regionHandoffs?.sort((a, b) => a.id.localeCompare(b.id));
  for (const node of normalized.nodes) if (node.position) node.position = { x: Math.round(node.position.x * 1000) / 1000, y: Math.round(node.position.y * 1000) / 1000 };
  for (const region of normalized.regions ?? []) { region.nodeIds.sort();
    region.entryPorts.sort((a, b) => a.id.localeCompare(b.id));
    region.exitPorts.sort((a, b) => a.id.localeCompare(b.id));
    region.requiredRuntimeCapabilities?.sort(); }
  normalized.executionDefaults?.authorizedDomainIds?.sort();
  return normalized;
}
