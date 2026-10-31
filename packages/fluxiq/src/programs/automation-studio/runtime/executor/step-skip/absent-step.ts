import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioTargetFailureProvesUnacted } from "../target-evidence/index.ts";
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
 * **Absent** is a failed attempt whose failure category is `target_not_found`
 * and whose evidence proves it did not act: a contradictory ambiguous or
 * already-settled act must go through effect settlement before any route.
 * `target_ambiguous` is not absent (something matched), and neither is an
 * action that ran and failed; those keep the recovery ladder, as does a step
 * that is not sometimes-present.
 *
 * **Never silently, when the step does an act (r4b F4).** A step passed over
 * here whose trusted contract names a lasting act (`./act-not-done.ts`), or
 * whose legacy words do, is not silently fulfilled: unless the page shows its effect, the run records and says
 * that the act was not done (`../state-routing/decision.ts`, `notDone`).
 */
export function automationStudioAbsentStepSkip(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  attempt: Parameters<typeof automationStudioTargetFailureProvesUnacted>[0]
): AutomationStudioFlowEdge | undefined {
  if (attempt.failure?.category !== "target_not_found" || !automationStudioTargetFailureProvesUnacted(attempt)) return undefined;
  return automationStudioOptionalStepWayOn(flow, node);
}
