// A read whose rows are working rows: what a repeat walked, never the answer
// (t752).
//
// **Why.** A Flow read a list with no condition, repeated a press that only
// showed each row's details over every row that read kept, then read the same
// list again with a condition and stored the few rows the request asked for:
// the shape the build's own guidance prescribes for acting on rows and then
// answering. Every read collects its rows into a record set of its own, so the
// first read's rows were stored too, and the judge's copy treated every record
// set as the result: each row the last read's condition left out, being held
// by the first read's set, was listed as "stored though left out" and called
// a row of the result the answer should not hold, and a yes that did not name
// each was held (`../request-rows/summary-with-also-in-result.ts`,
// `../request-rows/unquoted-rows.ts`). An exactly right answer could not be
// judged yes.
//
// **What is flagged.** A read (the earlier one) where
//  - a For Each loop (`builtin.control.for-each`) walks its rows: the graph's
//    edge from it into the loop's `items` port, the port the build wires a
//    `repeat over` into (`../../flow-bootstrap/authoring/draft-routing.ts`);
//  - a step of that loop succeeded, in the same frame, after this read spoke;
//  - and a later read, not a step of that loop, in the same frame, ran after
//    that step, reading the same target (`./same-target.ts`).
// Nothing else: whether either read has conditions, how many rows each kept,
// and whether the repeated step lasts do not matter. Its rows are what the
// repeat walked, and the later read's are the answer. The flag names the later
// read and the repeated steps by node id, with Core's sentence.
//
// **Not the later read's rows (t691 still holds).** A read whose condition
// narrowed what the Flow acted on, followed by a last read that also stores
// rows that condition left out (a library: renew the overdue books, then a
// last read storing books never renewed), flags the first read, never the
// last: the last read's rows are the answer, and each row it stores that the
// first read's condition left out is still a stored row a yes must account for.

import type { AutomationStudioFlowEdge, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";
import { automationStudioActivityLoops } from "../../activity/loop/index.ts";
import type { AutomationStudioResultReadAccount, AutomationStudioResultWorkingRows } from "../contracts/index.ts";
import { automationStudioResultReadSameTarget } from "./same-target.ts";

/** The list loop: a section run once for each row of a list (`nodes/control-flow/for-each.ts`). */
const FOR_EACH = "builtin.control.for-each";
/** The port For Each takes its rows on. */
const ITEMS_PORT = "items";

/**
 * The flag for each read, aligned with `reads`: undefined for a read it does
 * not hold for. `speaking` is the attempt each read speaks with
 * (`./accounts.ts`), `nodes` the node each was told by.
 */
export function automationStudioResultReadWorkingRows(input: {
  reads: readonly AutomationStudioResultReadAccount[];
  nodes: readonly (AutomationStudioFlowNode | undefined)[];
  speaking: readonly AutomationStudioFlowRunActionAttemptRecord[];
  flowNodes: readonly AutomationStudioFlowNode[];
  flowEdges: readonly AutomationStudioFlowEdge[];
  actionAttempts: readonly AutomationStudioFlowRunActionAttemptRecord[];
}): Array<AutomationStudioResultWorkingRows | undefined> {
  const loops = automationStudioActivityLoops({ nodes: input.flowNodes, edges: input.flowEdges }, FOR_EACH);
  const order = new Map(input.actionAttempts.map((attempt, index) => [attempt, index]));
  const at = (attempt: AutomationStudioFlowRunActionAttemptRecord | undefined): number => (attempt ? order.get(attempt) : undefined) ?? -1;
  return input.reads.map((source, index) => {
    const sourceNode = input.nodes[index];
    const sourceAttempt = input.speaking[index];
    if (!sourceNode || !sourceAttempt) return undefined;
    const frame = sourceAttempt.parentAttemptId;
    for (const loop of loops) {
      if (!input.flowEdges.some((edge) => edge.sourceNodeId === source.nodeId && edge.targetNodeId === loop.repeatId && edge.targetPortId === ITEMS_PORT)) continue;
      // The loop's steps that succeeded, in this frame, after this read spoke.
      const passes = input.actionAttempts.filter((attempt) => loop.members.has(attempt.nodeId) && attempt.parentAttemptId === frame
        && attempt.status === "succeeded" && attempt.skipped === undefined && at(attempt) > at(sourceAttempt));
      if (!passes.length) continue;
      // The first later read of the same target, outside the loop, after one of those steps.
      const later = input.reads
        .map((read, position) => ({ read, node: input.nodes[position], spoke: at(input.speaking[position]), frame: input.speaking[position]?.parentAttemptId, position }))
        .filter((entry) => entry.position !== index && entry.node !== undefined && entry.frame === frame && !loop.members.has(entry.read.nodeId)
          && passes.some((pass) => at(pass) < entry.spoke) && automationStudioResultReadSameTarget(sourceNode, entry.node))
        .sort((one, two) => one.spoke - two.spoke)[0];
      if (!later) continue;
      const repeatedBy = [...new Set(passes.filter((pass) => at(pass) < later.spoke).map((pass) => pass.nodeId))];
      const flag = { rereadBy: later.read.nodeId, repeatedBy, sameList: "items_edge_and_read_target" as const };
      return { ...flag, said: said(source, flag) };
    }
    return undefined;
  });
}

/** Core's sentence for the flag (header): what was measured, and what it means for the answer. Generic words. */
function said(source: AutomationStudioResultReadAccount, flag: Omit<AutomationStudioResultWorkingRows, "said">): string {
  const steps = flag.repeatedBy.map((id) => `step ${id}`);
  const repeated = steps.length === 1 ? steps[0]! : `${steps.slice(0, -1).join(", ")} and ${steps.at(-1)!}`;
  return `${repeated.charAt(0).toUpperCase()}${repeated.slice(1)} ran once for each row step ${source.nodeId} kept, and step ${flag.rereadBy} then read the same list again (the rows ${repeated} ran over come from step ${source.nodeId}, and both read one target). `
    + `So step ${source.nodeId}'s rows are working rows, what the repeat went over, and the answer is what step ${flag.rereadBy} stored: a row only step ${source.nodeId} stored is not a row of the result, and not one the answer holds. `
    + `Judge the answer by step ${flag.rereadBy}'s rows, and the rows its own conditions left out, against the request's own words.`;
}
