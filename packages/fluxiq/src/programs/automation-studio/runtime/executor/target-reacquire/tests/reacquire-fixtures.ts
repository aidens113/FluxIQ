// Fixtures for the stale-target re-acquire tests (t786): a generic recipe
// archive whose cards carry a save count that changes when the page redraws,
// read by a list read and walked by a For Each whose body saves the card. The
// save press accepts its target only inside a card holding every value of the
// row it was handed, as the web domain scopes a row-bound step; a row read
// before the redraw therefore no longer matches although the card is still
// there. No model, no browser.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../activity/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";

export type Card = { id: string; title: string; saves: number };
export type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;

/** The page: its cards, how often it was read, every press made on it, and what happens after each read. */
export type Page = { cards: Card[]; reads: number; calls: string[]; saved: string[]; afterRead?: (page: Page) => void };

export const NOT_FOUND: AutomationStudioFailureRecord = { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" };

export function graph(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowEdge[]): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.reacquire", ownerKind: "routine", ownerId: "routine.test", name: "Re-acquire", createdAt: 1, updatedAt: 1, nodes, edges };
}

export function edge(sourceNodeId: string, targetNodeId: string, sourcePortId = "success", targetPortId = "in"): AutomationStudioFlowEdge {
  return { id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}.${targetPortId}`, sourceNodeId, targetNodeId, sourcePortId, targetPortId };
}

/** A press on the element `elementId`, with any further parameters and metadata. */
export function press(id: string, elementId: string, extra: JsonObject = {}, metadata?: JsonObject, label?: string): AutomationStudioFlowNode {
  return {
    id,
    definitionId: "builtin.policy.action",
    ...(label ? { label } : {}),
    parameterValues: { outputId: "activate-element", parameters: { elementId, ...extra } },
    ...(metadata ? { metadata } : {})
  };
}

/** The list read, labelled as a person reads it; it states it reads unless `effect` says otherwise. */
export function readCards(effect: "observe" | "mutate" = "observe"): AutomationStudioFlowNode {
  return press("read", "read", {}, { effect }, "Read the recipes");
}

/** The save press, bound to the pass's row. */
export function saveCard(extra: Partial<AutomationStudioFlowNode> = {}): AutomationStudioFlowNode {
  const node = press("save", "save", { row: { $state: { path: "item" } } as unknown as JsonObject }, undefined, "Save the recipe");
  return { ...node, ...extra, parameterValues: { ...node.parameterValues, ...(extra.parameterValues ?? {}) } };
}

/**
 * start -> read -> each (For Each over read's rows) -> save (the pass's row) ->
 * each; each's `done` -> end. `failedTo` wires save's failed route to a node.
 */
export function cardsFlow(options: { save?: AutomationStudioFlowNode; read?: AutomationStudioFlowNode; each?: JsonObject; failedTo?: AutomationStudioFlowNode } = {}): AutomationStudioFlowDocument {
  const nodes: AutomationStudioFlowNode[] = [
    { id: "start", definitionId: "builtin.control.start" },
    options.read ?? readCards(),
    { id: "each", definitionId: "builtin.control.for-each", ...(options.each ? { parameterValues: options.each } : {}) },
    options.save ?? saveCard(),
    { id: "end", definitionId: "builtin.control.end" }
  ];
  const edges = [
    edge("start", "read"),
    edge("read", "each"),
    edge("read", "each", "rows", "items"),
    edge("each", "save", "body"),
    edge("each", "save", "item", "item"),
    edge("save", "each"),
    edge("each", "end", "done")
  ];
  if (options.failedTo) {
    nodes.push(options.failedTo);
    edges.push(edge("save", options.failedTo.id, "failed"), edge(options.failedTo.id, "each"));
  }
  return graph(nodes, edges);
}

/** Reads the cards (a copy each time, as a fresh read is); presses a card only when it holds every value of the row handed to the press. */
export function cardsOptions(page: Page, host: Host, extra: Partial<AutomationStudioGraphExecutionOptions> = {}): AutomationStudioGraphExecutionOptions {
  return {
    hostRuntime: host,
    delay: async () => undefined,
    effectDispatcher: (effect) => {
      const payload = (effect.payload ?? {}) as { parameters?: { elementId?: string; row?: Card } };
      const elementId = payload.parameters?.elementId ?? "?";
      page.calls.push(elementId);
      if (elementId === "read") {
        page.reads += 1;
        const rows = page.cards.map((card) => ({ ...card }));
        page.afterRead?.(page);
        return { status: "success", route: "success", outputs: { rows } };
      }
      const row = payload.parameters?.row;
      if (!row) return { status: "success", route: "success", outputs: { pressed: elementId } };
      const card = page.cards.find((candidate) => candidate.id === row.id && candidate.title === row.title && candidate.saves === row.saves);
      if (!card) return { status: "failed", route: "failed", message: "No target resolved.", failure: NOT_FOUND };
      page.saved.push(card.id);
      return { status: "success", route: "success", outputs: { saved: card.id } };
    },
    ...extra
  };
}

/** A host that matches the stale card by its id among the fresh rows, recording every request. */
export function matchingHost(requests: unknown[], answer?: (request: Parameters<NonNullable<Host["reacquireTarget"]>>[0]) => ReturnType<NonNullable<Host["reacquireTarget"]>>): Host {
  return {
    capabilities: [],
    reacquireTarget: (request) => {
      requests.push(request);
      if (answer) return answer(request);
      const stale = request.stale as Card;
      const found = request.candidates.find((candidate) => (candidate as Card).id === stale.id);
      return found === undefined ? { outcome: "gone" } : { outcome: "found", value: found };
    }
  };
}

/** One page with the given cards, whose first card gains a save after the first read: a redraw that changes a count. */
export function redrawnPage(cards: Card[] = [{ id: "r1", title: "Lentil soup", saves: 3 }]): Page {
  return {
    cards,
    reads: 0,
    calls: [],
    saved: [],
    afterRead: (page) => {
      if (page.reads === 1) page.cards = page.cards.map((card, index) => (index === 0 ? { ...card, saves: card.saves + 1 } : card));
    }
  };
}

/**
 * Runs a flow in a run's activity scope: the saved trace, the trace as the run
 * executed it (its values and inputs real, where the saved trace withholds
 * what the run resolved out of state), and every activity row it said.
 */
export async function runCards(flow: AutomationStudioFlowDocument, options: AutomationStudioGraphExecutionOptions): Promise<{ trace: AutomationStudioGraphExecutionTrace; executed: AutomationStudioGraphExecutionTrace; rows: ClientGatewayActivity[] }> {
  const rows: ClientGatewayActivity[] = [];
  const unsubscribe = automationStudioActivityHub.subscribe((event) => rows.push(event));
  try {
    let executed: AutomationStudioGraphExecutionTrace | undefined;
    const trace = await runWithAutomationStudioActivity({ kind: "run", id: "run.reacquire", projectId: "project.1", flowId: flow.flowId }, () => runAutomationStudioGraph(flow, options, (ran) => { executed = ran; }));
    return { trace, executed: executed ?? trace, rows };
  } finally {
    unsubscribe();
  }
}

/** The attempts of one node, in order. */
export function attemptsOf(trace: AutomationStudioGraphExecutionTrace, nodeId: string): AutomationStudioNodeAttemptTrace[] {
  return trace.attempts.filter((attempt) => attempt.nodeId === nodeId);
}

/** The `reacquire` recovery rows a run said. */
export function reacquireRows(rows: readonly ClientGatewayActivity[]): ClientGatewayActivity[] {
  return rows.filter((row) => row.detail?.recovery?.kind === "reacquire");
}

/** A JSON row value, for the host's `found` answer. */
export function asJson(card: Card): JsonValue {
  return { ...card };
}
