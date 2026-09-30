// How the `flow_graph` section gets smaller without losing the failing node.
//
// Measured on the shape of live run `run-munnhi5q-4867dabe`: an eleven-node
// bootstrap Flow is about 5,000 bytes here, not the 2,000 the budget's comment
// once estimated for twenty-four nodes, because real ids are long
// (`node.bootstrap.<hash>.main.s11`) and every action has a `failed` edge beside
// its `success` one. Most of those bytes are edges, and most of each edge is its
// id, which a repair needs only for the edges it will name -- the ones into and
// out of the failing node. So the rungs go cheapest-loss first: prose, then the
// labels of nodes that did not fail, then the ids of edges that do not touch
// the failing node (their endpoints and ports still say the structure), then the
// router conditions, and last of all the window itself, narrowed around the
// failing node with the true counts kept beside it.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioCappedProse } from "./prose-cap.ts";
import type { AutomationStudioRecoverySectionTrim } from "./trim-step.ts";

export const AUTOMATION_STUDIO_RECOVERY_GRAPH_TRIMS: readonly AutomationStudioRecoverySectionTrim[] = Object.freeze([
  (section) => automationStudioCappedProse(section, 240),
  (section, failedNodeId) => ({ ...section, ...mapped(section, "nodes", (node) => node.nodeId === failedNodeId ? node : without(node, "label")) }),
  (section, failedNodeId) => ({ ...section, ...mapped(section, "edges", (edge) => edge.from === failedNodeId || edge.to === failedNodeId ? edge : without(edge, "edgeId")) }),
  (section) => ({ ...section, ...mapped(section, "routers", (router) => ({ ...router, ...mapped(router, "rules", (rule) => rule.condition === undefined ? rule : { ...without(rule, "condition"), conditionTrimmed: true }) })) }),
  (section, failedNodeId) => narrowedWindow(section, failedNodeId, 4),
  (section, failedNodeId) => narrowedWindow(section, failedNodeId, 2)
]);

/**
 * The nodes within `radius` of the failing node, in authored order, and the
 * edges that leave one of them or enter the failing node. The true node and edge counts and the window's
 * authored start position are kept beside it, as the section's own window
 * already does, so a narrowed graph never reads as a small Flow.
 */
function narrowedWindow(section: JsonObject, failedNodeId: string | undefined, radius: number): JsonObject {
  const nodes = records(section.nodes);
  const size = radius * 2 + 1;
  if (nodes.length <= size) return section;
  const failed = nodes.findIndex((node) => node.nodeId === failedNodeId);
  const start = failed < 0 ? 0 : Math.max(0, Math.min(nodes.length - size, failed - radius));
  const kept = nodes.slice(start, start + size);
  const keptIds = new Set(kept.map((node) => node.nodeId));
  const edges = records(section.edges);
  // An edge leaving a shown node, or entering the failing one. Not "touching a
  // shown node": every action's `failed` edge enters the end node, so that rule
  // keeps one edge per hidden node and the narrowing saves almost nothing.
  const keptEdges = edges.filter((edge) => keptIds.has(edge.from) || edge.to === failedNodeId);
  const priorStart = typeof section.firstNodePosition === "number" ? section.firstNodePosition : 1;
  return {
    ...section,
    nodes: kept,
    nodeCount: typeof section.nodeCount === "number" ? section.nodeCount : nodes.length,
    ...(priorStart + start > 1 ? { firstNodePosition: priorStart + start } : {}),
    edges: keptEdges,
    ...(keptEdges.length < edges.length || typeof section.edgeCount === "number" ? { edgeCount: typeof section.edgeCount === "number" ? section.edgeCount : edges.length } : {})
  };
}

function mapped(owner: JsonObject, key: string, map: (item: JsonObject) => JsonObject): JsonObject {
  const list = owner[key];
  return Array.isArray(list) ? { [key]: list.map((item) => isRecord(item) ? map(item) : item) as JsonValue } : {};
}

function without(record: JsonObject, key: string): JsonObject {
  const { [key]: _dropped, ...rest } = record;
  return rest as JsonObject;
}

function records(value: JsonValue | undefined): JsonObject[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
