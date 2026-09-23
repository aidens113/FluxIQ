// How the model edits the draft, instead of composing a final answer.
//
// The failure this replaces. A completed result the caller refuses used to be
// fed back as issue codes alone, and the model was asked again with its own
// previous answer absent from the request -- so the only thing it could do was
// write the whole answer again from memory. A live build authored the right
// acting steps, had each one refused for a handle it had invented, and
// completed again with those steps deleted and the wrong answer in their
// place. Re-emission is not a correction; it is a second first draft.
//
// An amendment names one step and says one thing about it, so a correction
// costs the model a sentence rather than the whole result. Nine changes: five
// about whether a step is in the Flow at all, and four about when it runs.
//
//   drop         -- this step should not be in the result at all.
//   exploratory  -- I did this to look around; do not keep it.
//   keep         -- undo any of the above, and make the step unconditional.
//   reorder      -- this step belongs at another position.
//   rerun        -- do it again with a corrected argument, replacing it.
//
//   optional     -- the Flow carries on when this step fails.
//   only_if      -- run this only when the step before it succeeded.
//   on_failed    -- when this fails, run `to` instead, then carry on.
//   repeat       -- do this through `through`, once per row `over` produced,
//                   or while `over` keeps holding.
//
// The second four are `./routing.ts`, and they exist because a draft that can
// only say "and then" produces a Flow that always does everything: a build that
// dismissed a consent banner shipped a Flow that fails on every page showing
// none. Each is one word about one step, names other steps by the numbers the
// model already reads, and leaves every node, port and edge for Core to derive.
// A routing word with nothing beside it means the commonest thing -- the check
// is the step before, the span is this step alone -- so the model writes a
// field only when it means something other than that.
//
// `settings` rides alongside any of them, because "keep this step, but with
// this wait condition" is one thought and should not cost two calls.
//
// `rerun` is the one amendment this module does not carry out. It has to
// *execute* something, and executing is the loop's job rather than the draft's:
// the loop runs the step's action again with the new argument, appends what came
// back as a new step, and drops the old one. It is declared here because it is an
// edit to the draft in the model's eyes and has to be written in the same grammar
// as the others -- a model that must choose between "edit the draft" and "call a
// tool" to correct one parameter is choosing between two vocabularies again.
//
// **One shape, two required fields.** The model is asked for the smallest thing
// that can carry the meaning: a step number and a word. Everything else about
// the step -- what it did, what it was given, what state it produced -- Core
// already holds and never asks for again.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";
import { automationStudioFlowDraftStepIsProposed } from "./step.ts";
import type { AutomationStudioFlowDraftStepRouting } from "./routing.ts";
import { automationStudioFlowDraftPrecedingProposedStep, automationStudioFlowDraftStepId } from "./routing.ts";

/** Every change one amendment may ask for. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES = ["drop", "exploratory", "keep", "reorder", "rerun", "optional", "only_if", "on_failed", "repeat"] as const;

export type AutomationStudioFlowDraftAmendmentChange = (typeof AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES)[number];

/** The four changes that say when a step runs rather than whether it is kept. */
const ROUTING_CHANGES = new Set<AutomationStudioFlowDraftAmendmentChange>(["optional", "only_if", "on_failed", "repeat"]);

/** One edit to one step of the draft. */
export type AutomationStudioFlowDraftAmendment = {
  /** The step's position in the draft, counting from 1. */
  step: number;
  change: AutomationStudioFlowDraftAmendmentChange;
  /** Settings to carry on the step. Merged over whatever it already had. */
  settings?: JsonObject;
  /**
   * The position of another step, counting from 1.
   *
   * `reorder`: where to move this step to. `on_failed`: the step to run when
   * this one fails. One key for one meaning -- "the other step this change is
   * about" -- because two spellings of the same idea is a grammar the model has
   * to remember rather than one it can guess.
   */
  to?: number;
  /** `rerun` only: the whole argument to run the step's action with this time. */
  input?: JsonObject;
  /** `only_if` only: the step whose success this one runs on. Defaults to the step before it. */
  check?: number;
  /** `repeat` only: the last step of the span that repeats. Defaults to this step. */
  through?: number;
  /** `repeat` only: the step whose rows, or whose success, the span repeats on. Defaults to the step before it. */
  over?: number;
};

/** Why one amendment changed nothing. */
export type AutomationStudioFlowDraftAmendmentRefusal = {
  step: number;
  reason: "no_such_step" | "already_so" | "no_such_position" | "run_by_the_loop" | "no_step_before_it" | "not_a_kept_step";
};

/** What the model is shown of the amendment shape, as a decision variant's schema. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA: JsonObject = {
  type: "object",
  additionalProperties: false,
  required: ["step", "change"],
  properties: {
    step: { type: "integer", minimum: 1, description: "The step number shown in the draft." },
    change: {
      enum: [...AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES],
      description: "drop: leave this step out of the result. exploratory: I did this only to look around. keep: put it back in, and make it unconditional again. reorder: move it to the position given by to. rerun: do it again with the argument given by input, which replaces this step. optional: the Flow carries on when this step fails, for something that is not always there. only_if: run this step only when the step before it succeeded, or the one given by check. on_failed: when this step fails, run the step given by to instead, then carry on. repeat: do this step, through the one given by through, once for each row the step given by over produced, or while that step keeps succeeding."
    },
    settings: { type: "object", description: "Settings to carry on the step, merged over any it already has." },
    to: { type: "integer", minimum: 1, description: "reorder: the position to move the step to. on_failed: the step to run when this one fails. Counting from 1." },
    input: { type: "object", description: "rerun only: the whole argument to run the step's action with this time. It replaces the one it was given, so write every key it needs." },
    check: { type: "integer", minimum: 1, description: "only_if only: the step whose success this one runs on. Leave it out for the step before it, which is usually the check you just ran." },
    through: { type: "integer", minimum: 1, description: "repeat only: the last step of the span that repeats. Leave it out to repeat this step alone." },
    over: { type: "integer", minimum: 1, description: "repeat only: the step whose rows the span repeats for, or whose success it repeats while. Leave it out for the step before it." }
  }
};

/**
 * Applies each amendment to the step it names, in place, and says which ones
 * changed nothing.
 *
 * In place because the loop appends to the same list as it goes, and a copy
 * returned here would be a second draft to keep in step with the first.
 *
 * An amendment that names no step, or that says what is already true and
 * carries no settings, is refused rather than counted: the loop's no-progress
 * guard is what stops a model editing the same step forever, and it can only
 * do that if an edit that changed nothing is reported as one.
 */
export function applyAutomationStudioFlowDraftAmendments(
  steps: AutomationStudioFlowDraftStep[],
  amendments: readonly AutomationStudioFlowDraftAmendment[]
): { applied: number; refused: AutomationStudioFlowDraftAmendmentRefusal[] } {
  let applied = 0;
  const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
  for (const amendment of amendments) {
    const step = steps.find((candidate) => candidate.position === amendment.step);
    if (!step) {
      refused.push({ step: amendment.step, reason: "no_such_step" });
      continue;
    }
    // Running something again is the loop's to carry out, not the draft's.
    if (amendment.change === "rerun") {
      refused.push({ step: amendment.step, reason: "run_by_the_loop" });
      continue;
    }
    if (amendment.change === "reorder") {
      if (moveStep(steps, step, amendment.to, amendment.settings)) applied += 1;
      else refused.push({ step: amendment.step, reason: placeExists(steps, amendment.to) ? "already_so" : "no_such_position" });
      continue;
    }
    if (ROUTING_CHANGES.has(amendment.change)) {
      const routed = routeStep(steps, step, amendment);
      if (routed.ok) applied += 1;
      else refused.push({ step: amendment.step, reason: routed.reason });
      continue;
    }
    const disposition = amendment.change === "keep" ? "kept" : amendment.change === "drop" ? "dropped" : "exploratory";
    const changesDisposition = step.disposition !== disposition;
    const changesSettings = amendment.settings !== undefined;
    // `keep` is how a step is put back the way it was found, and a routing
    // statement is part of the way it was changed: a model that says "keep"
    // about a step it made conditional means the step, unconditionally.
    const clearsRouting = amendment.change === "keep" && step.routing !== undefined;
    if (!changesDisposition && !changesSettings && !clearsRouting) {
      refused.push({ step: amendment.step, reason: "already_so" });
      continue;
    }
    step.disposition = disposition;
    if (clearsRouting) delete step.routing;
    if (amendment.settings) step.settings = { ...(step.settings ?? {}), ...amendment.settings };
    applied += 1;
  }
  return { applied, refused };
}

/**
 * Write one routing statement onto the step it is about, or say why it could
 * not be written (`./routing.ts`).
 *
 * The three things this does and nothing else. Whatever the model left out is
 * filled in from the draft -- a check is the step before, a span is this step
 * alone, a list is the step before -- so the commonest statement is one word.
 * Whatever it wrote as a position is turned into the named step's own id, once,
 * here, so a later reorder cannot make the statement mean a different step. And
 * a statement about a step that is not in the Flow is refused, because routing
 * describes the Flow and a withdrawn step is not in it.
 */
function routeStep(
  steps: readonly AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep,
  amendment: AutomationStudioFlowDraftAmendment
): { ok: true } | { ok: false; reason: AutomationStudioFlowDraftAmendmentRefusal["reason"] } {
  const named = (position: number | undefined): AutomationStudioFlowDraftStep | undefined =>
    position === undefined ? undefined : steps.find((candidate) => candidate.position === position);
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
    if (through.position < step.position || over.position >= step.position) return { ok: false, reason: "no_such_position" };
    routing = { kind: "repeat", through: automationStudioFlowDraftStepId(through), over: automationStudioFlowDraftStepId(over) };
  }
  if (same(step.routing, routing) && amendment.settings === undefined) return { ok: false, reason: "already_so" };
  step.routing = routing;
  if (amendment.settings) step.settings = { ...(step.settings ?? {}), ...amendment.settings };
  return { ok: true };
}

/** Whether a statement says exactly what the step already said. */
function same(left: AutomationStudioFlowDraftStepRouting | undefined, right: AutomationStudioFlowDraftStepRouting): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Move one step to another position and renumber the draft, or answer `false`
 * when there is no such position or it is already there.
 *
 * Renumbering is what keeps a position a name the model can use: the draft it
 * is shown next is numbered 1..n in the order the steps now stand, so the
 * number it reads is the number an amendment takes. Settings ride along, since
 * "put this last and give it a longer wait" is one thought.
 */
function moveStep(
  steps: AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep,
  to: number | undefined,
  settings: JsonObject | undefined
): boolean {
  if (!placeExists(steps, to)) return false;
  if (to === step.position && settings === undefined) return false;
  const from = steps.indexOf(step);
  if (from < 0) return false;
  steps.splice(from, 1);
  steps.splice(to! - 1, 0, step);
  steps.forEach((entry, index) => { entry.position = index + 1; });
  if (settings) step.settings = { ...(step.settings ?? {}), ...settings };
  return true;
}

/** Whether the draft has the position an amendment asked to move a step to. */
function placeExists(steps: readonly AutomationStudioFlowDraftStep[], to: number | undefined): boolean {
  return to !== undefined && Number.isInteger(to) && to >= 1 && to <= steps.length;
}
