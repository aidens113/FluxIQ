import type { ExecutableGraph } from "../../graph/index.ts";
import type { ExecutableFlowSnapshot } from "../snapshot/index.ts";
import { getCallFlowConfiguration } from "../configuration.ts";

export function findCompositeCycle(root: Pick<ExecutableGraph, "flowId" | "nodes">, snapshots: Map<string, ExecutableFlowSnapshot>): string[] | null {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string, nodes: ExecutableGraph["nodes"]): string[] | null => {
    if (visiting.has(id)) return [id];
    if (visited.has(id)) return null;
    visiting.add(id);
    for (const node of nodes) {
      const call = getCallFlowConfiguration(node);
      if (!call) continue;
      const targetId = `${call.target.flowId}@${call.target.version}`;
      const target = snapshots.get(targetId);
      if (!target) continue;
      const nested = visit(targetId, target.nodes);
      if (nested) return [...nested, id];
    }
    visiting.delete(id);
    visited.add(id);
    return null;
  };
  return visit(`${root.flowId}@draft`, root.nodes);
}
