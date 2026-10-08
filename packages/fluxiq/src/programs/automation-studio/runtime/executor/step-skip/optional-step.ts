import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import { chooseAutomationStudioEdge } from "../graph-navigation.ts";

/** The node a build joins an optional step's two ways out at (`flow-bootstrap/authoring/draft-routing.ts`). */
const MERGE_DEFINITION_ID = "builtin.control.merge";

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
 *   step's `success` edge also enters. The way on is that `failed` edge.
 * - `metadata.sometimesPresent === true`. The way on is that same `failed`
 *   edge when the step has the shape, else its `success` edge.
 */
export function automationStudioOptionalStepWayOn(flow: Pick<AutomationStudioFlowDocument, "nodes" | "edges">, node: AutomationStudioFlowNode): AutomationStudioFlowEdge | undefined {
  const success = chooseAutomationStudioEdge(flow, node.id, "success", node.definitionId);
  const failed = flow.edges.find((edge) => edge.sourceNodeId === node.id && edge.sourcePortId === "failed");
  const joined = failed !== undefined && success !== null && failed.targetNodeId === success.targetNodeId
    && flow.nodes.find((candidate) => candidate.id === failed.targetNodeId)?.definitionId === MERGE_DEFINITION_ID;
  if (joined) return failed;
  if (node.metadata?.sometimesPresent === true) return success ?? undefined;
  return undefined;
}

