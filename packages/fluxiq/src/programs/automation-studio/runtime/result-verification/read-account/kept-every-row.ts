// A read that kept every item it saw, after an act was repeated over a
// narrower read of the same list (t692).
//
// **Why.** A8 cost round 2 `run-mvbr0w7e-6a01c05b`: a Flow read a list with
// one condition that kept 4 of its 8 items, repeated a lasting act once for
// each of those 4 rows, then read the same list again with no condition, kept
// all 8 and stored them as the answer, where the request asked for the 4 it
// acted on. Both trial judges said "the table holds all 8 rows" and answered
// yes; nothing Core said asked them to hold each stored row to the request's
// words, and nothing in the second read chose which rows the answer holds.
//
// **What is flagged.** A read (the later one) that
//  - has no condition: none authored, none counted;
//  - kept every item it saw: `itemsSeen` counted and `kept` equal to it;
//  - ran, in the same frame, after a lasting act (`automationStudioNodeActLasts`)
//    that succeeded as a member of a For Each loop (`builtin.control.for-each`);
//  - and that loop walks the rows of an earlier read (the narrower one) whose
//    own conditions rejected rows, so it kept fewer than it saw.
//
// **"The same list" is decided from what Core records, never from words.**
//  - Lineage: the loop's rows come from the narrower read by the graph's own
//    edge into the For Each's `items` port, the port the build wires a
//    `repeat over` into (`../../flow-bootstrap/authoring/draft-routing.ts`).
//  - Read target: both reads are of one node definition, and their authored
//    read parameters (`./read-parameters.ts`) agree, member for member, on
//    everything that says where the rows come from. The members that say what
//    a read keeps and how it stores them are set aside first: its conditions
//    (`where`), its columns (`fields`), `dedupe`, `paginate`, `recordOutput`,
//    and any bound (`min…`, `max…`, `timeout…`). What remains is the domain's
//    own target, compared as values and never read or said: a read whose
//    target holds nothing to compare is never the same list.
//
// **Said in Core's words, as a measurement, never a verdict.** The flag names
// the two reads and the acting steps by node id, with the counts each read
// recorded, and asks that each row the later read stored be checked against
// the request's own words for what the answer holds. No locator, page value or
// row label is carried.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";
import { automationStudioActivityLoops } from "../../activity/loop/index.ts";
import { automationStudioNodeActLasts } from "../../executor/defensive/index.ts";
import type { AutomationStudioResultKeptEveryRow, AutomationStudioResultReadAccount } from "../contracts/index.ts";
import { automationStudioResultReadParameters } from "./read-parameters.ts";

/** The list loop: a section run once for each row of a list (`nodes/control-flow/for-each.ts`). */
const FOR_EACH = "builtin.control.for-each";
/** The port For Each takes its rows on. */
const ITEMS_PORT = "items";
/** Core's own step definitions: none of them acts on a site. */
const CORE_STEP = /^builtin\./u;
/** The read parameters that say what a read keeps and how it stores it, never where its rows come from. */
const KEEPING_KEYS: ReadonlySet<string> = new Set(["where", "fields", "dedupe", "paginate", "recordOutput"]);
/** A bound on a read: how few, how many, how long. */
const BOUND_KEY = /^(min|max|timeout)/u;

/**
 * The flag for each read, aligned with `reads`: undefined for a read it does
 * not hold for. `speaking` is the attempt each read speaks with
 * (`./accounts.ts`), `nodes` the node each was told by.
 */
export function automationStudioResultReadKeptEveryRow(input: {
  reads: readonly AutomationStudioResultReadAccount[];
  nodes: readonly (AutomationStudioFlowNode | undefined)[];
  speaking: readonly AutomationStudioFlowRunActionAttemptRecord[];
  flowNodes: readonly AutomationStudioFlowNode[];
  flowEdges: readonly AutomationStudioFlowEdge[];
  actionAttempts: readonly AutomationStudioFlowRunActionAttemptRecord[];
}): Array<AutomationStudioResultKeptEveryRow | undefined> {
  const loops = automationStudioActivityLoops({ nodes: input.flowNodes, edges: input.flowEdges }, FOR_EACH);
  const byId = new Map(input.flowNodes.map((node) => [node.id, node]));
  const order = new Map(input.actionAttempts.map((attempt, index) => [attempt, index]));
  return input.reads.map((later, index) => {
    const laterNode = input.nodes[index];
    const laterAttempt = input.speaking[index];
    if (!laterNode || !laterAttempt || !keptAllWithNoCondition(later, laterNode)) return undefined;
    const laterAt = order.get(laterAttempt) ?? -1;
    for (const loop of loops) {
      const sources = input.flowEdges.filter((edge) => edge.targetNodeId === loop.repeatId && edge.targetPortId === ITEMS_PORT).map((edge) => edge.sourceNodeId);
      const narrower = input.reads.findIndex((read, at) => at !== index && sources.includes(read.nodeId) && input.speaking[at]?.parentAttemptId === laterAttempt.parentAttemptId);
      const earlier = input.reads[narrower];
      const earlierNode = input.nodes[narrower];
      if (!earlier || !earlierNode || !narrowedByItsConditions(earlier) || !sameTarget(earlierNode, laterNode)) continue;
      // The lasting steps of the loop that acted, in this frame, before the later read spoke.
      const acted = input.actionAttempts.filter((attempt) => loop.members.has(attempt.nodeId) && attempt.parentAttemptId === laterAttempt.parentAttemptId
        && attempt.status === "succeeded" && attempt.skipped === undefined && attempt.stateHeld === undefined && (order.get(attempt) ?? Infinity) < laterAt
        && acts(byId.get(attempt.nodeId)));
      const actedBy = [...new Set(acted.map((attempt) => attempt.nodeId))];
      if (!actedBy.length) continue;
      const flag = { narrowerRead: earlier.nodeId, narrowerSeen: earlier.itemsSeen!, narrowerKept: earlier.kept, actedBy, sameList: "items_edge_and_read_target" as const };
      return { ...flag, said: said(later, flag) };
    }
    return undefined;
  });
}

/** No condition authored or counted, and every item it saw kept. */
function keptAllWithNoCondition(read: AutomationStudioResultReadAccount, node: AutomationStudioFlowNode): boolean {
  const where = automationStudioResultReadParameters(node.parameterValues)?.where;
  if (Array.isArray(where) && where.length) return false;
  if (read.conditions?.length || read.unfiltered) return false;
  return read.itemsSeen !== undefined && read.itemsSeen > 0 && read.kept === read.itemsSeen;
}

/** Its own conditions rejected rows, so it kept fewer than it saw. */
function narrowedByItsConditions(read: AutomationStudioResultReadAccount): boolean {
  const rejected = (read.conditions ?? []).some((condition) => (condition.rejected ?? 0) > 0);
  return rejected && read.itemsSeen !== undefined && read.kept < read.itemsSeen;
}

/** A step of the loop that acts on the site and outlasts its own run: never one of Core's own. */
function acts(node: AutomationStudioFlowNode | undefined): boolean {
  return node !== undefined && !CORE_STEP.test(node.definitionId) && automationStudioNodeActLasts(node);
}

/** One definition, and the same read target: the read parameters less what says what a read keeps (header). Never said. */
function sameTarget(first: AutomationStudioFlowNode, second: AutomationStudioFlowNode): boolean {
  if (first.definitionId !== second.definitionId) return false;
  const one = target(first);
  const two = target(second);
  return one !== undefined && one === two;
}

/** The read's target as a canonical string; undefined where nothing remains to compare. */
function target(node: AutomationStudioFlowNode): string | undefined {
  const parameters = automationStudioResultReadParameters(node.parameterValues);
  if (!parameters) return undefined;
  const kept = Object.entries(parameters).filter(([key]) => !KEEPING_KEYS.has(key) && !BOUND_KEY.test(key));
  return kept.length ? canonical(Object.fromEntries(kept)) : undefined;
}

/** A value as one string whatever order its members were written in. */
function canonical(value: JsonValue | undefined): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

/** Core's sentence for the flag (header): what was measured, then the check. Generic words. */
function said(later: AutomationStudioResultReadAccount, flag: Omit<AutomationStudioResultKeptEveryRow, "said">): string {
  const steps = flag.actedBy.map((id) => `step ${id}`);
  const actors = steps.length === 1 ? steps[0]! : `${steps.slice(0, -1).join(", ")} and ${steps.at(-1)!}`;
  return `Step ${later.nodeId} read the same list as step ${flag.narrowerRead} (the rows ${actors} ran over come from step ${flag.narrowerRead}, and both read one target), after ${actors} ran once for each row step ${flag.narrowerRead} kept. `
    + `Step ${flag.narrowerRead}'s conditions kept ${flag.narrowerKept} of the ${flag.narrowerSeen} items it saw; step ${later.nodeId} has no condition and kept every one of the ${later.kept} items it saw. `
    + `So nothing in step ${later.nodeId} chose which of its rows the answer holds. Check each row step ${later.nodeId} stored, one by one, against the request's own words for what the answer holds: `
    + "a yes names each such row with the request's words that ask for it, and a row those words do not ask for is not one the answer should hold, whether or not the Flow acted on it.";
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
