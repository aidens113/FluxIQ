import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioOptionalStepWayOn } from "./optional-step.ts";

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
 * **Sometimes-present** is an optional step, and the way on is that step's way
 * on (`optional-step.ts`). An optional step that failed some other way -- it
 * timed out, or its target was not actionable -- is not skipped here: it keeps
 * its retries, and then the recovery ladder takes the same way on, spending no
 * recovery or reroute budget (t371).
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
  return automationStudioOptionalStepWayOn(flow, node);
}
