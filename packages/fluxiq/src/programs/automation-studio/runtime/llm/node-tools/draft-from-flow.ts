// Reading a Flow that already exists back into the draft a build accrues.
//
// **The failure this closes.** A run that did everything it was told and still
// answered the wrong question is not a broken step; it is a Flow missing one.
// The loop that can find the missing step is the build's own -- explore the
// live page, run real nodes, keep what worked -- and that loop had no way to
// start from a Flow. It always started from nothing, so the only thing it could
// produce was a replacement, and a replacement throws away the steps that were
// right along with the one that was wrong.
//
// So this is the other direction of `./draft-step.ts`. That module writes one
// draft step down as a line of a Flow script; this one reads one node of a Flow
// back as a draft step. Together they make the round trip that lets the build
// loop be handed "here is your Flow as a draft, amend it" -- which is the whole
// of what a wrong answer needs.
//
// **A seeded step is a step the Flow contains, not one the loop took.** That is
// the one place this stretches the draft's contract, and it is stated on every
// seeded step rather than inferred: `proposes` is written `true` because the
// node is already part of the result, and nothing claims the step ran in this
// session. Persisted consequence declarations are retained exactly, including
// an explicit empty declaration; missing declarations remain missing. An
// unchanged declared saved configuration with a captured start may be scheduled
// for a fresh full test. That private correspondence never becomes `ranWith`,
// `replay` or evidence that an action already happened.
//
// **Where a node started is kept beside the steps, never on them.** A rerun of
// a seeded step used to run wherever the last call left the page: live run
// `run-muqk713g-d08ad3dc` reran the Flow's list read on results page 5, where
// the refuted run's pagination had stopped, and read 11 rows unfiltered. The
// run being repaired did watch each node start, and what its host captured
// there is read off the run (`./run-start-pages.ts`) and handed in as
// `startPages`. It comes back as `startedOnByStepId` for a rerun to put the
// page back to (`./step-place.ts`). Not as `replay.from`: that field is read as
// "this step can be run again" by the dry run's gate and by every reader that
// compares where steps acted (`flow-draft/verify-only.ts`,
// `flow-bootstrap/instructed-acts/`). A separate scheduling candidate retains
// that captured token for the new test, without inventing performed proof.
//
// **Order is the Flow's own.** The assembler numbers a plan's nodes by the
// order of the steps it is given, so the seed walks the graph from the node
// nothing enters and follows the edges. A node the walk cannot reach is
// appended afterwards in document order rather than dropped: a step that exists
// and is missing from the draft is exactly the failure the draft was built to
// make impossible.
//
// **Routing is the Flow's own too.** A step the Flow runs only when it can --
// the store's one-time "Continue shopping" check, a consent banner -- is a node
// whose `failed` and `success` both lead into the same Merge. The seed used to
// read that node back as a plain step, so the re-authored Flow ran it
// unconditionally and stopped on it the first time the page did not show it
// (`run-munq5s8x-6d620cdf`, s4). So a node wired that way is seeded `optional`,
// exactly as the build's own draft said it, and the Merge it joins at is kept
// as the step after it, which `flow-bootstrap/authoring/draft-routing.ts`
// joins at rather than adding a second.
//
// **A loop is read back as the repeat it was written from (C4, t269).** The
// seed used to read a For Each back as one more plain step, with nothing
// feeding its required `items` and no span to walk, so a repair that left a
// row loop untouched was refused at completion
// (`bootstrap.required_input_unconnected`) before any fresh test: it never
// re-read the list or wrote a single row. A loop in the assembler's own shape
// (`./seeded-loops.ts`) is now seeded as its list step, then its body with the
// repeat statement on the first body step; the For Each and the Merges that
// only frame it are left for the assembler to derive again. A do-while (S2,
// t283) is read back the same way: its body, with `repeat through <last>
// while <last>` (and `most` when the Repeat's is not the default) on the
// first body step, and the Repeat and both Merges left as framing. The body keeps
// its parameters byte for byte: a `$state item.*` binding already names the
// pass's row, and the fresh test resolves it against the row it reads.
//
// **An earlier node's output is read back as the step that node became (P5,
// t270).** A saved Flow names it by the plan key its node was assembled under,
// `$node.<key>.<output>`, kept on the node as `metadata.bootstrapSymbolicKey`
// (`../../executor/node-inputs.ts`). That key names no node of the plan the
// re-seeded draft is assembled into, so it is rewritten to the seeded step's
// own id, `$step.<seed id>.<output>`, which assembly names again by the key
// that step's node then takes. A key no node carries, two nodes carry, or
// whose node seeds no step is left as written, and assembly refuses it
// (`flow_draft.step_binding_source_missing`) rather than read whatever node
// now holds that key.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationNodeOutputReference, rewriteAutomationNodeStatePaths } from "../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepRouting } from "../../flow-draft/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT, automationStudioFlowDraftStepId, automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftScheduleCandidate } from "../../flow-draft/scheduled-candidate/index.ts";
// A type only, so nothing is imported back out of the directory this one is read by.
import type { AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID } from "./run-node.ts";
import { automationStudioFlowDraftSeededLoops } from "./seeded-loops.ts";

/**
 * The control nodes a build never authors and a seed never carries.
 *
 * `authoring/assemble.ts` derives entry and exit from the order of the steps,
 * so a plan holds neither; a Flow that was drawn by hand may, and seeding one
 * as a step would ask the model to keep a node the assembler will not emit.
 */
const DERIVED_CONTROL_NODES = new Set(["builtin.control.start", "builtin.control.end"]);

/** The join a Flow's optional step leads both of its ways into. */
const MERGE_NODE_ID = "builtin.control.merge";

/**
 * The nodes routing derives around the steps it is given -- a join, a loop --
 * which hold plan keys of their own between the steps' nodes (`flow-bootstrap/
 * authoring/draft-routing.ts`).
 */
const ROUTING_NODES = new Set([MERGE_NODE_ID, "builtin.control.for-each", "builtin.control.repeat"]);

/**
 * Where a seeded step's own name starts, kept clear of the `d<n>` the loop
 * mints. A step so named is read as carried by the draft's own test
 * (`../../flow-draft/carried-step/`), the one every reader of a carried step
 * asks (t274-c4); it is re-exported here for those that ask it of this module.
 */
const SEED_STEP_ID_PREFIX = "f";
export { automationStudioFlowDraftStepCarried } from "../../flow-draft/carried-step/index.ts";

/** Where a run-node call keeps the node it names and that node's own parameters. */
const NODE_KEY = "node";
const PARAMETERS_KEY = "parameters";

/**
 * A Flow read back as a draft: the steps, and which node each one stands for.
 *
 * The map is the half that makes this an edit rather than a replacement. A
 * draft step carries no node id -- it is a record of an action, and an action
 * has no id in a graph -- so the correspondence is kept beside the steps and
 * travels with them to whoever materialises the amended draft
 * (`automationStudioFlowDraftPlanNodeIds`).
 */
export type AutomationStudioFlowDraftFlowSeed = {
  steps: AutomationStudioFlowDraftStep[];
  /** The existing node each seeded step stands for, by that step's own id. */
  nodeIdByStepId: Record<string, string>;
  /**
   * Where each seeded step's node started in the run being repaired, by that
   * step's own id: the host's token, carried unread, for the steps whose node
   * has one. Empty when no run was handed in or it captured none.
   */
  startedOnByStepId: Record<string, JsonObject>;
};

/**
 * One Flow's nodes as the draft a build would have accrued if it had built
 * them, in the order the Flow runs them.
 *
 * A Flow with no node the assembler would emit answers with no steps, which is
 * the honest answer: there is nothing to extend and the caller should build
 * rather than extend.
 */
export function automationStudioFlowDraftSeedFromFlow(input: {
  nodes: readonly AutomationStudioFlowNode[];
  edges: readonly AutomationStudioFlowEdge[];
  /** Where each node started in the run being repaired, by node id (`./run-start-pages.ts`). */
  startPages?: Readonly<Record<string, JsonObject>> | undefined;
}): AutomationStudioFlowDraftFlowSeed {
  const authored = input.nodes.filter((node) => !DERIVED_CONTROL_NODES.has(node.definitionId));
  const loops = automationStudioFlowDraftSeededLoops(authored, input.edges);
  const framing = new Set(loops.flatMap((loop) => loop.framing));
  const ordered = orderedNodes(authored, input.edges).filter((node) => !framing.has(node.id));
  const optional = optionalNodeIds(authored, input.edges);
  const stepIdOf = new Map(ordered.map((node, index) => [node.id, `${SEED_STEP_ID_PREFIX}${index + 1}`]));
  const stepOutputPath = stepOutputPaths(input.nodes, stepIdOf);
  const repeats = new Map(loops.map((loop): [string, AutomationStudioFlowDraftStepRouting] => {
    const through = stepIdOf.get(loop.body.at(-1)!)!;
    // A do-while repeats while its own last step succeeds (S2, t283).
    return [loop.body[0]!, loop.over === undefined
      ? { kind: "repeat", through, while: through, ...(loop.most === undefined ? {} : { most: loop.most }) }
      : { kind: "repeat", through, over: stepIdOf.get(loop.over)! }];
  }));
  const steps: AutomationStudioFlowDraftStep[] = [];
  const nodeIdByStepId: Record<string, string> = {};
  const startedOnByStepId: Record<string, JsonObject> = {};
  for (const node of ordered) {
    const id = stepIdOf.get(node.id)!;
    const repeat = repeats.get(node.id);
    const parameters: JsonObject = node.parameterValues ? rewriteAutomationNodeStatePaths(structuredClone(node.parameterValues), stepOutputPath) : {};
    steps.push({
      position: steps.length + 1,
      id,
      // The seed is what the loop starts from, so it belongs to no iteration of
      // it. Iteration 0 is what the loop's own first, unpaid observation uses.
      iteration: 0,
      actionId: node.definitionId,
      toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID,
      input: { [NODE_KEY]: node.definitionId, [PARAMETERS_KEY]: parameters, ...(Array.isArray(node.metadata?.declaredConsequences) ? { consequences: structuredClone(node.metadata.declaredConsequences) } : {}) },
      // What the node would do if it ran. It is not a claim that it ran here:
      // `proposes` below is what says the result contains this step, and it is
      // written rather than read off the effect for exactly that reason.
      effect: "mutate",
      proposes: true,
      disposition: "kept",
      // What the Flow already says about when this node runs. Without it the
      // re-authored Flow would run it unconditionally.
      ...(repeat ? { routing: repeat } : optional.has(node.id) ? { routing: { kind: "optional" as const } } : {}),
      // What state routing recorded on the node, carried unread (see below).
      ...routeSignaturesOf(node)
    });
    nodeIdByStepId[id] = node.id;
    const startedOn = input.startPages?.[node.id];
    if (startedOn) startedOnByStepId[id] = structuredClone(startedOn);
    automationStudioFlowDraftScheduleCandidate(steps.at(-1)!, node.id, startedOn);
  }
  return { steps, nodeIdByStepId, startedOnByStepId };
}

/**
 * Which existing node each node of an assembled plan is, for the steps that
 * came from one.
 *
 * The assembler names a plan's nodes `s1`, `s2`, ... in the order it emits
 * them (`authoring/assemble.ts`, `buildSubflow`): each proposed step's node,
 * in order, with the joins and loops routing derived between them
 * (`authoring/draft-routing.ts`). Given the `plan`, the steps are read against
 * its nodes in that order, a derived node skipped where it stands; without
 * it, every key is taken to be a step's, which is only right for a draft that
 * routes nothing. A repaired row loop showed why it matters: its head Merge
 * took `s2`, so the untouched loop body's id went to the Merge and the body
 * was minted a new one. A key this answers for names a node that already
 * exists and must keep its id; a key it does not answer for is a node the
 * build added, and minting an id for that one is right.
 *
 * A step the model dropped, reordered or replaced simply stops being at the
 * position it was: dropping is how the model says the Flow should no longer
 * contain that node, and it must not leave its id claimed by whatever moved up.
 */
export function automationStudioFlowDraftPlanNodeIds(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  nodeIdByStepId: Readonly<Record<string, string>>;
  /** The plan these steps were assembled into, whose derived nodes hold keys too. */
  plan?: AutomationStudioFlowBootstrapPlan | undefined;
}): Record<string, string> {
  const nodeIdByKey: Record<string, string> = {};
  const proposed = input.steps.filter(automationStudioFlowDraftStepIsProposed);
  const keys = planKeys(proposed, input.plan);
  for (const [index, step] of proposed.entries()) {
    const key = keys[index];
    // A rerun that took a carried step's place stands for that step's node (t244).
    const nodeId = input.nodeIdByStepId[step.standsFor ?? automationStudioFlowDraftStepId(step)];
    if (key !== undefined && nodeId !== undefined) nodeIdByKey[key] = nodeId;
  }
  return nodeIdByKey;
}

/**
 * The plan key of each proposed step's node, in step order. A step whose node
 * is not where the plan's order puts it ends the reading: it and every step
 * after it answer nothing, and are minted ids rather than handed another
 * node's.
 */
function planKeys(
  proposed: readonly AutomationStudioFlowDraftStep[],
  plan: AutomationStudioFlowBootstrapPlan | undefined
): (string | undefined)[] {
  if (!plan) return proposed.map((_, index) => `s${index + 1}`);
  const nodes = plan.subflows[0]?.nodes ?? [];
  const keys: string[] = [];
  let at = 0;
  for (const step of proposed) {
    while (at < nodes.length && nodes[at]!.definitionId !== step.actionId && ROUTING_NODES.has(nodes[at]!.definitionId)) at += 1;
    if (nodes[at]?.definitionId !== step.actionId) break;
    keys.push(nodes[at]!.key);
    at += 1;
  }
  return keys;
}

/** Where a node a build wrote keeps the plan key it was assembled under (`flow-bootstrap/adaptation.ts`). */
const SYMBOLIC_KEY_METADATA = "bootstrapSymbolicKey";

/**
 * The rewrite of a saved `$node.<key>.<rest>` reference to the seeded step its
 * node became, `$step.<seed id>.<rest>` (header). The key is matched against
 * every node of the Flow, as the executor matches it; nothing answers for a
 * key no node or several nodes carry, or whose node seeds no step.
 */
function stepOutputPaths(nodes: readonly AutomationStudioFlowNode[], stepIdOf: ReadonlyMap<string, string>): (path: string) => string | undefined {
  const nodeIdByKey = new Map<string, string | null>();
  for (const node of nodes) {
    const key = node.metadata?.[SYMBOLIC_KEY_METADATA];
    if (typeof key === "string" && key) nodeIdByKey.set(key, nodeIdByKey.has(key) ? null : node.id);
  }
  return (path) => {
    const reference = automationNodeOutputReference(path);
    const nodeId = reference ? nodeIdByKey.get(reference.key) : undefined;
    const stepId = nodeId ? stepIdOf.get(nodeId) : undefined;
    return reference && stepId ? `${AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT}.${stepId}.${reference.rest}` : undefined;
  };
}

/** Where a node keeps what state routing recorded on it (`route-state/`, t243). */
const ROUTE_SIGNATURES_KEY = "routeSignatures";

/**
 * What state routing recorded on a node, for its seeded step, or nothing.
 *
 * **Why (supervisor, t243 -> t244).** A node built by the build carries
 * `metadata.routeSignatures`: the pages it ran between and what it did, as the
 * domain signed them, which is what lets a run route by state to that node. A
 * re-seed that dropped them left a re-authored or extended Flow routing by the
 * ladder alone. A step rerun in the build records fresh ones; an unchanged
 * carried step is run by the test as saved (t274-c4) and records none, so these
 * are what stands in for it. Carried unread: only `route-state/` knows what a signature holds, and it
 * reads them where the Flow is written. Anything but a non-empty object is not
 * signatures, and nothing is carried.
 */
function routeSignaturesOf(node: AutomationStudioFlowNode): { routeSignatures?: JsonObject } {
  const value = node.metadata?.[ROUTE_SIGNATURES_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length) return {};
  return { routeSignatures: structuredClone(value) };
}

/**
 * The nodes the Flow carries on past when they fail: both the node's `failed`
 * and its `success` lead into the same Merge, which is the shape an `optional`
 * step is assembled into (`flow-bootstrap/authoring/draft-routing.ts`).
 *
 * Both ways are required. A node whose failure alone goes to a Merge is a check
 * guarding the step it falls into, or a step recovering into another, and
 * reading either as optional would run a step the Flow means to skip.
 */
function optionalNodeIds(
  nodes: readonly AutomationStudioFlowNode[],
  edges: readonly AutomationStudioFlowEdge[]
): ReadonlySet<string> {
  const merges = new Set(nodes.filter((node) => node.definitionId === MERGE_NODE_ID).map((node) => node.id));
  const leadsInto = (source: string, port: string, merge: string): boolean => edges.some((edge) =>
    edge.sourceNodeId === source && (edge.sourcePortId ?? "success") === port && edge.targetNodeId === merge);
  const optional = new Set<string>();
  for (const edge of edges) {
    if (edge.sourcePortId !== "failed" || !merges.has(edge.targetNodeId) || merges.has(edge.sourceNodeId)) continue;
    if (leadsInto(edge.sourceNodeId, "success", edge.targetNodeId)) optional.add(edge.sourceNodeId);
  }
  return optional;
}

/**
 * The nodes in the order the Flow runs them: from whatever nothing enters,
 * along the edges, then anything the walk never reached, in document order.
 */
function orderedNodes(
  nodes: readonly AutomationStudioFlowNode[],
  edges: readonly AutomationStudioFlowEdge[]
): AutomationStudioFlowNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  const entered = new Set<string>();
  // What runs once a loop is done comes after the loop's body, whichever edge
  // the document lists first: a body walked after what follows the loop is not
  // the order the Flow runs, and not a span a draft can repeat.
  const done = (edge: AutomationStudioFlowEdge): number => Number(edge.sourcePortId === "done");
  const doneLast = [...edges].sort((left, right) => done(left) - done(right));
  for (const edge of doneLast) {
    if (!byId.has(edge.sourceNodeId) || !byId.has(edge.targetNodeId)) continue;
    outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge.targetNodeId]);
    entered.add(edge.targetNodeId);
  }
  const ordered: AutomationStudioFlowNode[] = [];
  const seen = new Set<string>();
  const walk = (nodeId: string): void => {
    if (seen.has(nodeId)) return;
    const node = byId.get(nodeId);
    if (!node) return;
    seen.add(nodeId);
    ordered.push(node);
    for (const next of outgoing.get(nodeId) ?? []) walk(next);
  };
  for (const node of nodes) {
    if (!entered.has(node.id)) walk(node.id);
  }
  for (const node of nodes) walk(node.id);
  return ordered;
}

