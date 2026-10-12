import type { AutomationStudioFlowDocument } from "../../../model/index.ts";

/**
 * The nodes on some edge path from `from` to `to`, both included, following
 * edges of every kind; empty when `to` cannot be reached from `from`. A
 * forward route passes over this span, and a backward route walks it again.
 */
export function automationStudioStateRouteSpan(flow: AutomationStudioFlowDocument, from: string, to: string): Set<string> {
  const after = reached(flow, from, "forward");
  if (!after.has(to)) return new Set();
  const before = reached(flow, to, "backward");
  return new Set([...after].filter((id) => before.has(id)));
}

/** `start` and every node the run could reach from it by any route: where a route into `start` goes on. */
export function automationStudioStateRouteOnward(flow: AutomationStudioFlowDocument, start: string): Set<string> {
  return reached(flow, start, "forward");
}

/** Every node reached from `start` following edges forward or against them, `start` included. */
function reached(flow: AutomationStudioFlowDocument, start: string, way: "forward" | "backward"): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const edge of flow.edges) {
      const [source, target] = way === "forward" ? [edge.sourceNodeId, edge.targetNodeId] : [edge.targetNodeId, edge.sourceNodeId];
      if (source !== id || seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return seen;
}
