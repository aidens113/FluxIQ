// A Flow's loops read back as the repeat a draft states (C4, t269; S2, t283).
//
// The build never authors a For Each or a Repeat. It states `repeat over
// <list> through <last step>`, or `repeat through <last step> while <last
// step>`, on the first step of a span, and `flow-bootstrap/authoring/
// draft-routing.ts` derives the rest. For a repeat over a list: the For Each,
// the Merges at its head and exit, the rows into `items`, and each pass's row
// into every step that takes `item`. For a do-while: a Merge at its head, the
// Repeat that counts the passes, the last step's `success` back into the head,
// its branch answers (a next page's `ended`) and the Repeat's `done` into a
// Merge at its exit. Reading a Flow back as a draft (`./draft-from-flow.ts`)
// has to undo exactly that, or the loop comes back as a For Each or Repeat
// step the completion check refuses, with no span to walk.
//
// **Only the assembler's own shape is read back, for both kinds, here.** For a
// For Each: one list into `items`; one contiguous body from `body` whose last
// step closes back into the For Each or the Merge at its head; nothing else
// entering or leaving a body step; `item` going only to body steps. For a
// Repeat: a head Merge whose only way out is into the Repeat, entered only by
// the way into the loop and the body's last step; a Repeat entered only from
// that head and left by one `body` and one `done` alone; one contiguous body
// whose last step leaves by `success` into the head and otherwise only by its
// branch answers into the exit Merge, which `done` and those answers alone
// enter. Either node carries only its defaults, which is all the assembler
// writes -- a setting of its own would be dropped -- except the Repeat's
// `most`, which a draft states and is read back when it is not the default.
// Anything else -- a nested loop, a body that branches, two loops sharing a
// step, a Repeat with other edges -- is not returned, and the seed reads that
// For Each or Repeat as the plain step it always did, which the completion
// check refuses rather than running a loop no draft can state.

import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import { getAutomationNodeDefinition } from "../../../nodes/index.ts";

/** The join at a loop's head and exit, the node a list is walked with, and the one a do-while counts its passes with. */
const MERGE_NODE_ID = "builtin.control.merge";
const FOR_EACH_NODE_ID = "builtin.control.for-each";
const REPEAT_NODE_ID = "builtin.control.repeat";

/** The Repeat setting a draft states, as `most`. */
const MOST_PARAMETER = "most";

/** Nodes that only shape a Flow's path and are never one step of a loop's body. */
const PATH_NODES = new Set(["builtin.control.start", "builtin.control.end", MERGE_NODE_ID, FOR_EACH_NODE_ID, REPEAT_NODE_ID]);

/** An edge's source port, read the way an edge that names none is read. */
function sourcePort(edge: AutomationStudioFlowEdge): string {
  return edge.sourcePortId ?? "success";
}

/** An edge's target port, read the way an edge that names none is read. */
function targetPort(edge: AutomationStudioFlowEdge): string {
  return edge.targetPortId ?? "in";
}

/**
 * One loop of the Flow as the repeat a draft states: its body in order, the
 * nodes that only frame it (the For Each or Repeat and the Merges at its head
 * and exit), which the assembler derives again, and either the list node it
 * walks (`over`) or, for a do-while, that it runs again while its last step
 * succeeds (`while`), with the Repeat's `most` when that is not the default.
 */
export type AutomationStudioFlowDraftSeedLoop = { body: string[]; framing: string[] }
  & ({ over: string; while?: never; most?: never } | { while: true; most?: number; over?: never });

/**
 * Every For Each and Repeat drawn the way `flow-bootstrap/authoring/
 * draft-routing.ts` draws one, read back as a repeat. One in any other shape
 * is not returned and is seeded as the plain step it always was.
 */
export function automationStudioFlowDraftSeededLoops(
  nodes: readonly AutomationStudioFlowNode[],
  edges: readonly AutomationStudioFlowEdge[]
): AutomationStudioFlowDraftSeedLoop[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const loops = nodes
    .map((node) => node.definitionId === FOR_EACH_NODE_ID ? seededLoop(node, byId, edges)
      : node.definitionId === REPEAT_NODE_ID ? seededDoWhile(node, byId, edges) : undefined)
    .filter((loop): loop is AutomationStudioFlowDraftSeedLoop => loop !== undefined);
  // Two loops over the same rows, or sharing a body step or a Merge, is a
  // shape no draft states: neither is seeded as a loop.
  const claimed = (loop: AutomationStudioFlowDraftSeedLoop): string[] => [...(loop.over === undefined ? [] : [loop.over]), ...loop.body, ...loop.framing];
  const claims = loops.flatMap(claimed);
  return loops.filter((loop) => claimed(loop).every((id) => claims.indexOf(id) === claims.lastIndexOf(id)));
}

/** One For Each read back as a repeat, or nothing when its shape is not the assembler's. */
function seededLoop(
  each: AutomationStudioFlowNode,
  byId: ReadonlyMap<string, AutomationStudioFlowNode>,
  edges: readonly AutomationStudioFlowEdge[]
): AutomationStudioFlowDraftSeedLoop | undefined {
  // The assembler writes a For Each with its defaults; one carrying a setting
  // of its own would lose it on the way back through a draft.
  if (!settingsAreDefaults(each.parameterValues, FOR_EACH_NODE_ID)) return undefined;
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

/**
 * One Repeat read back as a do-while, or nothing when its shape is not the
 * assembler's (C4): `prev -> loop (Merge) -> pass.body -> first ... last`,
 * `last.success -> loop`, `last.<branch> -> exit (Merge)`, `pass.done -> exit`.
 *
 * Which of the last step's ports are branch answers is its own definition's
 * to say, and a domain's definitions are not readable here, so any port but
 * `success` and `failed` into the exit is taken as one. A `failed` into the
 * exit is not the assembler's: a failing last step fails the Flow, it does not
 * end the loop.
 */
function seededDoWhile(
  pass: AutomationStudioFlowNode,
  byId: ReadonlyMap<string, AutomationStudioFlowNode>,
  edges: readonly AutomationStudioFlowEdge[]
): AutomationStudioFlowDraftSeedLoop | undefined {
  const most = authoredMost(pass);
  if (most === null) return undefined;
  const isMerge = (id: string): boolean => byId.get(id)?.definitionId === MERGE_NODE_ID;
  const isStep = (id: string): boolean => {
    const definitionId = byId.get(id)?.definitionId;
    return definitionId !== undefined && !PATH_NODES.has(definitionId);
  };
  const into = (id: string): AutomationStudioFlowEdge[] => edges.filter((edge) => edge.targetNodeId === id);
  const out = (id: string): AutomationStudioFlowEdge[] => edges.filter((edge) => edge.sourceNodeId === id);
  // The head: one Merge, the only way into the Repeat, and going nowhere else.
  const entries = into(pass.id);
  if (entries.length !== 1 || sourcePort(entries[0]!) !== "success") return undefined;
  const head = entries[0]!.sourceNodeId;
  if (!isMerge(head) || out(head).length !== 1) return undefined;
  // The Repeat leaves by one `body` and one `done`, and by nothing else.
  const leaving = out(pass.id);
  const bodyOut = leaving.filter((edge) => sourcePort(edge) === "body");
  const doneOut = leaving.filter((edge) => sourcePort(edge) === "done");
  if (bodyOut.length !== 1 || doneOut.length !== 1 || leaving.length !== 2) return undefined;
  const exit = doneOut[0]!.targetNodeId;
  if (!isMerge(exit) || exit === head) return undefined;
  const body: string[] = [];
  for (let current = bodyOut[0]!.targetNodeId; ;) {
    if (!isStep(current) || body.includes(current)) return undefined;
    // A span is contiguous: only the step before it (the Repeat's `body`, for
    // the first) enters a body step.
    const previous = body.at(-1);
    const entering = into(current);
    const expectedPort = previous === undefined ? "body" : "success";
    if (entering.length !== 1 || entering[0]!.sourceNodeId !== (previous ?? pass.id) || sourcePort(entering[0]!) !== expectedPort) return undefined;
    body.push(current);
    const next = out(current);
    const closes = next.filter((edge) => sourcePort(edge) === "success" && edge.targetNodeId === head);
    if (closes.length === 1) {
      // The last step: back into the head on success, its branch answers into
      // the exit, and nothing else.
      const stray = (edge: AutomationStudioFlowEdge): boolean => edge !== closes[0]
        && (edge.targetNodeId !== exit || ["success", "failed"].includes(sourcePort(edge)));
      if (next.some(stray)) return undefined;
      break;
    }
    // A body step that routes anywhere but on is a branch inside the loop.
    if (next.length !== 1 || sourcePort(next[0]!) !== "success") return undefined;
    current = next[0]!.targetNodeId;
  }
  const last = body.at(-1)!;
  // The head is entered by the back edge and at most the one way into the loop.
  const headEntries = into(head);
  if (headEntries.length > 2 || headEntries.some((edge) => edge.sourceNodeId !== last && (body.includes(edge.sourceNodeId) || edge.sourceNodeId === pass.id))) return undefined;
  // The exit is entered by `done` and the last step's answers alone.
  if (into(exit).some((edge) => edge.sourceNodeId !== pass.id && edge.sourceNodeId !== last)) return undefined;
  return { while: true, ...(most === undefined ? {} : { most }), body, framing: [head, pass.id, exit] };
}

/**
 * The Repeat's `most` as a draft states it: nothing when it is the default,
 * the count when it is a whole number of passes the node allows, and `null`
 * -- no do-while a draft can state -- when it is anything else or the Repeat
 * carries any other setting of its own.
 */
function authoredMost(pass: AutomationStudioFlowNode): number | undefined | null {
  const { [MOST_PARAMETER]: most, ...rest } = pass.parameterValues ?? {};
  if (!settingsAreDefaults(rest, REPEAT_NODE_ID)) return null;
  const parameter = (getAutomationNodeDefinition(REPEAT_NODE_ID)?.parameters ?? []).find((each) => each.id === MOST_PARAMETER);
  if (most === undefined || most === parameter?.defaultValue) return undefined;
  const minimum = parameter?.constraints?.minimum ?? 1;
  const maximum = parameter?.constraints?.maximum ?? Number.MAX_SAFE_INTEGER;
  return typeof most === "number" && Number.isInteger(most) && most >= minimum && most <= maximum ? most : null;
}

/** Whether every setting a loop node carries is its definition's default. */
function settingsAreDefaults(values: AutomationStudioFlowNode["parameterValues"], definitionId: string): boolean {
  const parameters = getAutomationNodeDefinition(definitionId)?.parameters ?? [];
  return Object.entries(values ?? {}).every(([id, value]) =>
    parameters.some((parameter) => parameter.id === id && parameter.defaultValue === value));
}
