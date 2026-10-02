import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { chooseAutomationStudioEdge } from "../graph-navigation.ts";

/** The node a build joins an optional step's two ways out at (`flow-bootstrap/authoring/draft-routing.ts`). */
const MERGE_DEFINITION_ID = "builtin.control.merge";

/**
 * The way on past a sometimes-present step -- a popup, a banner, a consent
 * prompt -- whose target the run observed was not there, or nothing when the
 * step is not one or its target was not observed absent.
 *
 * A step like that is only sometimes on the page, so finding it gone is the
 * page's state, not the step failing: the run skips it and goes on, with no
 * retry, no recovery and nothing recorded as a fault. Retrying it is what
 * spent ~24 s a run on a dismissal that was never coming back (t174/w60).
 *
 * **Sometimes-present** is either of:
 * - the optional shape a build writes: a `failed` edge into a Merge that the
 *   step's `success` edge also enters. The way on is that `failed` edge.
 * - `metadata.sometimesPresent === true`. The way on is that same `failed`
 *   edge when the step has the shape, else its `success` edge.
 *
 * **Absent** is a failed attempt whose failure category is `target_not_found`:
 * the host looked at the page, after its own wait, and found no such target.
 * `target_ambiguous` is not absent (something matched), and neither is an
 * action that ran and failed; those keep the recovery ladder, as does a step
 * that is not sometimes-present.
 */
export function automationStudioAbsentStepSkip(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  attempt: Pick<AutomationStudioNodeAttemptTrace, "status" | "failure">
): AutomationStudioFlowEdge | undefined {
  if (attempt.status !== "failed" || attempt.failure?.category !== "target_not_found") return undefined;
  const success = chooseAutomationStudioEdge(flow, node.id, "success", node.definitionId);
  const failed = flow.edges.find((edge) => edge.sourceNodeId === node.id && edge.sourcePortId === "failed");
  const joined = failed !== undefined && success !== null && failed.targetNodeId === success.targetNodeId
    && flow.nodes.find((candidate) => candidate.id === failed.targetNodeId)?.definitionId === MERGE_DEFINITION_ID;
  if (joined) return failed;
  if (node.metadata?.sometimesPresent === true) return success ?? undefined;
  return undefined;
}
