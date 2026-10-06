// A Flow's loops read back as the repeat a draft states (C4, t269).
//
// The build never authors a For Each. It states `repeat over <list> through
// <last step>` on the first step of a span, and `flow-bootstrap/authoring/
// draft-routing.ts` derives the rest: the For Each, the Merges at its head and
// exit, the rows into `items`, and each pass's row into every step that takes
// `item`. Reading a Flow back as a draft (`./draft-from-flow.ts`) has to undo
// exactly that, or the loop comes back as a For Each step with nothing feeding
// its required `items` and no span to walk.
//
// **Only the assembler's own shape is read back.** One list into `items`; one
// contiguous body from `body` whose last step closes back into the For Each or
// the Merge at its head; nothing else entering or leaving a body step; `item`
// going only to body steps; and a For Each whose settings are its defaults,
// which is all the assembler writes: a setting of its own would be dropped. Anything else -- a nested
// loop, a body that branches, two loops sharing a step -- is not returned, and
// the seed reads that For Each as the plain step it always did, which the
// completion check refuses rather than running a loop no draft can state.

import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import { getAutomationNodeDefinition } from "../../../nodes/index.ts";

/** The join at a loop's head and exit, and the node a list is walked with. */
const MERGE_NODE_ID = "builtin.control.merge";
const FOR_EACH_NODE_ID = "builtin.control.for-each";

/** Nodes that only shape a Flow's path and are never one step of a loop's body. */
const PATH_NODES = new Set(["builtin.control.start", "builtin.control.end", MERGE_NODE_ID, FOR_EACH_NODE_ID]);

/** An edge's source port, read the way an edge that names none is read. */
function sourcePort(edge: AutomationStudioFlowEdge): string {
  return edge.sourcePortId ?? "success";
}

/** An edge's target port, read the way an edge that names none is read. */
function targetPort(edge: AutomationStudioFlowEdge): string {
  return edge.targetPortId ?? "in";
}

/**
 * One loop of the Flow as the repeat a draft states: the list node it walks,
 * its body in order, and the nodes that only frame it (the For Each and the
 * Merges at its head and exit), which the assembler derives again.
 */
export type AutomationStudioFlowDraftSeedLoop = { over: string; body: string[]; framing: string[] };

/**
 * Every For Each drawn the way `flow-bootstrap/authoring/draft-routing.ts`
 * draws one, read back as a repeat. A For Each in any other shape is not
 * returned and is seeded as the plain step it always was.
 */
export function automationStudioFlowDraftSeededLoops(
  nodes: readonly AutomationStudioFlowNode[],
  edges: readonly AutomationStudioFlowEdge[]
): AutomationStudioFlowDraftSeedLoop[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const loops = nodes
    .filter((node) => node.definitionId === FOR_EACH_NODE_ID)
    .map((node) => seededLoop(node, byId, edges))
    .filter((loop): loop is AutomationStudioFlowDraftSeedLoop => loop !== undefined);
  // Two loops over the same rows, or sharing a body step, is a shape no draft
  // states: neither is seeded as a loop.
  const claims = loops.flatMap((loop) => [loop.over, ...loop.body, ...loop.framing]);
  return loops.filter((loop) => [loop.over, ...loop.body, ...loop.framing]
    .every((id) => claims.indexOf(id) === claims.lastIndexOf(id)));
}

/** One For Each read back as a repeat, or nothing when its shape is not the assembler's. */
function seededLoop(
  each: AutomationStudioFlowNode,
  byId: ReadonlyMap<string, AutomationStudioFlowNode>,
  edges: readonly AutomationStudioFlowEdge[]
): AutomationStudioFlowDraftSeedLoop | undefined {
  // The assembler writes a For Each with its defaults; one carrying a setting
  // of its own would lose it on the way back through a draft.
  if (!settingsAreDefaults(each)) return undefined;
  const isMerge = (id: string): boolean => byId.get(id)?.definitionId === MERGE_NODE_ID;
  const isStep = (id: string): boolean => {
    const definitionId = byId.get(id)?.definitionId;
    return definitionId !== undefined && !PATH_NODES.has(definitionId);
  };
  const into = (id: string): AutomationStudioFlowEdge[] => edges.filter((edge) => edge.targetNodeId === id);
  const out = (id: string): AutomationStudioFlowEdge[] => edges.filter((edge) => edge.sourceNodeId === id);
  const leaving = out(each.id);
  const rows = into(each.id).filter((edge) => targetPort(edge) === "items");
  const bodyOut = leaving.filter((edge) => sourcePort(edge) === "body");
  const doneOut = leaving.filter((edge) => sourcePort(edge) === "done");
  if (rows.length !== 1 || bodyOut.length !== 1 || doneOut.length > 1) return undefined;
  if (leaving.some((edge) => !["body", "done", "item"].includes(sourcePort(edge)))) return undefined;
  const over = rows[0]!.sourceNodeId;
  if (!isStep(over)) return undefined;
  // The loop's way in: straight into the For Each, or through the Merge at its
  // head that the last body step closes back into.
  const entries = into(each.id).filter((edge) => targetPort(edge) !== "items");
  const head = entries.length === 1 && isMerge(entries[0]!.sourceNodeId) ? entries[0]!.sourceNodeId : undefined;
  if (head && out(head).some((edge) => edge.targetNodeId !== each.id)) return undefined;
  const body: string[] = [];
  for (let current = bodyOut[0]!.targetNodeId; ;) {
    if (!isStep(current) || body.includes(current) || current === over) return undefined;
    const previous = body.at(-1);
    // A span is contiguous: only the step before it (the For Each's `body`, for
    // the first) and the pass's row from the For Each enter a body step.
    const expected = (edge: AutomationStudioFlowEdge): boolean =>
      (edge.sourceNodeId === each.id && sourcePort(edge) === "item")
      || (previous === undefined ? edge.sourceNodeId === each.id && sourcePort(edge) === "body" : edge.sourceNodeId === previous && sourcePort(edge) === "success");
    if (!into(current).every(expected)) return undefined;
    body.push(current);
    // A body step that routes anywhere but on is a branch inside the loop.
    const next = out(current);
    if (next.length !== 1 || sourcePort(next[0]!) !== "success") return undefined;
    current = next[0]!.targetNodeId;
    if (current === each.id || current === head) break;
  }
  const last = body.at(-1)!;
  const entering = head ? into(head) : entries;
  if (!entering.some((edge) => edge.sourceNodeId === last)) return undefined;
  if (leaving.some((edge) => sourcePort(edge) === "item" && !body.includes(edge.targetNodeId))) return undefined;
  // The Merge the loop is left into frames it only when nothing else joins there.
  const exit = doneOut[0]?.targetNodeId;
  const exitFrame = exit !== undefined && isMerge(exit) && into(exit).length === 1 ? [exit] : [];
  return { over, body, framing: [each.id, ...(head ? [head] : []), ...exitFrame] };
}

/** Whether every setting a For Each carries is its definition's default. */
function settingsAreDefaults(each: AutomationStudioFlowNode): boolean {
  const parameters = getAutomationNodeDefinition(FOR_EACH_NODE_ID)?.parameters ?? [];
  return Object.entries(each.parameterValues ?? {}).every(([id, value]) =>
    parameters.some((parameter) => parameter.id === id && parameter.defaultValue === value));
}
