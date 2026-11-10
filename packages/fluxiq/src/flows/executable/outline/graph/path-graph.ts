// The graph as the run walks it: the edges that carry the path from one step
// to the next, apart from the edges that only carry a value.
//
// The executor follows the edge whose source port is the route a node settled
// on, or a portless edge for `success` (`engine/automation/graph-navigation/edge.ts`).
// An edge leaving by a value port -- a loop's item, index, count or pass, a
// switch's matched value, any port that is not a route -- carries a value. So
// does a portless edge arriving at a named input other than the way in ("in"),
// such as a pipeline join's right side. Everything else is the path.
import type { AutomationStudioFlowEdge, ExecutableGraph } from "../../graph/index.ts";
import type { OutlinePathEdge } from "./path-edge.ts";

/** The path edges in and out of each node, in the order the graph lists them, and the value-only edges. */
export type OutlinePathGraph = {
  out: ReadonlyMap<string, readonly OutlinePathEdge[]>;
  in: ReadonlyMap<string, readonly OutlinePathEdge[]>;
  values: readonly AutomationStudioFlowEdge[];
};

const ROUTE_PORTS: ReadonlySet<string> = new Set([
  "success", "failed", "failure", "next", "true", "false", "body", "done", "case", "default",
  "passed", "recovered", "approved", "rejected", "timeout", "go", "end"
]);

/** The path graph of the nodes that exist; an edge naming a node the graph lacks is left out. */
export function outlinePathGraph(graph: Pick<ExecutableGraph, "nodes" | "edges">): OutlinePathGraph {
  const ids = new Set(graph.nodes.map((node) => node.id));
  const out = new Map<string, OutlinePathEdge[]>();
  const into = new Map<string, OutlinePathEdge[]>();
  const values: AutomationStudioFlowEdge[] = [];
  for (const edge of graph.edges) {
    if (!ids.has(edge.sourceNodeId) || !ids.has(edge.targetNodeId)) continue;
    if (!carriesPath(edge)) {
      values.push(edge);
      continue;
    }
    const path: OutlinePathEdge = { edge, port: edge.sourcePortId ?? "success", target: edge.targetNodeId };
    out.set(edge.sourceNodeId, [...(out.get(edge.sourceNodeId) ?? []), path]);
    into.set(edge.targetNodeId, [...(into.get(edge.targetNodeId) ?? []), path]);
  }
  return { out, in: into, values };
}

function carriesPath(edge: AutomationStudioFlowEdge): boolean {
  const source = edge.sourcePortId;
  if (source) return ROUTE_PORTS.has(source) || source.startsWith("error.");
  return !edge.targetPortId || edge.targetPortId === "in";
}
