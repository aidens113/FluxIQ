// The units of a compiled graph and a digest of each, and the guard that holds
// a repair to the one unit it names (state-aware recovery plan, C12: "a repair
// names one unit and Core refuses any change to another unit's compiled
// graph").
//
// A graph's units are its handlers and its other nodes. A handler unit is a
// `builtin.control.handler` node, every node its `body` port reaches, and the
// Handler Ends that body finishes at. Every node no handler body holds is a
// unit of its own. A unit's digest covers what it runs and where it leads: each
// member's definition, parameters, label, description and metadata, and each
// member's outgoing edges by port, target and target port. Layout (`position`)
// and edge ids are left out, because neither changes what a run does.
//
// A part (a Subflow graph a Call Subflow node calls) is a unit as a whole; its
// guard is that the graph which calls it is left alone, which the overlay
// checks by construction (`./overlay.ts`).

import { createHash } from "node:crypto";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../model/index.ts";
import { AUTOMATION_STUDIO_HANDLER_DEFINITION_ID, AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID } from "../../nodes/control-flow/index.ts";

/** The nodes and edges a unit split is read from. */
export type AutomationStudioUnitGraph = {
  nodes: readonly AutomationStudioFlowNode[];
  edges: readonly AutomationStudioFlowEdge[];
};

/** A unit's key: `node:<node id>`, or `handler:<Handler node id>`. */
export type AutomationStudioGraphUnitKey = `node:${string}` | `handler:${string}`;

/** Which unit each node belongs to, and each unit's member node ids in graph order. */
export type AutomationStudioGraphUnits = {
  unitOfNode: ReadonlyMap<string, AutomationStudioGraphUnitKey>;
  members: ReadonlyMap<AutomationStudioGraphUnitKey, readonly string[]>;
};

/** The port a Handler's body leaves by. */
const BODY_PORT_ID = "body";

/**
 * Splits a graph into its units. A node two handler bodies reach belongs to
 * the first handler in node order; a Handler met inside another's body is a
 * unit of its own and is not walked into (the Flow validator refuses it).
 */
export function automationStudioGraphUnits(graph: AutomationStudioUnitGraph): AutomationStudioGraphUnits {
  const unitOfNode = new Map<string, AutomationStudioGraphUnitKey>();
  const members = new Map<AutomationStudioGraphUnitKey, string[]>();
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const node of graph.nodes) {
    if (node.definitionId !== AUTOMATION_STUDIO_HANDLER_DEFINITION_ID || unitOfNode.has(node.id)) continue;
    const key: AutomationStudioGraphUnitKey = `handler:${node.id}`;
    const body = handlerBodyNodeIds(graph, nodesById, node.id).filter((id) => !unitOfNode.has(id));
    for (const id of [node.id, ...body]) unitOfNode.set(id, key);
    members.set(key, [node.id, ...body]);
  }
  for (const node of graph.nodes) {
    if (unitOfNode.has(node.id)) continue;
    const key: AutomationStudioGraphUnitKey = `node:${node.id}`;
    unitOfNode.set(node.id, key);
    members.set(key, [node.id]);
  }
  return { unitOfNode, members };
}

/**
 * The digest of every unit. `aliases` maps a node id to the id an edge into it
 * is read as: an insert that re-points the edges entering a node at the first
 * step it puts before that node (`./step-insert.ts`) leaves the units those
 * edges leave unchanged, because they still lead to the same step in effect.
 */
export function automationStudioGraphUnitDigests(graph: AutomationStudioUnitGraph, aliases: ReadonlyMap<string, string> = new Map()): Map<AutomationStudioGraphUnitKey, string> {
  const { members } = automationStudioGraphUnits(graph);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, AutomationStudioFlowEdge[]>();
  for (const edge of graph.edges) outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge]);
  const digests = new Map<AutomationStudioGraphUnitKey, string>();
  for (const [key, ids] of members) {
    const content = [...ids].sort().map((id) => {
      const { position: _position, ...node } = nodesById.get(id)!;
      const edges = (outgoing.get(id) ?? [])
        .map((edge) => canonicalJson({ port: edge.sourcePortId ?? null, to: aliases.get(edge.targetNodeId) ?? edge.targetNodeId, toPort: edge.targetPortId ?? null, metadata: edge.metadata ?? null }))
        .sort();
      return canonicalJson({ node, edges });
    });
    digests.set(key, createHash("sha256").update(`[${content.join(",")}]`).digest("hex"));
  }
  return digests;
}

/**
 * The unit, other than the one a repair names, that the repair changed, or
 * nothing when it changed no other. A unit that disappeared or now has a
 * different digest is a changed unit; a unit the repair added is not, since
 * nothing outside the named unit leads into it.
 */
export function automationStudioUnitDigestRefusal(input: {
  before: AutomationStudioUnitGraph;
  after: AutomationStudioUnitGraph;
  unit: AutomationStudioGraphUnitKey;
  aliases?: ReadonlyMap<string, string>;
}): AutomationStudioGraphUnitKey | undefined {
  const before = automationStudioGraphUnitDigests(input.before);
  const after = automationStudioGraphUnitDigests(input.after, input.aliases);
  for (const [key, digest] of before) {
    if (key !== input.unit && after.get(key) !== digest) return key;
  }
  return undefined;
}

/**
 * The digest a durable unit repair is guarded by (C12): the named unit's own
 * digest for a node or a handler, and for a part the digest of its whole graph,
 * every unit of it. Undefined when the graph holds no such unit. A repair made
 * against one digest is applied only to a saved unit that still has it.
 */
export function automationStudioRepairUnitDigest(graph: AutomationStudioUnitGraph, unit: { kind: "node" | "handler"; nodeId: string } | { kind: "part"; subflowId: string }): string | undefined {
  const digests = automationStudioGraphUnitDigests(graph);
  if (unit.kind === "node") return digests.get(`node:${unit.nodeId}`);
  if (unit.kind === "handler") return digests.get(`handler:${unit.nodeId}`);
  const whole = [...digests.entries()].map(([key, digest]) => `${key}=${digest}`).sort();
  return createHash("sha256").update(whole.join("\n")).digest("hex");
}

/** The nodes a Handler's body reaches by any route, up to and including the Handler Ends it finishes at. */
function handlerBodyNodeIds(graph: AutomationStudioUnitGraph, nodesById: ReadonlyMap<string, AutomationStudioFlowNode>, handlerId: string): string[] {
  const reached: string[] = [];
  const seen = new Set<string>([handlerId]);
  const pending = graph.edges.filter((edge) => edge.sourceNodeId === handlerId && edge.sourcePortId === BODY_PORT_ID).map((edge) => edge.targetNodeId);
  while (pending.length) {
    const id = pending.shift()!;
    const node = nodesById.get(id);
    if (seen.has(id) || !node || node.definitionId === AUTOMATION_STUDIO_HANDLER_DEFINITION_ID) continue;
    seen.add(id);
    reached.push(id);
    if (node.definitionId === AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID) continue;
    for (const edge of graph.edges) if (edge.sourceNodeId === id) pending.push(edge.targetNodeId);
  }
  return reached;
}

/** JSON with object keys sorted, so equal content always reads the same. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
