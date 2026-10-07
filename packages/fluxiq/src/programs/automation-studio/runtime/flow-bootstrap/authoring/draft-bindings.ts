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
//
// **A plan written whole is checked here too (t346).** A candidate submission
// is a script or a JSON plan, never a draft, so nothing about it was checked
// statement by statement; `written` asks this checker of it, with two more
// questions only a whole plan can leave open. A row field the listing the loop
// walks does not read is refused, since the pass would read nothing. And a
// cycle that no For Each or Repeat bounds is refused: plan validation accepts
// any cycle that closes through a join, which is how a loop is wired, and a
// cycle through joins alone is one a run could go round for ever. A plan
// assembled from a draft never asks either, so the draft path is unchanged.
//
// `authoringPlanGraph` reads the other facts a whole plan's bindings are held
// to -- which node runs before which, which always runs on the way to which,
// and which loop each runs inside -- for the earlier-output checks
// (`./assemble-draft.ts`).

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
/** The pass counter a span repeated while its last step succeeds is wired around (`./draft-routing.ts`). */
const REPEAT_NODE_ID = "builtin.control.repeat";
const BODY_PORT = "body";
/** The port For Each takes its rows on. */
const ITEMS_PORT = "items";
/** The name the row a pass is on goes by, in state and as a port. */
const ROW_NAME = "item";
/** How deep a parameter value is searched, as far as the executor resolves one. */
const MAXIMUM_DEPTH = 16;

type FoundBinding = { path: string; hasFallback: boolean; at: string };

/**
 * The issues a plan's bindings raise, each naming the draft step that carries
 * the binding (`stepPositionOf`), or the node when no step became it.
 *
 * With `written`, the plan was written whole rather than assembled from a
 * draft (see the header): each issue names the node and the parameter that
 * holds the binding, in a script's words, and row fields and loop bounds are
 * checked too.
 */
export function authoringDraftBindingIssues(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  /** The draft step position a node was written from, by node key. */
  stepPositionOf(nodeKey: string): number | undefined;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  written?: true | undefined;
}): AutomationStudioFlowBootstrapIssue[] {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const written = input.written === true;
  const outputNames = outputPortIds(input.plan, input.registry, input.resolution);
  for (const [subflowIndex, subflow] of input.plan.subflows.entries()) {
    const looped = listLoopBodies(subflow);
    const rowFields = written ? listingFieldsByMember(subflow) : new Map<string, ListingFields>();
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      if (!node.parameters) continue;
      const bindings: FoundBinding[] = [];
      collect(node.parameters, 0, bindings, []);
      if (!bindings.length) continue;
      const position = input.stepPositionOf(node.key);
      const who = position === undefined ? `The node "${node.key}"` : `Step ${position}`;
      const nodePath = position === undefined ? `plan.subflows.${subflowIndex}.nodes.${nodeIndex}` : `draft.steps.${position}`;
      const path = (binding: FoundBinding | undefined): string => written && position === undefined && binding ? `${nodePath}.parameters.${binding.at}` : nodePath;
      const rowBindings = bindings.filter((binding) => binding.path === ROW_NAME || binding.path.startsWith(`${ROW_NAME}.`));
      if (rowBindings.length && !looped.has(node.key)) {
        issues.push(authoringError(
          "flow_draft.row_binding_outside_loop",
          written
            ? `${who} reads a field of the row a loop is on, but it is not inside a span that repeats over a list, so there is no row for it to read. Make it part of such a span with \`repeat over: <the listing step's label>\`, or give the value itself.`
            : `${who} reads a field of the row a loop is on, but it is not inside a span that repeats over a list, so there is no row for it to read. Make it part of such a span with amend_draft repeat, or give the value itself.`,
          path(rowBindings[0])
        ));
      }
      const listing = rowFields.get(node.key);
      if (listing && looped.has(node.key)) {
        const unknown = rowBindings.find((binding) => {
          const field = binding.path.split(".")[1];
          return field !== undefined && !listing.fields.has(field);
        });
        if (unknown) {
          issues.push(authoringError(
            "flow_draft.row_binding_unknown_field",
            `${who} reads the row field "${unknown.path.split(".")[1]}", and the listing its loop walks (the node "${listing.key}") reads ${[...listing.fields].map((field) => `"${field}"`).join(", ")}. Read one of those, or read the field in the listing too.`,
            path(unknown)
          ));
        }
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
          path(binding)
        ));
      }
    }
    if (written) issues.push(...unboundedLoopIssues(subflow, subflowIndex));
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
  return new Set(forEachBodies(subflow).keys());
}

/** Each node inside a list loop's body, with the For Each whose body it is in. */
function forEachBodies(subflow: AutomationStudioFlowBootstrapSubflow): ReadonlyMap<string, string> {
  const inside = new Map<string, string>();
  const next = successors(subflow);
  for (const each of subflow.nodes.filter((node) => node.definitionId === FOR_EACH_NODE_ID)) {
    const queue = subflow.edges.filter((edge) => edge.source.nodeKey === each.key && edge.source.portId === BODY_PORT).map((edge) => edge.target.nodeKey);
    const visited = new Set<string>([each.key]);
    while (queue.length) {
      const key = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);
      if (!inside.has(key)) inside.set(key, each.key);
      queue.push(...(next.get(key) ?? []));
    }
  }
  return inside;
}

type ListingFields = { key: string; fields: ReadonlySet<string> };

/**
 * For each node inside a list loop, the listing whose rows that loop walks and
 * the fields that listing reads, where it names them: the keys of a `fields`
 * object, or a `columns` list, in any of its parameters -- the same reading
 * assembly gives the columns of an extraction (`./assembled-record-output.ts`).
 * A listing that names none says nothing about its rows, and is left out.
 */
function listingFieldsByMember(subflow: AutomationStudioFlowBootstrapSubflow): ReadonlyMap<string, ListingFields> {
  const byKey = new Map(subflow.nodes.map((node) => [node.key, node] as const));
  const listingOf = new Map<string, ListingFields>();
  for (const edge of subflow.edges) {
    if (edge.target.portId !== ITEMS_PORT || byKey.get(edge.target.nodeKey)?.definitionId !== FOR_EACH_NODE_ID) continue;
    const fields = declaredFields(byKey.get(edge.source.nodeKey)?.parameters);
    if (fields) listingOf.set(edge.target.nodeKey, { key: edge.source.nodeKey, fields });
  }
  const members = new Map<string, ListingFields>();
  for (const [member, each] of forEachBodies(subflow)) {
    const listing = listingOf.get(each);
    if (listing) members.set(member, listing);
  }
  return members;
}

function declaredFields(parameters: Readonly<Record<string, JsonValue>> | undefined): ReadonlySet<string> | undefined {
  for (const value of Object.values(parameters ?? {})) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const fields = value.fields ?? value.columns;
    if (fields && typeof fields === "object" && !Array.isArray(fields) && Object.keys(fields).length) return new Set(Object.keys(fields));
    if (Array.isArray(fields)) {
      const names = fields.filter((item): item is string => typeof item === "string");
      if (names.length) return new Set(names);
    }
  }
  return undefined;
}

/** A cycle no For Each or Repeat bounds, named by its first node (see the header). */
function unboundedLoopIssues(subflow: AutomationStudioFlowBootstrapSubflow, subflowIndex: number): AutomationStudioFlowBootstrapIssue[] {
  const definitionOf = new Map(subflow.nodes.map((node) => [node.key, node.definitionId] as const));
  const indexOf = new Map(subflow.nodes.map((node, index) => [node.key, index] as const));
  return stronglyConnected(subflow)
    .filter((component) => component.length > 1 && !component.some((key) => definitionOf.get(key) === FOR_EACH_NODE_ID || definitionOf.get(key) === REPEAT_NODE_ID))
    .map((component) => {
      const ordered = [...component].sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0));
      return authoringError(
        "flow_draft.loop_unbounded",
        `The nodes ${ordered.map((key) => `"${key}"`).join(", ")} go round in a loop that no For Each or Repeat bounds, so a run could go round it for ever. Repeat a span with \`repeat over:\` once for each row of a listing, or \`repeat while:\` with a last step that answers ended or a \`repeat most:\`.`,
        `plan.subflows.${subflowIndex}.nodes.${indexOf.get(ordered[0]!) ?? 0}`
      );
    });
}

/** What a whole plan's earlier-output bindings are held to, read from one Subflow's graph. */
export type AuthoringPlanGraph = {
  /** The loop a node runs inside, by an id every node of that loop shares; absent outside every loop. */
  loopOf(key: string): string | undefined;
  /** Whether `from` runs before `to` on some path, loops' back edges aside. */
  precedes(from: string, to: string): boolean;
  /** Whether every path from the start to `to` passes through `from`, loops' back edges aside. */
  dominates(from: string, to: string): boolean;
};

/**
 * The order facts of one Subflow's graph.
 *
 * A loop's back edge is the one edge a depth-first walk from the start finds
 * arriving at a node still on its path; with those set aside the graph is the
 * order a run first meets its nodes in. A node is inside a loop when it is in
 * a For Each's body or on a cycle with others.
 */
export function authoringPlanGraph(subflow: AutomationStudioFlowBootstrapSubflow): AuthoringPlanGraph {
  const keys = subflow.nodes.map((node) => node.key);
  const forward = acyclicSuccessors(subflow);
  const reach = new Map<string, ReadonlySet<string>>();
  const reachable = (from: string): ReadonlySet<string> => {
    const known = reach.get(from);
    if (known) return known;
    const seen = new Set<string>();
    const queue = [...(forward.get(from) ?? [])];
    while (queue.length) {
      const key = queue.shift()!;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(...(forward.get(key) ?? []));
    }
    reach.set(from, seen);
    return seen;
  };
  const dominators = dominatorSets(keys, forward);
  const loops = new Map<string, string>();
  for (const [member, each] of forEachBodies(subflow)) loops.set(member, `each:${each}`);
  for (const component of stronglyConnected(subflow)) {
    if (component.length < 2) continue;
    const id = `cycle:${[...component].sort()[0]}`;
    for (const key of component) if (!loops.has(key)) loops.set(key, id);
  }
  return {
    loopOf: (key) => loops.get(key),
    precedes: (from, to) => from !== to && reachable(from).has(to),
    dominates: (from, to) => dominators.get(to)?.has(from) === true
  };
}

function successors(subflow: AutomationStudioFlowBootstrapSubflow): Map<string, string[]> {
  const next = new Map<string, string[]>();
  for (const edge of subflow.edges) next.set(edge.source.nodeKey, [...(next.get(edge.source.nodeKey) ?? []), edge.target.nodeKey]);
  return next;
}

/** The successors of each node with every back edge a walk from the start finds set aside. */
function acyclicSuccessors(subflow: AutomationStudioFlowBootstrapSubflow): Map<string, string[]> {
  const next = successors(subflow);
  const arriving = new Set(subflow.edges.map((edge) => edge.target.nodeKey));
  const starts = [...subflow.nodes.map((node) => node.key).filter((key) => !arriving.has(key)), ...subflow.nodes.map((node) => node.key)];
  const state = new Map<string, "open" | "done">();
  const forward = new Map<string, string[]>();
  const walk = (key: string): void => {
    state.set(key, "open");
    for (const target of next.get(key) ?? []) {
      if (state.get(target) === "open") continue;
      forward.set(key, [...(forward.get(key) ?? []), target]);
      if (!state.has(target)) walk(target);
    }
    state.set(key, "done");
  };
  for (const key of starts) if (!state.has(key)) walk(key);
  return forward;
}

/** Each node's dominators over an acyclic successor map, from every node nothing arrives at. */
function dominatorSets(keys: readonly string[], forward: ReadonlyMap<string, readonly string[]>): ReadonlyMap<string, ReadonlySet<string>> {
  const preds = new Map<string, string[]>(keys.map((key) => [key, []]));
  for (const [source, targets] of forward) for (const target of targets) preds.get(target)?.push(source);
  const order: string[] = [];
  const indegree = new Map(keys.map((key) => [key, preds.get(key)?.length ?? 0] as const));
  const queue = keys.filter((key) => indegree.get(key) === 0);
  while (queue.length) {
    const key = queue.shift()!;
    order.push(key);
    for (const target of forward.get(key) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 0) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  const dominators = new Map<string, Set<string>>();
  for (const key of order) {
    const from = (preds.get(key) ?? []).map((pred) => dominators.get(pred)).filter((set): set is Set<string> => set !== undefined);
    const shared = from.length ? new Set([...from[0]!].filter((item) => from.every((set) => set.has(item)))) : new Set<string>();
    shared.add(key);
    dominators.set(key, shared);
  }
  return dominators;
}

/** The strongly connected components of one Subflow's graph (Tarjan). */
function stronglyConnected(subflow: AutomationStudioFlowBootstrapSubflow): string[][] {
  const next = successors(subflow);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let counter = 0;
  const visit = (key: string): void => {
    index.set(key, counter);
    low.set(key, counter);
    counter += 1;
    stack.push(key);
    onStack.add(key);
    for (const target of next.get(key) ?? []) {
      if (!index.has(target)) {
        visit(target);
        low.set(key, Math.min(low.get(key)!, low.get(target)!));
      } else if (onStack.has(target)) low.set(key, Math.min(low.get(key)!, index.get(target)!));
    }
    if (low.get(key) !== index.get(key)) return;
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
    } while (member !== key);
    components.push(component);
  };
  for (const node of subflow.nodes) if (!index.has(node.key)) visit(node.key);
  return components;
}

/** Every state binding in a value, at any depth the executor would resolve, with the dotted path it sits at. */
function collect(value: JsonValue | undefined, depth: number, into: FoundBinding[], at: readonly string[]): void {
  if (isAutomationNodeParameterStateBinding(value)) {
    into.push({ path: value.$state.path.trim(), hasFallback: value.$state.fallback !== undefined, at: at.join(".") });
    return;
  }
  if (!value || typeof value !== "object" || depth >= MAXIMUM_DEPTH) return;
  if (Array.isArray(value)) value.forEach((item, position) => collect(item, depth + 1, into, [...at, String(position)]));
  else for (const [key, item] of Object.entries(value)) collect(item, depth + 1, into, [...at, key]);
}
