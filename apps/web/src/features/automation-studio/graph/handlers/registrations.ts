// Every handler registration one graph declares, explicit or implicit
// (state-aware recovery plan, C4): the editor's mirror of Core's
// `runtime/executor/lifecycle/graph-registrations.ts`, which stays the
// authority and which no public Core entry point exports.
//
// As in Core: Handler nodes are read from their parameters, in node order; each
// node's authored failure route (its `failed` edge, an `error.<id>` port, or an
// optional step's way on) is a node-scoped `fail` registration that comes after
// every conditional handler at its level; and each node marked
// `clearsInterference` is an implicit whole-automation `retry` registration.
// A Handler whose parameters cannot be read is left out, as Core leaves it out;
// the editor's validator (`flow-editor/graph-validation.ts`) is what reports it.
//
// What the editor adds is the extent of each Handler's body -- every step its
// `body` route reaches, up to the Handler Ends that close it -- because the
// canvas draws those steps in the Handlers area, apart from the main path.

import { readFlowFactConditions } from "./fact-conditions";
import type { FlowHandlerRegistration, FlowHandlerScope, FlowLifecycleEvent, HandlerGraph, HandlerGraphEdge, HandlerGraphNode } from "./types";
import { FLOW_AUTHORED_PATH_ORDER, FLOW_CONTRACT_KEYS, FLOW_HANDLER_DEFINITION_ID, FLOW_HANDLER_END_DEFINITION_ID, FLOW_LIFECYCLE_EVENTS } from "./vocabulary";

/** `step-skip/optional-step.ts`: the join a guarded step's way on leads to, and how far the walk to it may go. */
const MERGE_DEFINITION_ID = "builtin.control.merge";
const MAX_GUARDED_STEPS = 32;

/** The graph's registrations in Core's document order: Handlers, then authored failure routes, then interference. */
export function flowHandlerRegistrations(graph: HandlerGraph): FlowHandlerRegistration[] {
  const outgoing = edgesBySource(graph.edges);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const registrations: FlowHandlerRegistration[] = [];
  graph.nodes.forEach((node, index) => {
    if (node.definitionId !== FLOW_HANDLER_DEFINITION_ID) return;
    const read = handlerNodeRegistration(graph.graphId, node, index, nodesById, outgoing);
    if (read) registrations.push(read);
  });
  const authoredOffset = graph.nodes.length;
  graph.nodes.forEach((node, index) => {
    if (node.definitionId === FLOW_HANDLER_DEFINITION_ID) return;
    for (const path of authoredFailurePaths(node, nodesById, outgoing)) {
      registrations.push({
        handlerId: `${graph.graphId}/${path.edge.id}`,
        graphId: graph.graphId,
        event: "fail",
        scope: { kind: "nodes", nodeIds: [node.id] },
        when: [],
        order: FLOW_AUTHORED_PATH_ORDER,
        completionCheck: [],
        maxRuns: 1,
        documentIndex: authoredOffset + index,
        source: { kind: "failed_edge", nodeId: node.id, edgeId: path.edge.id, targetNodeId: path.edge.target, wayOn: path.wayOn }
      });
    }
  });
  graph.nodes.forEach((node, index) => {
    if (node.metadata[FLOW_CONTRACT_KEYS.clearsInterference] !== true) return;
    registrations.push({
      handlerId: `${graph.graphId}/${node.id}#clears_interference`,
      graphId: graph.graphId,
      event: "retry",
      scope: { kind: "automation" },
      when: [],
      order: 0,
      completionCheck: [],
      maxRuns: 1,
      documentIndex: index,
      source: { kind: "clears_interference", nodeId: node.id }
    });
  });
  return registrations;
}

function handlerNodeRegistration(
  graphId: string,
  node: HandlerGraphNode,
  index: number,
  nodesById: ReadonlyMap<string, HandlerGraphNode>,
  outgoing: ReadonlyMap<string, HandlerGraphEdge[]>
): FlowHandlerRegistration | undefined {
  const values = node.parameterValues;
  const event = typeof values.event === "string" && (FLOW_LIFECYCLE_EVENTS as readonly string[]).includes(values.event) ? (values.event as FlowLifecycleEvent) : undefined;
  const scope = handlerScope(values.scope);
  const when = readFlowFactConditions(values.when);
  const completionCheck = readFlowFactConditions(values.completionCheck);
  if (!event || !scope || !when || !completionCheck) return undefined;
  const body = handlerBodyOf(node.id, nodesById, outgoing);
  return {
    handlerId: `${graphId}/${node.id}`,
    graphId,
    event,
    scope,
    when,
    order: finiteNumber(values.order) ?? 0,
    completionCheck,
    maxRuns: Math.max(1, Math.floor(finiteNumber(values.maxRuns) ?? 1)),
    documentIndex: index,
    source: { kind: "handler_node", nodeId: node.id, bodyNodeIds: body.steps, endNodeIds: body.ends }
  };
}

/**
 * Each Handler node's body, read or not: the steps its `body` route reaches
 * (Handler Ends included), keyed by the Handler's node id. A Handler whose
 * parameters cannot be read still has a body, which belongs in the Handlers
 * area all the same.
 */
export function flowHandlerBodies(graph: HandlerGraph): Map<string, { steps: string[]; ends: string[] }> {
  const outgoing = edgesBySource(graph.edges);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const bodies = new Map<string, { steps: string[]; ends: string[] }>();
  for (const node of graph.nodes) {
    if (node.definitionId === FLOW_HANDLER_DEFINITION_ID) bodies.set(node.id, handlerBodyOf(node.id, nodesById, outgoing));
  }
  return bodies;
}

/** Every node the Handler's `body` route reaches, in the order reached, stopping at Handler Ends and at another Handler. */
function handlerBodyOf(handlerId: string, nodesById: ReadonlyMap<string, HandlerGraphNode>, outgoing: ReadonlyMap<string, HandlerGraphEdge[]>): { steps: string[]; ends: string[] } {
  const seen = new Set<string>([handlerId]);
  const steps: string[] = [];
  const ends: string[] = [];
  const pending = (outgoing.get(handlerId) ?? []).filter((edge) => edge.sourcePort === "body").map((edge) => edge.target);
  while (pending.length) {
    const nodeId = pending.shift()!;
    const node = nodesById.get(nodeId);
    if (seen.has(nodeId) || !node || node.definitionId === FLOW_HANDLER_DEFINITION_ID) continue;
    seen.add(nodeId);
    steps.push(nodeId);
    if (node.definitionId === FLOW_HANDLER_END_DEFINITION_ID) {
      ends.push(nodeId);
      continue;
    }
    for (const edge of outgoing.get(nodeId) ?? []) pending.push(edge.target);
  }
  return { steps, ends };
}

/** A Handler's stored `scope`, or nothing when it is not one of the three shapes. */
function handlerScope(value: unknown): FlowHandlerScope | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === "automation") return { kind: "automation" };
  if (value.kind === "subflow") return { kind: "subflow", inherit: value.inherit !== false };
  if (value.kind === "nodes" && Array.isArray(value.nodeIds) && value.nodeIds.length && value.nodeIds.every((id) => typeof id === "string" && id.length > 0)) {
    return { kind: "nodes", nodeIds: value.nodeIds as string[] };
  }
  return undefined;
}

/**
 * The node's authored failure routes, as Core's ladder offers them: an
 * optional step's way on takes the place of its `failed` edge; otherwise the
 * `failed` edge to another node. Every `error.<id>` port to another node is a
 * route of its own.
 */
function authoredFailurePaths(node: HandlerGraphNode, nodesById: ReadonlyMap<string, HandlerGraphNode>, outgoing: ReadonlyMap<string, HandlerGraphEdge[]>): Array<{ edge: HandlerGraphEdge; wayOn: boolean }> {
  const paths: Array<{ edge: HandlerGraphEdge; wayOn: boolean }> = [];
  const wayOn = optionalStepWayOn(node, nodesById, outgoing);
  if (wayOn) paths.push({ edge: wayOn, wayOn: true });
  for (const edge of outgoing.get(node.id) ?? []) {
    if (edge.target === node.id) continue;
    if (edge.sourcePort === "failed" && !wayOn) paths.push({ edge, wayOn: false });
    else if (edge.sourcePort.startsWith("error.")) paths.push({ edge, wayOn: false });
  }
  return paths;
}

/** Core's `automationStudioOptionalStepWayOn`: the `failed` edge to the join a guarded step's success path reaches, or a sometimes-present step's success edge. */
function optionalStepWayOn(node: HandlerGraphNode, nodesById: ReadonlyMap<string, HandlerGraphNode>, outgoing: ReadonlyMap<string, HandlerGraphEdge[]>): HandlerGraphEdge | undefined {
  const leaving = outgoing.get(node.id) ?? [];
  const success = successEdge(leaving, node.definitionId);
  const failed = leaving.find((edge) => edge.sourcePort === "failed");
  const joined = failed !== undefined && success !== undefined
    && nodesById.get(failed.target)?.definitionId === MERGE_DEFINITION_ID
    && successPathReaches(success.target, failed.target, nodesById, outgoing);
  if (joined) return failed;
  if (node.metadata.sometimesPresent === true) return success;
  return undefined;
}

function successPathReaches(from: string, join: string, nodesById: ReadonlyMap<string, HandlerGraphNode>, outgoing: ReadonlyMap<string, HandlerGraphEdge[]>): boolean {
  const seen = new Set<string>();
  let at = from;
  for (let steps = 0; steps <= MAX_GUARDED_STEPS; steps += 1) {
    if (at === join) return true;
    if (seen.has(at)) return false;
    seen.add(at);
    const step = nodesById.get(at);
    const leaving = outgoing.get(at) ?? [];
    if (!step || leaving.some((edge) => edge.sourcePort === "failed")) return false;
    const next = successEdge(leaving, step.definitionId);
    if (!next) return false;
    at = next.target;
  }
  return false;
}

/** Core's `chooseAutomationStudioEdge(..., "success")`. */
function successEdge(leaving: readonly HandlerGraphEdge[], definitionId: string | undefined): HandlerGraphEdge | undefined {
  return leaving.find((edge) => edge.sourcePort === "success")
    ?? (definitionId === "builtin.control.start" ? leaving.find((edge) => edge.sourcePort === "next") : undefined)
    ?? leaving.find((edge) => !edge.sourcePort);
}

function edgesBySource(edges: readonly HandlerGraphEdge[]): Map<string, HandlerGraphEdge[]> {
  const outgoing = new Map<string, HandlerGraphEdge[]>();
  for (const edge of edges) {
    const leaving = outgoing.get(edge.source);
    if (leaving) leaving.push(edge);
    else outgoing.set(edge.source, [edge]);
  }
  return outgoing;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
