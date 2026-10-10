// What the canvas draws about handlers, entries and checkpoints for one graph
// (state-aware recovery plan, C2 and C4; downstream B7). Every part of it is a
// view of what the graph stores -- Handler nodes, their bodies, node-scoped
// registrations, entry and checkpoint metadata -- and none of it is stored:
// a hook port is the registration seen from the step it covers, never a
// second form of it.

import { flowFactConditionWords, flowHandlerEventWords, flowHandlerScopeWords, flowHandlerThenWords } from "./plain-words";
import { flowHandlerBodies, flowHandlerRegistrations } from "./registrations";
import { flowStateMarkers } from "./state-markers";
import type { FlowLifecycleEvent, HandlerGraph } from "./types";
import { FLOW_HANDLER_DEFINITION_ID, FLOW_LIFECYCLE_EVENTS } from "./vocabulary";

/** One Handler's card, in plain words. `readable` is false when Core could not read its parameters. */
export type FlowHandlerCard = {
  nodeId: string;
  title: string;
  readable: boolean;
  eventWords: string;
  scopeWords: string;
  conditionWords: string;
  /** What happens after, once per Handler End its body reaches. */
  thenWords: string[];
  stepCount: number;
};

/** A node-scoped registration as the step it covers shows it. */
export type FlowHookPort = {
  event: FlowLifecycleEvent;
  eventWords: string;
  handlerNodeId: string;
  handlerTitle: string;
};

/** An entry or checkpoint marker on a step. */
export type FlowStateMarkerView = {
  kind: "entry" | "checkpoint";
  label: string;
  detail: string;
};

export type FlowHandlerCanvasView = {
  /** Handlers and every step of their bodies: what the Handlers area holds. */
  areaNodeIds: ReadonlySet<string>;
  /** The Handler nodes themselves. */
  registrationNodeIds: ReadonlySet<string>;
  /** Each Handler's body steps, in the order its body reaches them. */
  bodies: ReadonlyMap<string, readonly string[]>;
  cards: ReadonlyMap<string, FlowHandlerCard>;
  hookPorts: ReadonlyMap<string, readonly FlowHookPort[]>;
  markers: ReadonlyMap<string, readonly FlowStateMarkerView[]>;
};

/** A graph with no handlers, entries or checkpoints. */
export const EMPTY_FLOW_HANDLER_CANVAS_VIEW: FlowHandlerCanvasView = Object.freeze({
  areaNodeIds: new Set<string>(),
  registrationNodeIds: new Set<string>(),
  bodies: new Map<string, readonly string[]>(),
  cards: new Map<string, FlowHandlerCard>(),
  hookPorts: new Map<string, readonly FlowHookPort[]>(),
  markers: new Map<string, readonly FlowStateMarkerView[]>()
});

/** The canvas view of one graph. */
export function flowHandlerCanvasView(graph: HandlerGraph): FlowHandlerCanvasView {
  const markers = markerViews(graph);
  const hasHandler = graph.nodes.some((node) => node.definitionId === FLOW_HANDLER_DEFINITION_ID);
  if (!hasHandler && !markers.size) return EMPTY_FLOW_HANDLER_CANVAS_VIEW;
  const bodies = flowHandlerBodies(graph);
  const registrations = flowHandlerRegistrations(graph).filter((registration) => registration.source.kind === "handler_node");
  const areaNodeIds = new Set<string>();
  const registrationNodeIds = new Set<string>();
  const cards = new Map<string, FlowHandlerCard>();
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const [nodeId, body] of bodies) {
    registrationNodeIds.add(nodeId);
    areaNodeIds.add(nodeId);
    for (const step of body.steps) areaNodeIds.add(step);
    const registration = registrations.find((candidate) => candidate.source.kind === "handler_node" && candidate.source.nodeId === nodeId);
    const title = nodesById.get(nodeId)?.label || "Handler";
    const thenWords = body.ends.map((endId) => flowHandlerThenWords(nodesById.get(endId)?.parameterValues ?? {}));
    cards.set(nodeId, registration
      ? {
        nodeId,
        title,
        readable: true,
        eventWords: flowHandlerEventWords(registration.event),
        scopeWords: flowHandlerScopeWords(registration.scope, graph),
        conditionWords: flowFactConditionWords(registration.when, graph),
        thenWords,
        stepCount: body.steps.length - body.ends.length
      }
      : { nodeId, title, readable: false, eventWords: "Not set", scopeWords: "Not set", conditionWords: "Not readable", thenWords, stepCount: body.steps.length - body.ends.length });
  }
  const hookPorts = new Map<string, FlowHookPort[]>();
  const eventRank = (event: FlowLifecycleEvent) => FLOW_LIFECYCLE_EVENTS.indexOf(event);
  for (const registration of [...registrations].sort((left, right) => eventRank(left.event) - eventRank(right.event) || left.order - right.order || left.documentIndex - right.documentIndex)) {
    if (registration.scope.kind !== "nodes" || registration.source.kind !== "handler_node") continue;
    const handlerNodeId = registration.source.nodeId;
    for (const nodeId of registration.scope.nodeIds) {
      if (!nodesById.has(nodeId)) continue;
      const port: FlowHookPort = { event: registration.event, eventWords: flowHandlerEventWords(registration.event), handlerNodeId, handlerTitle: cards.get(handlerNodeId)?.title ?? "Handler" };
      const list = hookPorts.get(nodeId);
      if (list) list.push(port);
      else hookPorts.set(nodeId, [port]);
    }
  }
  return {
    areaNodeIds,
    registrationNodeIds,
    bodies: new Map([...bodies].map(([nodeId, body]) => [nodeId, body.steps])),
    cards,
    hookPorts,
    markers
  };
}

function markerViews(graph: HandlerGraph): Map<string, FlowStateMarkerView[]> {
  const views = new Map<string, FlowStateMarkerView[]>();
  for (const [nodeId, markers] of flowStateMarkers(graph)) {
    views.set(nodeId, markers.map((marker): FlowStateMarkerView => marker.kind === "entry"
      ? { kind: "entry", label: "Alternative start", detail: "Starts here when " + conditionPhrase(flowFactConditionWords(marker.when, graph)) }
      : marker.kind === "checkpoint"
        ? { kind: "checkpoint", label: "Checkpoint", detail: "A handler can bring the run back here" + (marker.when.length ? " when " + conditionPhrase(flowFactConditionWords(marker.when, graph)) : "") }
        : { kind: "entry", label: "Start", detail: "" }));
  }
  return views;
}

function conditionPhrase(text: string): string {
  return text === "Always" ? "the part starts" : text;
}
