// Which handlers apply to one node, in the order the run would try them
// (state-aware recovery plan, C4 "Resolution"): the editor's mirror of Core's
// `resolveAutomationStudioHandlerCandidates` in
// `runtime/executor/lifecycle/scope-resolver.ts`, which stays the authority
// and which no public Core entry point exports.
//
// Core resolves against the live frame stack. The editor has no run, so the
// stack is read statically: the graph the node is in is the executing frame,
// the graphs of parts that call it (nearest first) are its ancestors, and the
// recovery part's graph supplies whole-automation handlers. Within that, the
// order is Core's: node -> this part -> parts that call it (only those that
// `inherit`) -> whole automation; within a level ascending `order`, then the
// nearer caller, then document order. `when` is not evaluated -- it is shown --
// and no occurrence or budget is counted.

import { flowHandlerBodies, flowHandlerRegistrations } from "./registrations";
import type { EffectiveFlowHandler, FlowHandlerLevel, FlowHandlerRegistration, HandlerGraph } from "./types";
import { FLOW_HANDLER_DEFINITION_ID, FLOW_LIFECYCLE_EVENTS } from "./vocabulary";

/** The graphs a node's handlers can come from. */
export type EffectiveFlowHandlerScopes = {
  /** The graph the node is in. */
  current: HandlerGraph;
  /** The graphs of parts that call this one, nearest first. */
  callers?: readonly HandlerGraph[];
  /** The automation's recovery part, where whole-automation handlers are stored. */
  automation?: readonly HandlerGraph[];
};

const LEVEL_RANK: Readonly<Record<FlowHandlerLevel, number>> = { node: 0, subflow: 1, ancestor: 2, automation: 3 };

/**
 * Every registration that applies to `nodeId`, grouped by event in the order
 * events occur around a node, each group in the order the run would try it.
 * A Handler, or a step of a Handler's body, has none: no handler is
 * dispatched inside another (C5).
 */
export function resolveEffectiveFlowHandlers(scopes: EffectiveFlowHandlerScopes, nodeId: string): EffectiveFlowHandler[] {
  const { current } = scopes;
  if (insideHandler(current, nodeId)) return [];
  const callers = scopes.callers ?? [];
  const found: EffectiveFlowHandler[] = [];
  const seen = new Set<string>();
  const take = (registration: FlowHandlerRegistration, level: FlowHandlerLevel, graph: HandlerGraph, distance: number): void => {
    if (seen.has(registration.handlerId)) return;
    seen.add(registration.handlerId);
    found.push({ registration, level, graphId: graph.graphId, graphName: graph.name, distance });
  };
  const own = flowHandlerRegistrations(current);
  for (const registration of own) {
    if (registration.scope.kind === "nodes" && registration.scope.nodeIds.includes(nodeId)) take(registration, "node", current, 0);
  }
  for (const registration of own) {
    if (registration.scope.kind === "subflow") take(registration, "subflow", current, 0);
  }
  const callerRegistrations = callers.map((graph) => ({ graph, registrations: flowHandlerRegistrations(graph) }));
  callerRegistrations.forEach(({ graph, registrations }, index) => {
    for (const registration of registrations) {
      if (registration.scope.kind === "subflow" && registration.scope.inherit) take(registration, "ancestor", graph, index + 1);
    }
  });
  const automationSources = [
    ...(scopes.automation ?? []).map((graph) => ({ graph, registrations: flowHandlerRegistrations(graph) })),
    { graph: current, registrations: own },
    ...callerRegistrations
  ];
  for (const { graph, registrations } of automationSources) {
    for (const registration of registrations) {
      if (registration.scope.kind !== "automation") continue;
      // A node that clears interference is never its own interference handler.
      if (registration.source.kind === "clears_interference" && registration.source.nodeId === nodeId && graph === current) continue;
      take(registration, "automation", graph, 0);
    }
  }
  const eventRank = (handler: EffectiveFlowHandler) => FLOW_LIFECYCLE_EVENTS.indexOf(handler.registration.event);
  return found.sort((left, right) => eventRank(left) - eventRank(right)
    || LEVEL_RANK[left.level] - LEVEL_RANK[right.level]
    || left.registration.order - right.registration.order
    || left.distance - right.distance
    || left.registration.documentIndex - right.registration.documentIndex
    || left.registration.handlerId.localeCompare(right.registration.handlerId));
}

function insideHandler(graph: HandlerGraph, nodeId: string): boolean {
  if (graph.nodes.some((node) => node.id === nodeId && node.definitionId === FLOW_HANDLER_DEFINITION_ID)) return true;
  for (const body of flowHandlerBodies(graph).values()) {
    if (body.steps.includes(nodeId)) return true;
  }
  return false;
}
