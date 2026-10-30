// Whether a from-step run can start at a step (t804, design "binding
// closure"): a run from a step seeds no values, so every value a step at or
// after it reads must come from a step the run itself reaches first. Pure,
// read off the proposal's plan; nothing runs.
//
// **Run order.** The steps a run from `fromKey` reaches, in the order it first
// reaches them: breadth first along the plan's control edges -- those into a
// step's `in` or a join's `branches` -- in the order the plan lists them. A
// value edge (a list's rows into a For Each's `items`, a loop's `item` into a
// step of its body) carries a value, never the run.
//
// **What a step reads**, each producer named by its plan key:
//
// - a value edge into it, from the edge's source step;
// - `$node.<key>.<output>` anywhere in its parameters, an earlier step's
//   output (a script's `$step.<label>.<output>`), from that step;
// - `item` or `item.<field>` (a script's `$row.<field>`), the row of a pass,
//   from the For Each whose `item` edge or `body` leads to it;
// - a path naming one of the subflow's interface inputs with no fallback (a
//   part's `$input.<name>`), a value the run is given: a from-step run is
//   given none, so it is unbound. `$input.<name> = <value>` keeps its test
//   value as the fallback and is bound.
//
// A producer is bound when the run reaches it before the reader. When it is
// not, the run is refused `subflow.from_step_unbound`, naming the step it must
// start at or before: the first producer the chain of unbound producers leads
// back to (E/0051: a step inside `repeat over: posts` reads the row, whose For
// Each reads the rows of `posts`, so `posts` is named).

import type { JsonValue } from "../../../../../core/index.ts";
import { automationNodeOutputReference, isAutomationNodeParameterStateBinding } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapSubflow } from "../../flow-bootstrap/plan/index.ts";

/** The code a from-step run is refused under when a step it would run reads a value nothing before it in the run produces. */
export const AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_UNBOUND = "subflow.from_step_unbound";
/** The code a from-step run is refused under when its step is not one of the subflow's. */
export const AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_UNKNOWN = "subflow.from_step_unknown";

/** Why a from-step run cannot start at its step: the step that reads the value, and the step to start at or before, or the input it is not given. */
export type AutomationStudioSubflowFromStepUnbound =
  | { code: typeof AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_UNBOUND; reader: string; producer: string; chain: string[] }
  | { code: typeof AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_UNBOUND; reader: string; input: string }
  | { code: typeof AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_UNKNOWN };

const FOR_EACH = "builtin.control.for-each";
const ROW = "item";
const CONTROL_PORTS: ReadonlySet<string> = new Set(["in", "branches", ""]);
/** As deep as the executor resolves a binding (`nodes/parameter-bindings.ts`). */
const MAX_DEPTH = 16;

/** The plan keys a run from `fromKey` reaches, in the order it first reaches them (header); empty when no step has the key. */
export function automationStudioSubflowFromStepOrder(subflow: Pick<AutomationStudioFlowBootstrapSubflow, "nodes" | "edges">, fromKey: string): string[] {
  if (!subflow.nodes.some((node) => node.key === fromKey)) return [];
  const order = [fromKey];
  const seen = new Set(order);
  for (let at = 0; at < order.length; at += 1) {
    for (const edge of subflow.edges) {
      if (edge.source.nodeKey !== order[at] || !control(edge) || seen.has(edge.target.nodeKey)) continue;
      seen.add(edge.target.nodeKey);
      order.push(edge.target.nodeKey);
    }
  }
  return order;
}

/** Why a run of `subflow` from `fromKey` would read a value it never made (header); undefined when every value it reads is bound. */
export function automationStudioSubflowFromStepUnbound(subflow: Pick<AutomationStudioFlowBootstrapSubflow, "nodes" | "edges" | "interface">, fromKey: string): AutomationStudioSubflowFromStepUnbound | undefined {
  const order = automationStudioSubflowFromStepOrder(subflow, fromKey);
  if (!order.length) return { code: AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_UNKNOWN };
  const place = new Map(order.map((key, index) => [key, index]));
  const inputs = new Set((subflow.interface?.inputs ?? []).map((port) => port.id));
  for (const reader of order) {
    const read = reads(subflow, reader, inputs);
    if (read.input !== undefined) return { code: AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_UNBOUND, reader, input: read.input };
    const at = place.get(reader)!;
    const bound = (producer: string) => (place.get(producer) ?? Infinity) < at;
    const first = read.producers.find((producer) => !bound(producer));
    if (first === undefined) continue;
    // Back along the producers the run does not reach first, to the step it must start at or before.
    const chain = [first];
    for (let next: string | undefined = first; next !== undefined;) {
      next = reads(subflow, next, inputs).producers.find((producer) => !bound(producer) && !chain.includes(producer));
      if (next !== undefined) chain.push(next);
    }
    return { code: AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_UNBOUND, reader, producer: chain.at(-1)!, chain };
  }
  return undefined;
}

/** The steps whose values `key` reads, by plan key, and the first interface input it reads with no value (header). */
function reads(subflow: Pick<AutomationStudioFlowBootstrapSubflow, "nodes" | "edges">, key: string, inputs: ReadonlySet<string>): { producers: string[]; input?: string } {
  const node = subflow.nodes.find((candidate) => candidate.key === key);
  const producers = new Set<string>();
  for (const edge of subflow.edges) {
    if (edge.target.nodeKey === key && !control(edge) && edge.source.nodeKey !== key) producers.add(edge.source.nodeKey);
  }
  let input: string | undefined;
  let row = false;
  for (const binding of bindings(node?.parameters ?? {}, 0)) {
    const output = automationNodeOutputReference(binding.path);
    if (output) {
      if (output.key !== key && subflow.nodes.some((candidate) => candidate.key === output.key)) producers.add(output.key);
      continue;
    }
    const head = binding.path.split(".")[0]!;
    if (head === ROW) row = true;
    else if (inputs.has(head) && !binding.fallback && input === undefined) input = head;
  }
  if (row) for (const loop of loopsOver(subflow, key)) producers.add(loop);
  return { producers: [...producers], ...(input !== undefined ? { input } : {}) };
}

/** The For Each steps whose row reaches `key`: by an `item` edge into it, or by their `body` leading to it. */
function loopsOver(subflow: Pick<AutomationStudioFlowBootstrapSubflow, "nodes" | "edges">, key: string): string[] {
  const loops = subflow.nodes.filter((node) => node.definitionId === FOR_EACH && node.key !== key).map((node) => node.key);
  const wired = loops.filter((loop) => subflow.edges.some((edge) => edge.source.nodeKey === loop && edge.source.portId === ROW && edge.target.nodeKey === key));
  if (wired.length) return wired;
  return loops.filter((loop) => {
    // The body, walked from the loop's `body` edge along control edges, never back through the loop itself.
    const queue = subflow.edges.filter((edge) => edge.source.nodeKey === loop && edge.source.portId === "body").map((edge) => edge.target.nodeKey);
    const seen = new Set(queue);
    for (let at = 0; at < queue.length; at += 1) {
      if (queue[at] === key) return true;
      for (const edge of subflow.edges) {
        if (edge.source.nodeKey !== queue[at] || !control(edge) || edge.target.nodeKey === loop || seen.has(edge.target.nodeKey)) continue;
        seen.add(edge.target.nodeKey);
        queue.push(edge.target.nodeKey);
      }
    }
    return false;
  });
}

/** Every state binding in a parameter value, at any depth resolution reaches. */
function bindings(value: JsonValue, depth: number): Array<{ path: string; fallback: boolean }> {
  if (isAutomationNodeParameterStateBinding(value)) return [{ path: value.$state.path, fallback: value.$state.fallback !== undefined }];
  if (!value || typeof value !== "object" || depth >= MAX_DEPTH) return [];
  return (Array.isArray(value) ? value : Object.values(value)).flatMap((item) => bindings(item, depth + 1));
}

function control(edge: AutomationStudioFlowBootstrapSubflow["edges"][number]): boolean {
  return CONTROL_PORTS.has(edge.target.portId ?? "");
}
