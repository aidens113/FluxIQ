import { automationStudioFlowDraftPrecedingProposedStep, automationStudioFlowDraftStepId, type AutomationStudioFlowDraftStepRouting } from "../routing.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftRepeatRefusal } from "./repeat-revalidation.ts";
import type { AutomationStudioFlowDraftShownNumbering } from "./shown-numbering.ts";
import type { AutomationStudioFlowDraftAmendment, AutomationStudioFlowDraftAmendmentRefusal } from "./types.ts";

/**
 * Write one routing statement onto the step it is about, or say why it could
 * not be written (`../routing.ts`).
 *
 * The three things this does and nothing else. Whatever the model left out is
 * filled in from the draft -- a check is the step before, a span is this step
 * alone, a list is the step before -- so the commonest statement is one word.
 * Whatever it wrote as a position is turned into the named step's own id, once,
 * here, so a later reorder cannot make the statement mean a different step. And
 * a statement about a step that is not in the Flow is refused, because routing
 * describes the Flow and a withdrawn step is not in it.
 *
 * Positions are read as the draft was shown (`shown`, `./shown-numbering.ts`).
 * Whether a repeat's steps stand in an order it can run in is not checked here:
 * a later move of the same decision can settle it, so the decision checks it
 * once its moves are done (`./repeat-revalidation.ts`). A repeat that says what
 * the step already says is checked now, since nothing is written for it.
 */
export function automationStudioFlowDraftAmendmentRoute(
  steps: readonly AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep,
  amendment: AutomationStudioFlowDraftAmendment,
  shown: AutomationStudioFlowDraftShownNumbering
): { ok: true } | { ok: false; reason: AutomationStudioFlowDraftAmendmentRefusal["reason"]; over?: number; through?: number } {
  const named = shown.step;
  const before = (): AutomationStudioFlowDraftStep | undefined => automationStudioFlowDraftPrecedingProposedStep(steps, step);
  let routing: AutomationStudioFlowDraftStepRouting;
  if (amendment.change === "optional") routing = { kind: "optional" };
  else if (amendment.change === "only_if") {
    const check = named(amendment.check) ?? before();
    if (!check) return { ok: false, reason: amendment.check === undefined ? "no_step_before_it" : "no_such_step" };
    if (!automationStudioFlowDraftStepIsProposed(check)) return { ok: false, reason: "not_a_kept_step" };
    routing = { kind: "only_if", check: automationStudioFlowDraftStepId(check) };
  } else if (amendment.change === "on_failed") {
    const to = named(amendment.to);
    if (!to) return { ok: false, reason: "no_such_step" };
    if (!automationStudioFlowDraftStepIsProposed(to)) return { ok: false, reason: "not_a_kept_step" };
    if (to === step) return { ok: false, reason: "already_so" };
    routing = { kind: "on_failed", to: automationStudioFlowDraftStepId(to) };
  } else {
    const through = named(amendment.through) ?? step;
    const over = named(amendment.over) ?? before();
    if (!over) return { ok: false, reason: amendment.over === undefined ? "no_step_before_it" : "no_such_step" };
    if (!automationStudioFlowDraftStepIsProposed(through) || !automationStudioFlowDraftStepIsProposed(over)) return { ok: false, reason: "not_a_kept_step" };
    routing = { kind: "repeat", through: automationStudioFlowDraftStepId(through), over: automationStudioFlowDraftStepId(over) };
  }
  if (same(step.routing, routing) && amendment.settings === undefined) {
    // The same repeat sent again where it cannot run is told why, not "already so".
    const refusal = routing.kind === "repeat" ? automationStudioFlowDraftRepeatRefusal(steps, step, routing, amendment, shown) : undefined;
    if (!refusal) return { ok: false, reason: "already_so" };
    return { ok: false, reason: refusal.reason, ...(refusal.over === undefined ? {} : { over: refusal.over }), ...(refusal.through === undefined ? {} : { through: refusal.through }) };
  }
  step.routing = routing;
  if (amendment.settings) step.settings = { ...(step.settings ?? {}), ...amendment.settings };
  return { ok: true };
}

/** Whether a statement says exactly what the step already said. */
function same(left: AutomationStudioFlowDraftStepRouting | undefined, right: AutomationStudioFlowDraftStepRouting): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right);
}
