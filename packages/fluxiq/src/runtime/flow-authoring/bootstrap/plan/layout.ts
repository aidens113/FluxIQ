// Deterministic node placement for a validated Subflow: depth from the
// topological order, row from arrival within a depth, both scaled by the
// spacing limits so the same plan always lays out identically.
import type { AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapSubflow } from "./contracts.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS } from "./limits.ts";

export function layoutNodes(subflow: AutomationStudioFlowBootstrapSubflow): Array<AutomationStudioFlowBootstrapNode & { position: { x: number; y: number } }> {
  const indegree = new Map(subflow.nodes.map((node) => [node.key, 0]));
  const adjacency = new Map(subflow.nodes.map((node) => [node.key, [] as string[]]));
  for (const edge of subflow.edges) {
    indegree.set(edge.target.nodeKey, (indegree.get(edge.target.nodeKey) ?? 0) + 1);
    adjacency.get(edge.source.nodeKey)?.push(edge.target.nodeKey);
  }
  const depths = new Map<string, number>();
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([key]) => key).sort();
  for (const key of queue) depths.set(key, 0);
  while (queue.length) {
    const key = queue.shift()!;
    for (const next of (adjacency.get(key) ?? []).sort()) {
      depths.set(next, Math.max(depths.get(next) ?? 0, (depths.get(key) ?? 0) + 1));
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
    queue.sort();
  }
  const rowByDepth = new Map<number, number>();
  return [...subflow.nodes].sort((left, right) => (depths.get(left.key) ?? 0) - (depths.get(right.key) ?? 0) || left.key.localeCompare(right.key)).map((node) => {
    const depth = depths.get(node.key) ?? 0;
    const row = rowByDepth.get(depth) ?? 0;
    rowByDepth.set(depth, row + 1);
    return {
      ...node,
      position: {
        x: depth * AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.horizontalSpacing,
        y: row * AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.verticalSpacing
      }
    };
  });
}
