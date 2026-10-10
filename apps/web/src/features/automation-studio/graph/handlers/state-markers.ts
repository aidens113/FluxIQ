// Where a run of one graph may begin, and where a handler may bring it back
// to (state-aware recovery plan, C2): the default start, each alternative
// entry (`fluxiq.entry`) and each checkpoint (`fluxiq.checkpoint`). The
// editor's mirror of Core's `runtime/executor/start-node.ts` and
// `runtime/executor/lifecycle/subflow-contract.ts`, which stay the authority.

import { readFlowFactConditions } from "./fact-conditions";
import type { FlowStateMarker, HandlerGraph } from "./types";
import { FLOW_CONTRACT_KEYS } from "./vocabulary";

const START_DEFINITION_ID = "builtin.control.start";
const END_DEFINITION_ID = "builtin.control.end";

/**
 * The node a run of the graph begins at when its caller names none, or
 * nothing when the graph does not say. Core's rule: the one Start node; else
 * the one node no route from another node enters, an End node only when
 * nothing else is. The nodes in `excluded` -- Handlers and the steps of their
 * bodies, which the run enters without a route -- are never where it begins.
 */
export function flowDefaultStartNodeId(graph: HandlerGraph, excluded: ReadonlySet<string> = new Set()): string | undefined {
  const nodes = graph.nodes.filter((node) => !excluded.has(node.id));
  const declared = nodes.filter((node) => node.definitionId === START_DEFINITION_ID);
  if (declared.length) return declared.length === 1 ? declared[0]!.id : undefined;
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const entered = new Set(graph.edges.filter((edge) => edge.source !== edge.target && nodeIds.has(edge.source)).map((edge) => edge.target));
  const roots = nodes.filter((node) => !entered.has(node.id));
  const startable = roots.some((node) => node.definitionId !== END_DEFINITION_ID) ? roots.filter((node) => node.definitionId !== END_DEFINITION_ID) : roots;
  return startable.length === 1 ? startable[0]!.id : undefined;
}

/**
 * Each node's alternative entry and checkpoint, keyed by node id, entries
 * before checkpoints. A declaration Core could not read (no id, conditions
 * that are not conditions) is left out, as Core refuses it.
 */
export function flowStateMarkers(graph: HandlerGraph): Map<string, FlowStateMarker[]> {
  const markers = new Map<string, FlowStateMarker[]>();
  const add = (nodeId: string, marker: FlowStateMarker): void => {
    const list = markers.get(nodeId);
    if (list) list.push(marker);
    else markers.set(nodeId, [marker]);
  };
  for (const node of graph.nodes) {
    const entry = declaration(node.metadata[FLOW_CONTRACT_KEYS.entry]);
    if (entry) add(node.id, { kind: "entry", id: entry.id, order: entry.order, when: entry.when });
    const checkpoint = declaration(node.metadata[FLOW_CONTRACT_KEYS.checkpoint]);
    if (checkpoint) add(node.id, { kind: "checkpoint", id: checkpoint.id, when: checkpoint.when });
  }
  return markers;
}

function declaration(value: unknown): { id: string; order: number; when: NonNullable<ReturnType<typeof readFlowFactConditions>> } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const when = readFlowFactConditions(record.when);
  if (!id || !when) return undefined;
  return { id, order: typeof record.order === "number" && Number.isFinite(record.order) ? record.order : 0, when };
}
