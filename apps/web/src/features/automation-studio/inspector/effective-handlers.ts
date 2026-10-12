// The Inspector's "Effective handlers" for a selected step: every handler that
// applies to it -- its own, this part's, inherited from parts that call it, and
// the whole automation's -- in the order the run would try them, each with the
// node its link opens. Read from the saved graphs the Inspector is handed; the
// resolution order is the editor's mirror of Core's (`graph/handlers/`).

import {
  flowFactConditionWords,
  flowHandlerBodies,
  flowHandlerEventWords,
  flowHandlerLevelWords,
  flowHandlerRegistrationWords,
  handlerGraphFromSavedFlow,
  resolveEffectiveFlowHandlers,
  type HandlerGraph
} from "../graph/handlers";
import type { InspectorHandlerScopes } from "./types";

/** One handler as the Inspector lists it; `open` names the node its link selects and the graph it is in. */
export type InspectorEffectiveHandler = {
  key: string;
  eventWords: string;
  name: string;
  levelWords: string;
  conditionWords: string;
  open: { flowId: string; nodeId: string };
};

export type InspectorEffectiveHandlers = {
  handlers: InspectorEffectiveHandler[];
  /** A plain note shown under the list: why it is empty, or what it could not include. */
  note?: string;
};

/**
 * The effective handlers of `nodeId` in the saved graph `flow`, or nothing
 * when that graph does not hold the node (the selection is of another graph,
 * or the graph is not loaded yet).
 */
export function inspectorEffectiveHandlers(flow: unknown, nodeId: string, scopes?: InspectorHandlerScopes): InspectorEffectiveHandlers | null {
  const current = handlerGraphFromSavedFlow(flow, scopes?.role);
  if (!current || !current.nodes.some((node) => node.id === nodeId)) return null;
  const graphs = (entries: InspectorHandlerScopes["callers"]) => (entries ?? []).flatMap(({ flow: other, role }) => {
    const graph = handlerGraphFromSavedFlow(other, role);
    return graph ? [graph] : [];
  });
  const callers = graphs(scopes?.callers);
  const automation = graphs(scopes?.automation);
  const byId = new Map<string, HandlerGraph>([current, ...callers, ...automation].map((graph) => [graph.graphId, graph]));
  const handlers = resolveEffectiveFlowHandlers({ current, callers, automation }, nodeId).map((entry): InspectorEffectiveHandler => {
    const graph = byId.get(entry.graphId) ?? current;
    const source = entry.registration.source;
    return {
      key: entry.registration.handlerId,
      eventWords: flowHandlerEventWords(entry.registration.event),
      name: flowHandlerRegistrationWords(entry.registration, graph),
      levelWords: flowHandlerLevelWords(entry.level, graph === current ? "" : graph.name),
      conditionWords: flowFactConditionWords(entry.registration.when, graph),
      open: { flowId: entry.graphId, nodeId: source.kind === "failed_edge" ? source.targetNodeId : source.nodeId }
    };
  });
  const note = insideHandler(current, nodeId)
    ? "Handlers do not run inside a handler or its steps."
    : !scopes
      ? "Lists the handlers stored in this part. Handlers inherited from parts that call it, and the whole automation's handlers in its recovery part, are not loaded here."
      : !handlers.length
        ? "No handler applies to this step."
        : undefined;
  return { handlers, ...(note ? { note } : {}) };
}

function insideHandler(graph: HandlerGraph, nodeId: string): boolean {
  for (const [handlerId, body] of flowHandlerBodies(graph)) {
    if (handlerId === nodeId || body.steps.includes(nodeId)) return true;
  }
  return false;
}
