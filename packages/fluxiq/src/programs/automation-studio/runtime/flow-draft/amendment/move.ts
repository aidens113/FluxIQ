import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

/**
 * Move one step to the place the step `to` holds -- before it when the step
 * moves up, after it when it moves down -- or answer `false` when there is no
 * such step or the step is already there with nothing else to change.
 *
 * `to` is the step the draft shown numbered at the position the model wrote
 * (`./shown-numbering.ts`), so a move means the same whatever moved before it
 * in the decision; for a single move it is exactly "to that position". The
 * draft is renumbered as it moves, so the draft shown next is numbered 1..n in
 * the order the steps then stand; no later amendment of the decision reads
 * those numbers. Settings ride along, since "put this last and give it a
 * longer wait" is one thought.
 *
 * A move leaves every step from where it begins untested (`replayed` cleared,
 * `../step.ts`): each of them now runs after other steps than the test ran it
 * after. Live run `run-musq0b1m-0472cfa0` (Cause 6) moved an `unreproducible`
 * Space Grey press after the listing click that brings it onto its page, and
 * the draft went on showing it `unreproducible` -- the model reordered four
 * times. The steps before the move ran after exactly what they run after now,
 * so their marks stand.
 */
export function automationStudioFlowDraftAmendmentMove(
  steps: AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep,
  to: AutomationStudioFlowDraftStep | undefined,
  settings: JsonObject | undefined
): boolean {
  if (!to) return false;
  if (to === step && settings === undefined) return false;
  const from = steps.indexOf(step);
  if (from < 0 || !steps.includes(to)) return false;
  if (to !== step) {
    const down = from < steps.indexOf(to);
    steps.splice(from, 1);
    steps.splice(steps.indexOf(to) + (down ? 1 : 0), 0, step);
    const at = steps.indexOf(step);
    steps.forEach((entry, index) => { entry.position = index + 1; });
    for (const moved of steps.slice(Math.min(from, at))) delete moved.replayed;
  }
  if (settings) step.settings = { ...(step.settings ?? {}), ...settings };
  return true;
}
