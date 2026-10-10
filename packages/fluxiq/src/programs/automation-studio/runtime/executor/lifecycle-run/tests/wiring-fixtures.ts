// Fixtures for the graph-run wiring tests: a page with a popup a test can
// inject, a dispatcher that presses what a step names on it, a host whose
// facts read that page, and Flows built from pressing steps and Handlers whose
// body presses the popup's close button.

import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../host-runtime.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts.ts";
import type { AutomationStudioFactCondition } from "../../lifecycle/index.ts";
import { edge, graph, HANDLER, HANDLER_END } from "./lifecycle-fixtures.ts";

/**
 * The page under test. `popup` covers every target until `dismiss` is pressed
 * (when `dismissWorks`); `popupAfter` names steps after whose press a popup
 * appears; `failing` names steps that fail without acting, retryable or not.
 */
export type Page = {
  popup: boolean;
  dismissWorks: boolean;
  popupAfter: Set<string>;
  failing: Map<string, { retryable: boolean }>;
  /** Every press, in order, landed or not. */
  presses: string[];
  /** Every press that landed, in order. */
  landed: string[];
  /** Every condition batch the host was asked. */
  factBatches: AutomationStudioFactCondition[][];
};

export function page(overrides: Partial<Pick<Page, "popup" | "dismissWorks">> & { popupAfter?: string[]; failing?: Record<string, { retryable: boolean }> } = {}): Page {
  return {
    popup: overrides.popup ?? false,
    dismissWorks: overrides.dismissWorks ?? true,
    popupAfter: new Set(overrides.popupAfter ?? []),
    failing: new Map(Object.entries(overrides.failing ?? {})),
    presses: [],
    landed: [],
    factBatches: []
  };
}

/** A pressing step: dispatched to the host, which presses `elementId` on the page. */
export function press(id: string, elementId = id, metadata?: JsonObject): AutomationStudioFlowNode {
  return { id, definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId } }, ...(metadata ? { metadata } : {}) };
}

/** start -> each step -> done, as a graph. */
export function line(flowId: string, steps: AutomationStudioFlowNode[], parts: Array<{ nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[] }> = []): AutomationStudioFlowDocument {
  const main = [{ id: "start", definitionId: "builtin.control.start" }, ...steps, { id: "done", definitionId: "builtin.control.end" }];
  const edges = main.slice(1).map((node, index) => edge(main[index]!.id, node.id));
  return graph(flowId, [...main, ...parts.flatMap((part) => part.nodes)], [...edges, ...parts.flatMap((part) => part.edges)]);
}

/** A Handler `id` whose body presses the popup's close button, then ends with `end`. */
export function closer(id: string, parameters: JsonObject, end: JsonObject = { disposition: "resume" }, label?: string): { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[] } {
  return {
    nodes: [
      { id, definitionId: HANDLER, parameterValues: parameters, ...(label ? { label } : {}) },
      press(`${id}.close`, "dismiss"),
      { id: `${id}.end`, definitionId: HANDLER_END, parameterValues: end }
    ],
    edges: [edge(id, `${id}.close`, "body"), edge(`${id}.close`, `${id}.end`)]
  };
}

/** A condition on one of the page's facts: `popup`, `cleared`, or anything else, which the host does not know. */
export function fact(name: string): JsonObject {
  return { fact: name, op: "exists" };
}

/** Options that run against `current`: its dispatcher, its host facts, no waiting, a fixed clock. */
export function pageOptions(current: Page, extra: AutomationStudioGraphExecutionOptions = {}, facts = true): AutomationStudioGraphExecutionOptions {
  return { delay: async () => undefined, now: () => 1_000, currentSubflowId: "main", hostRuntime: host(current, facts), effectDispatcher: dispatcher(current), ...extra };
}

function host(current: Page, facts: boolean): AutomationStudioHostRuntimeBoundary {
  if (!facts) return { capabilities: [] };
  return {
    capabilities: ["fact-evaluation"],
    factEvaluator: (conditions) => {
      current.factBatches.push([...conditions]);
      return conditions.map((condition) => ({ result: answer(current, condition.fact), evidence: { popup: current.popup }, capturedAt: 1_000 }));
    }
  };
}

function answer(current: Page, name: string): "true" | "false" | "unknown" {
  if (name === "popup") return current.popup ? "true" : "false";
  if (name === "cleared") return current.popup ? "false" : "true";
  return "unknown";
}

function dispatcher(current: Page): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> {
  return (effect) => {
    const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1] ?? "?";
    current.presses.push(id);
    if (id === "dismiss") {
      if (current.dismissWorks) current.popup = false;
      current.landed.push(id);
      return { status: "success", route: "success", outputs: { ok: true } };
    }
    if (current.popup) return { status: "failed", route: "failed", message: "A popup covers the page.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution", effect: "unacted" } };
    const failing = current.failing.get(id);
    if (failing) return { status: "failed", route: "failed", message: `${id} cannot be done here.`, failure: { category: "unexpected_state", code: "web.step.refused", retryable: failing.retryable, stage: "execution", effect: "unacted" } };
    current.landed.push(id);
    if (current.popupAfter.has(id)) current.popup = true;
    return { status: "success", route: "success", outputs: { ok: true } };
  };
}

/** How many times each step's press landed. */
export function landedCounts(current: Page): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of current.landed) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}
