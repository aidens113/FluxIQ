// Whether a failed attempt lost its target without acting (t786, design D2):
// the one predicate both a graph run and a node run outside one ask before a
// stale target is found again.

import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { AUTOMATION_STUDIO_TARGET_GONE_CODE } from "./gone-code.ts";

/**
 * A host code naming a target that went stale, came loose from the page, or was
 * renumbered by a reload: `web.handle.stale`, `web.handle.renumbered_by_reload`,
 * `x.target_detached`. The word stands as its own segment of the code.
 */
const STALE_TARGET_CODE = /(?:^|[._:-])(?:stale|detached|renumbered)(?:$|[._:-])/u;

/**
 * Whether `attempt` failed on its target and its act never happened, so the
 * item it was for may be found again from the step that found it:
 *
 * - it failed on its target: category `target_not_found` or `target_ambiguous`,
 *   stage `target_resolution`, or a code naming a stale, detached or
 *   renumbered target;
 * - the act never happened: the failure does not say its effect is
 *   `ambiguous`, no effect check answered `landed` or `unknown`, the attempt
 *   is not settled as done (`stateHeld`) or uncertain, and the run's
 *   completed-act ledger does not hold the act (`actCompleted`).
 *
 * An item already found gone is never looked for again.
 */
export function automationStudioStaleTargetFailure(attempt: AutomationStudioNodeAttemptTrace, run: { actCompleted?: boolean } = {}): boolean {
  const failure = attempt.failure;
  if (attempt.status !== "failed" || !failure || failure.code === AUTOMATION_STUDIO_TARGET_GONE_CODE) return false;
  const lostTarget = failure.category === "target_not_found" || failure.category === "target_ambiguous" || failure.stage === "target_resolution" || STALE_TARGET_CODE.test(failure.code);
  if (!lostTarget || failure.effect === "ambiguous") return false;
  if (attempt.effectCheck && attempt.effectCheck.result !== "not_landed") return false;
  if (attempt.stateHeld || attempt.skipped || attempt.fault?.actUncertain) return false;
  return run.actCompleted !== true;
}
