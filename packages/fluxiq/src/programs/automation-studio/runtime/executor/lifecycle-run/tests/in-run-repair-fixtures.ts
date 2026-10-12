// Fixtures for the in-run repair tests (state-aware recovery plan, C6 step 8):
// a three-row For Each whose body presses s1 then s2 on the wiring page, a
// fake repair callback that counts its calls and answers what a test scripts,
// and the overlays a fix would produce.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts.ts";
import type { AutomationStudioIncidentRepair, AutomationStudioIncidentRepairCallback, AutomationStudioIncidentRepairRequest } from "../index.ts";
import { edge, graph } from "./lifecycle-fixtures.ts";
import { page, pageOptions, press, type Page } from "./wiring-fixtures.ts";

/** A node that stops the run when it fails, so its failure is a true failure rather than a step the Flow walks past. */
export const STOP: JsonObject = { onFailure: "stop" };

/** start -> list(a, b, c) -> each, whose body is s1 -> s2; each's `done` -> done. */
export function rowsFlow(s2: AutomationStudioFlowNode = press("s2", "s2", STOP)): AutomationStudioFlowDocument {
  const nodes: AutomationStudioFlowNode[] = [
    { id: "start", definitionId: "builtin.control.start" },
    { id: "list", definitionId: "builtin.data.constant", parameterValues: { value: ["a", "b", "c"] } },
    { id: "each", definitionId: "builtin.control.for-each" },
    press("s1"),
    s2,
    { id: "done", definitionId: "builtin.control.end" }
  ];
  const items = { id: "list.value.each", sourceNodeId: "list", sourcePortId: "value", targetNodeId: "each", targetPortId: "items" };
  return graph("graph.main", nodes, [edge("start", "list"), edge("list", "each"), items, edge("each", "s1", "body"), edge("s1", "s2"), edge("s2", "each"), edge("each", "done", "done")]);
}

/** The same graph with node `id` replaced: what a `replace_unit` fix overlays. */
export function replacing(flow: AutomationStudioFlowDocument, id: string, node: AutomationStudioFlowNode): AutomationStudioFlowDocument {
  return { ...flow, nodes: flow.nodes.map((candidate) => (candidate.id === id ? node : candidate)) };
}

/** The same graph with a part added: what an `add_handler` fix overlays. */
export function adding(flow: AutomationStudioFlowDocument, part: { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowDocument["edges"] }): AutomationStudioFlowDocument {
  return { ...flow, nodes: [...flow.nodes, ...part.nodes], edges: [...flow.edges, ...part.edges] };
}

/** The page's press for `elementId` at row `row` (the number of s1 presses that landed) answers `failure` instead of landing. */
export function failingAtRow(options: AutomationStudioGraphExecutionOptions, current: Page, elementId: string, row: number, failure: AutomationStudioFailureRecord): void {
  const dispatch = options.effectDispatcher!;
  options.effectDispatcher = (effect, context) => {
    const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1];
    const at = current.landed.filter((landed) => landed === "s1").length;
    if (id !== elementId || at !== row) return dispatch(effect, context);
    current.presses.push(id);
    return { status: "failed", route: "failed", message: `${id} cannot be done here.`, failure };
  };
}

/** A popup covers the page once the `row`th s1 press lands. */
export function popupAtRow(options: AutomationStudioGraphExecutionOptions, current: Page, row: number): void {
  const dispatch = options.effectDispatcher!;
  options.effectDispatcher = async (effect, context) => {
    const result = await dispatch(effect, context);
    if (current.landed.filter((landed) => landed === "s1").length === row && !current.landed.includes("dismiss")) current.popup = true;
    return result;
  };
}

/** Not retryable, unacted: the step simply cannot be done here. */
export const REFUSED: AutomationStudioFailureRecord = { category: "unexpected_state", code: "web.step.refused", retryable: false, stage: "execution", effect: "unacted" };

/** A repair callback that records every request and answers with `answer`. */
export function repairer(answer: (request: AutomationStudioIncidentRepairRequest) => AutomationStudioIncidentRepair | Promise<AutomationStudioIncidentRepair>): {
  callback: AutomationStudioIncidentRepairCallback;
  requests: AutomationStudioIncidentRepairRequest[];
} {
  const requests: AutomationStudioIncidentRepairRequest[] = [];
  return {
    requests,
    callback: async (request) => {
      requests.push(request);
      return await answer(request);
    }
  };
}

/** The wiring page and its options for the rows flow. */
export function rowsRun(): { current: Page; options: AutomationStudioGraphExecutionOptions } {
  const current = page();
  return { current, options: pageOptions(current) };
}

/** How many times each id was pressed, landed or not. */
export function pressCounts(current: Page): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of current.presses) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}
