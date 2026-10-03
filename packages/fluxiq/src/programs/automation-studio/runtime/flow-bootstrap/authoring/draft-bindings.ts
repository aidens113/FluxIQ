// What the bindings a draft's steps carry say about the plan they assemble
// into, checked once the plan's graph exists.
//
// A step may carry, anywhere in its parameters, a state binding the executor
// resolves at run time (`nodes/parameter-bindings.ts`): `{"$state":{"path"}}`.
// Two kinds matter here, and both are read by their shape alone:
//
//   a row binding     path `item` or `item.<field>`: the row the For Each pass
//                     is on. Outside a loop over a list there is no row, so the
//                     step would run on nothing; it is refused, naming the step.
//   a Flow input      a dotless path with a `fallback`: the run's input of that
//                     name, else the value the build tested with. A name equal
//                     to an output port of any node in the plan is refused,
//                     because a node's bare output keys enter the same state
//                     and overwrite the input; and `item` is the row's name.
//
// **Where a step is inside a loop is read from the graph, not the draft.** A
// node is in a list loop's body when it is reached from For Each's `body` port
// without passing back through that For Each, which is exactly what the
// routing (`./draft-routing.ts`) wired a repeat span over a list into. A span
// repeating while a check holds has no For Each, and no row.
//
// The bindings are detected here rather than through the draft's own binding
// vocabulary: by the time a plan exists every form the model wrote has become
// `$state`, and that is the only shape the run reads.

import type { JsonValue } from "../../../../../core/index.ts";
import {
  isAutomationNodeParameterStateBinding,
  type AutomationStudioNodeRegistry,
  type AutomationStudioNodeRegistryResolution
} from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan, AutomationStudioFlowBootstrapSubflow } from "../plan/index.ts";
import { authoringError } from "./issue.ts";

/** The node a list is walked with, and the port its body leaves on (`./draft-routing.ts`). */
const FOR_EACH_NODE_ID = "builtin.control.for-each";
const BODY_PORT = "body";
/** The name the row a pass is on goes by, in state and as a port. */
const ROW_NAME = "item";
/** How deep a parameter value is searched, as far as the executor resolves one. */
const MAXIMUM_DEPTH = 16;

type FoundBinding = { path: string; hasFallback: boolean };

/**
 * The issues a plan's bindings raise, each naming the draft step that carries
 * the binding (`stepPositionOf`), or the node when no step became it.
 */
export function authoringDraftBindingIssues(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  /** The draft step position a node was written from, by node key. */
  stepPositionOf(nodeKey: string): number | undefined;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): AutomationStudioFlowBootstrapIssue[] {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const outputNames = outputPortIds(input.plan, input.registry, input.resolution);
  for (const [subflowIndex, subflow] of input.plan.subflows.entries()) {
    const looped = listLoopBodies(subflow);
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      if (!node.parameters) continue;
      const bindings: FoundBinding[] = [];
      collect(node.parameters, 0, bindings);
      if (!bindings.length) continue;
      const position = input.stepPositionOf(node.key);
      const who = position === undefined ? `The node "${node.key}"` : `Step ${position}`;
      const path = position === undefined ? `plan.subflows.${subflowIndex}.nodes.${nodeIndex}` : `draft.steps.${position}`;
      const rowBound = bindings.some((binding) => binding.path === ROW_NAME || binding.path.startsWith(`${ROW_NAME}.`));
      if (rowBound && !looped.has(node.key)) {
        issues.push(authoringError(
          "flow_draft.row_binding_outside_loop",
          `${who} reads a field of the row a loop is on, but it is not inside a span that repeats over a list, so there is no row for it to read. Make it part of such a span with amend_draft repeat, or give the value itself.`,
          path
        ));
      }
      const shadowed = new Set<string>();
      for (const binding of bindings) {
        if (!binding.hasFallback || binding.path.includes(".") || shadowed.has(binding.path)) continue;
        const reason = binding.path === ROW_NAME
          ? `"${ROW_NAME}" is the name of the row a loop is on`
          : outputNames.has(binding.path) ? `"${binding.path}" is also the name of an output of a step in this Flow, and that output would overwrite the input when the Flow runs` : undefined;
        if (!reason) continue;
        shadowed.add(binding.path);
        issues.push(authoringError(
          "flow_draft.input_shadowed",
          `${who} declares the Flow input "${binding.path}", and ${reason}. Give the input another name.`,
          path
        ));
      }
    }
  }
  return issues;
}

/** Every output port id of every node definition the plan uses. */
function outputPortIds(
  plan: AutomationStudioFlowBootstrapPlan,
  registry: AutomationStudioNodeRegistry,
  resolution: AutomationStudioNodeRegistryResolution
): ReadonlySet<string> {
  const names = new Set<string>();
  const seen = new Set<string>();
  for (const node of plan.subflows.flatMap((subflow) => subflow.nodes)) {
    if (seen.has(node.definitionId)) continue;
    seen.add(node.definitionId);
    for (const port of registry.get(node.definitionId, resolution)?.outputs ?? []) names.add(port.id);
  }
  return names;
}

/**
 * The keys of the nodes inside a list loop's body: every node reached from a
 * For Each's body port without passing back through that For Each.
 */
function listLoopBodies(subflow: AutomationStudioFlowBootstrapSubflow): ReadonlySet<string> {
  const inside = new Set<string>();
  const next = new Map<string, string[]>();
  for (const edge of subflow.edges) next.set(edge.source.nodeKey, [...(next.get(edge.source.nodeKey) ?? []), edge.target.nodeKey]);
  for (const each of subflow.nodes.filter((node) => node.definitionId === FOR_EACH_NODE_ID)) {
    const queue = subflow.edges.filter((edge) => edge.source.nodeKey === each.key && edge.source.portId === BODY_PORT).map((edge) => edge.target.nodeKey);
    const visited = new Set<string>([each.key]);
    while (queue.length) {
      const key = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);
      inside.add(key);
      queue.push(...(next.get(key) ?? []));
    }
  }
  return inside;
}

/** Every state binding in a value, at any depth the executor would resolve. */
function collect(value: JsonValue | undefined, depth: number, into: FoundBinding[]): void {
  if (isAutomationNodeParameterStateBinding(value)) {
    into.push({ path: value.$state.path.trim(), hasFallback: value.$state.fallback !== undefined });
    return;
  }
  if (!value || typeof value !== "object" || depth >= MAXIMUM_DEPTH) return;
  for (const item of Array.isArray(value) ? value : Object.values(value)) collect(item, depth + 1, into);
}
