import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { isAutomationNodeParameterStateBinding } from "../../../nodes/index.ts";

/**
 * One place a node reads what another produces: the reader, and the run value
 * path it reads (`${producerId}.${outputId}`, a deeper path under one, the
 * producer's id alone, or a bare output id the run also keys values under).
 */
export type AutomationStudioOutputRead = { readerNodeId: string; path: string };

/** How deep a reader's parameter values are walked looking for a binding onto the producer. */
const MAXIMUM_BINDING_DEPTH = 16;

/**
 * Every read, among `readers`, of what `producer` produces, in the order a
 * caller should report them: data edges first, in edge order, then state
 * bindings, in node order.
 *
 * Both ways a value travels are checked: a data edge, which names the output
 * port directly (an edge into a port other than the control `in`), and a state
 * binding, which names `${producerId}.${outputId}`, a path under the producer's
 * id, or a bare id from `outputIds` the run also keys values under. A producer
 * never reads itself through a binding.
 *
 * Two callers ask it: a node that failed for good, whose run carries on only
 * when nothing reachable after it reads it (`./continuation.ts`), and a state
 * route forward past steps that never ran, which is refused when a step on the
 * route's path reads a value they would have bound (`../state-routing/`).
 */
export function automationStudioOutputReads(
  flow: AutomationStudioFlowDocument,
  producer: AutomationStudioFlowNode,
  outputIds: readonly string[],
  readers: ReadonlySet<string>
): AutomationStudioOutputRead[] {
  const reads: AutomationStudioOutputRead[] = [];
  for (const edge of flow.edges) {
    if (edge.sourceNodeId !== producer.id || !edge.targetPortId || edge.targetPortId === "in" || !readers.has(edge.targetNodeId)) continue;
    reads.push({ readerNodeId: edge.targetNodeId, path: edge.sourcePortId ? `${producer.id}.${edge.sourcePortId}` : producer.id });
  }
  const paths = new Set<string>([producer.id, ...outputIds, ...outputIds.map((outputId) => `${producer.id}.${outputId}`)]);
  for (const candidate of flow.nodes) {
    if (candidate.id === producer.id || !readers.has(candidate.id)) continue;
    for (const path of bindingPaths(candidate.parameterValues ?? {}, paths, 0)) reads.push({ readerNodeId: candidate.id, path });
  }
  return reads;
}

/** Every state binding path below this value that names one of the paths the producer writes. */
function bindingPaths(value: JsonValue, paths: ReadonlySet<string>, depth: number): string[] {
  if (isAutomationNodeParameterStateBinding(value)) {
    const path = value.$state.path.trim();
    return paths.has(path) || [...paths].some((candidate) => path.startsWith(`${candidate}.`)) ? [path] : [];
  }
  if (!value || typeof value !== "object" || depth >= MAXIMUM_BINDING_DEPTH) return [];
  const entries = Array.isArray(value) ? value : Object.values(value);
  return entries.flatMap((entry) => bindingPaths(entry, paths, depth + 1));
}
