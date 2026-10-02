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
// session. Two consequences follow and both are deliberate.
//
//   - No `replay`, so an extended draft is not dry-run gated
//     (`flow-draft/dry-run.ts` gates only a draft whose proposed steps all say
//     they can be run again). Core cannot say how to put a page back the way a
//     node it never watched found it, and inventing one would gate the build on
//     a claim nobody made.
//   - No consequence declaration. A step that says nothing and a step that says
//     it causes nothing lasting are different answers
//     (`harness-options/plan-step-consequences.ts`), and Core does not get to
//     make the second one on the model's behalf for a node it did not author.
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

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepId, automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID } from "./run-node.ts";

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

/** Where a seeded step's own name starts, kept clear of the `d<n>` the loop mints. */
const SEED_STEP_ID_PREFIX = "f";
const SEED_STEP_ID = new RegExp(`^${SEED_STEP_ID_PREFIX}[1-9][0-9]*$`, "u");

/**
 * Whether a draft step was carried from an earlier Flow (seeded here as
 * `f<n>`) rather than run in this build: a re-authored Flow is judged on its
 * own test, never on what the earlier Flow's steps claimed
 * (`result-verification/build-test/`).
 */
export function automationStudioFlowDraftStepCarried(step: { id?: string | undefined }): boolean {
  return typeof step.id === "string" && SEED_STEP_ID.test(step.id);
}

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
}): AutomationStudioFlowDraftFlowSeed {
  const authored = input.nodes.filter((node) => !DERIVED_CONTROL_NODES.has(node.definitionId));
  const ordered = orderedNodes(authored, input.edges);
  const optional = optionalNodeIds(authored, input.edges);
  const steps: AutomationStudioFlowDraftStep[] = [];
  const nodeIdByStepId: Record<string, string> = {};
  for (const node of ordered) {
    const id = `${SEED_STEP_ID_PREFIX}${steps.length + 1}`;
    const parameters: JsonObject = node.parameterValues ? structuredClone(node.parameterValues) : {};
    steps.push({
      position: steps.length + 1,
      id,
      // The seed is what the loop starts from, so it belongs to no iteration of
      // it. Iteration 0 is what the loop's own first, unpaid observation uses.
      iteration: 0,
      actionId: node.definitionId,
      toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID,
      input: { [NODE_KEY]: node.definitionId, [PARAMETERS_KEY]: parameters },
      // What the node would do if it ran. It is not a claim that it ran here:
      // `proposes` below is what says the result contains this step, and it is
      // written rather than read off the effect for exactly that reason.
      effect: "mutate",
      proposes: true,
      disposition: "kept",
      // What the Flow already says about when this node runs. Without it the
      // re-authored Flow would run it unconditionally.
      ...(optional.has(node.id) ? { routing: { kind: "optional" as const } } : {})
    });
    nodeIdByStepId[id] = node.id;
  }
  return { steps, nodeIdByStepId };
}

/**
 * Which existing node each node of an assembled plan is, for the steps that
 * came from one.
 *
 * The assembler names a plan's nodes `s1`, `s2`, ... in the order of the
 * proposed steps it was given (`authoring/assemble.ts`, `buildSubflow`), so the
 * correspondence is positional and is read back the same way. A key this
 * answers for names a node that already exists and must keep its id; a key it
 * does not answer for is a node the build added, and minting an id for that one
 * is right.
 *
 * A step the model dropped, reordered or replaced simply stops being at the
 * position it was: dropping is how the model says the Flow should no longer
 * contain that node, and it must not leave its id claimed by whatever moved up.
 */
export function automationStudioFlowDraftPlanNodeIds(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  nodeIdByStepId: Readonly<Record<string, string>>;
}): Record<string, string> {
  const nodeIdByKey: Record<string, string> = {};
  const proposed = input.steps.filter(automationStudioFlowDraftStepIsProposed);
  for (const [index, step] of proposed.entries()) {
    const nodeId = input.nodeIdByStepId[automationStudioFlowDraftStepId(step)];
    if (nodeId !== undefined) nodeIdByKey[`s${index + 1}`] = nodeId;
  }
  return nodeIdByKey;
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
  for (const edge of edges) {
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
