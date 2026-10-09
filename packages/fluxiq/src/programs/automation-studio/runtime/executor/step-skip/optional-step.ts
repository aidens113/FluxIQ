import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import { chooseAutomationStudioEdge } from "../graph-navigation.ts";

/** The node a build joins an optional step's two ways out at (`flow-bootstrap/authoring/draft-routing.ts`). */
const MERGE_DEFINITION_ID = "builtin.control.merge";

/**
 * The most steps a guarded group's success path may run before it reaches the
 * join. A guarded group is a handful of steps (a wait, an acknowledgement); the
 * bound keeps the walk finite on any graph, a cycle or a long chain included.
 */
const MAX_GUARDED_STEPS = 32;

/**
 * The way on past an optional step, or nothing when the node is not one.
 *
 * An optional step -- a popup, a banner, a consent prompt, a notice, a wait
 * marked `optional: yes` -- is only sometimes there to be done, so the run
 * going on past it is what the Flow says to do, not a recovery. It is the one
 * rule every execution path reads: the absent-step skip (`absent-step.ts`),
 * the recovery ladder's offer (`../recovery-ladder.ts`) and what the recovery
 * budgets count (`../recovery-budget.ts`), so a trial and a playback treat an
 * optional step the same way whatever stopped it (t371).
 *
 * **Optional** is either of:
 * - the optional shape a build writes: a `failed` edge into a Merge that the
 *   step's `success` path also reaches. The `success` edge either enters that
 *   Merge itself (a lone optional step) or runs a guarded group first -- the
 *   steps written `only after:` the optional one, such as a wait after a
 *   site's slow-down notice is closed -- through steps that do not branch
 *   (`flow-bootstrap/script-statements/guarded-steps.ts`, t378). The way on is
 *   that `failed` edge, straight to the join, past the guarded steps.
 * - `metadata.sometimesPresent === true`. The way on is that same `failed`
 *   edge when the step has the shape, else its `success` edge.
 */
export function automationStudioOptionalStepWayOn(flow: Pick<AutomationStudioFlowDocument, "nodes" | "edges">, node: AutomationStudioFlowNode): AutomationStudioFlowEdge | undefined {
  const success = chooseAutomationStudioEdge(flow, node.id, "success", node.definitionId);
  const failed = flow.edges.find((edge) => edge.sourceNodeId === node.id && edge.sourcePortId === "failed");
  const joined = failed !== undefined && success !== null
    && flow.nodes.find((candidate) => candidate.id === failed.targetNodeId)?.definitionId === MERGE_DEFINITION_ID
    && successPathReaches(flow, success.targetNodeId, failed.targetNodeId);
  if (joined) return failed;
  if (node.metadata?.sometimesPresent === true) return success ?? undefined;
  return undefined;
}

/**
 * Whether the run, going on from `from` by success alone, reaches `join`
 * within `MAX_GUARDED_STEPS` steps. Each step on the way must not branch: it
 * has a `success` way on and no `failed` route of its own, so a node that
 * leaves by any other route (a loop's `body` and `done`, a condition's
 * branches) or that may fail elsewhere ends the walk. A step revisited ends it
 * as well.
 */
function successPathReaches(flow: Pick<AutomationStudioFlowDocument, "nodes" | "edges">, from: string, join: string): boolean {
  const seen = new Set<string>();
  let at = from;
  for (let steps = 0; steps <= MAX_GUARDED_STEPS; steps += 1) {
    if (at === join) return true;
    if (seen.has(at)) return false;
    seen.add(at);
    const step = flow.nodes.find((candidate) => candidate.id === at);
    if (!step || flow.edges.some((edge) => edge.sourceNodeId === at && edge.sourcePortId === "failed")) return false;
    const next = chooseAutomationStudioEdge(flow, at, "success", step.definitionId);
    if (!next) return false;
    at = next.targetNodeId;
  }
  return false;
}
