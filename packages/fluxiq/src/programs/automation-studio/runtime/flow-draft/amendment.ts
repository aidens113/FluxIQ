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
// costs the model a sentence rather than the whole result. Ten changes: six
// about whether a step is in the Flow at all, and four about when it runs.
//
//   add          -- put this step I ran into the Flow (at `to`, when given).
//                   Since 2026-09-30 a step the model runs is evidence, not a
//                   step of the Flow, until the model adds it -- here, or with
//                   `add` on the call itself (`../llm/evidence-loop-decision.ts`).
//                   `act` says which instructed act it does, and only a step
//                   that changes something does one (`act_on_a_read`).
//   drop         -- this step should not be in the result at all.
//   exploratory  -- I did this to look around; do not keep it.
//   keep         -- undo any of the above, and make the step unconditional
//                   again: it clears optional, only_if and on_failed, never a
//                   repeat, and nothing at all when it carries `act`.
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
import { automationStudioFlowDraftStepIsAction, automationStudioFlowDraftStepIsProposed } from "./step.ts";
import type { AutomationStudioFlowDraftStepRouting } from "./routing.ts";
import { automationStudioFlowDraftPrecedingProposedStep, automationStudioFlowDraftStepId } from "./routing.ts";

/** Every change one amendment may ask for. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES = ["add", "drop", "exploratory", "keep", "reorder", "rerun", "optional", "only_if", "on_failed", "repeat"] as const;

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
  /** `rerun` only: what changes in the argument the step ran with, as a JSON merge patch (`../llm/evidence-loop/rerun-input.ts`). */
  input?: JsonObject;
  /** `only_if` only: the step whose success this one runs on. Defaults to the step before it. */
  check?: number;
  /** `repeat` only: the last step of the span that repeats. Defaults to this step. */
  through?: number;
  /** `repeat` only: the step whose rows, or whose success, the span repeats on. Defaults to the step before it. */
  over?: number;
  /**
   * `add` or `keep` only: the instructed act (`a1`, `a2` ...) this step does,
   * as the checklist beside the draft names it. Recorded on the step, and read
   * as the model's claim when it completes (`./step.ts`, `acts`). Only a step
   * whose effect is `mutate` does an act; one named on a read is not recorded
   * there, the rest of the amendment is applied, and the model is told why
   * (`act_on_a_read`).
   */
  act?: string;
};

/**
 * The shape of an id the checklist gives: an act, `a` and its number, or a
 * choice the person made for that act's item, the act's id and what it fixes
 * (`a2.quantity`, `a2.size`; `../flow-bootstrap/instructed-acts/instruction-choices.ts`).
 */
export const AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID = /^a[1-9][0-9]{0,2}(?:\.[a-z]{1,16})?$/u;

/**
 * Why one amendment changed nothing -- or, for `act_on_a_read`, the one part of
 * it that was not done: the act a read cannot do, beside the rest, which was.
 */
export type AutomationStudioFlowDraftAmendmentRefusal = {
  step: number;
  reason: "no_such_step" | "already_so" | "no_such_position" | "run_by_the_loop" | "no_step_before_it" | "over_not_before" | "not_a_kept_step" | "did_not_work" | "already_in_flow" | "already_out" | "changes_nothing" | "act_on_a_read" | "act_already_named";
};

/**
 * The reason an `add`, a `keep` or an act on a look is refused under.
 *
 * Borrowed from the routing refusals -- "it named a step the Flow does not
 * contain" -- because a reason of its own has to be explained in
 * `../llm/draft-amendment-feedback.ts` and allowed in
 * `../flow-bootstrap/evidence-loop-steps.ts`, which other work held when this
 * landed. A dedicated reason replaces it here, in this one place.
 */
const NOT_A_FLOW_STEP: AutomationStudioFlowDraftAmendmentRefusal["reason"] = "not_a_kept_step";

/** What the model is shown of the amendment shape, as a decision variant's schema. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA: JsonObject = {
  type: "object",
  additionalProperties: false,
  required: ["step", "change"],
  properties: {
    step: { type: "integer", minimum: 1, description: "The step number shown in the draft." },
    change: {
      enum: [...AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES],
      description: "add: put this step you ran into the Flow -- a step you run is not in the Flow until you add it -- at the position given by to when given, and act names the act it does. drop: leave this step out of the result. exploratory: I did this only to look around. keep: put it back in, and make it unconditional again (it clears optional, only_if and on_failed, never repeat, and nothing when it carries act). reorder: move it to the position given by to. rerun: do it again with input's changes; the run replaces this step. optional: the Flow carries on when this step fails, for something that is not always there. only_if: run this step only when the step before it succeeded, or the one given by check. on_failed: when this step fails, run the step given by to instead, then carry on. repeat: do this step, through the one given by through, once for each row the step given by over produced, or while that step keeps succeeding. To do one act to every listed item: first rerun the listing with a where that keeps only the items to act on (every row it returns is acted on), do the act to one row it kept (never to a row it leaves out), then repeat with over that listing, right before this one; each pass acts on its own row. Drop any other step that does the same act to a single row."
    },
    settings: { type: "object", description: "Settings to carry on the step, merged over any it already has." },
    to: { type: "integer", minimum: 1, description: "add or reorder: the position to put the step at. on_failed: the step to run when this one fails. Counting from 1." },
    input: { type: "object", description: "rerun only: a JSON merge patch over the argument the step ran with. Only the keys that change; a list replaces whole; null removes a key." },
    check: { type: "integer", minimum: 1, description: "only_if only: the step whose success this one runs on. Leave it out for the step before it, which is usually the check you just ran." },
    through: { type: "integer", minimum: 1, description: "repeat only: the last step of the span that repeats. Leave it out to repeat this step alone. A press that opens a confirmation repeats with it: name the confirmation as through." },
    over: { type: "integer", minimum: 1, description: "repeat only: the step whose rows the span repeats for, or whose success it repeats while. Leave it out for the step before it." },
    act: { type: "string", pattern: "^a[1-9][0-9]{0,2}([.][a-z]{1,16})?$", description: "add or keep: the act from the acts checklist this step does, such as a2, or the choice under it this step makes, such as a2.quantity. Only a step that changes something (changed is not a read) does an act: never name one on a listing or a read." }
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
    // A step that did not work is out of the Flow whatever it is called, so the
    // only edit that can change anything about it is running it again. Every
    // hard live build of 2026-09-28 spent decisions dropping or "keeping"
    // refused presses; a drop "applied" and looked like progress, and a keep
    // was refused as "already so" -- false in the model's reading, since the
    // draft showed the step out -- and was sent again.
    // A failed press the caller marked as no step of a Flow is the same failed
    // press, and the draft entry shows it the same way (`./entry.ts`).
    if ((automationStudioFlowDraftStepIsAction(step) || step.effect === "mutate") && step.effectApplied === false) {
      refused.push({ step: amendment.step, reason: "did_not_work" });
      continue;
    }
    // A step that is not of the kind a Flow is made of -- a look -- can never
    // be in it, so putting it in or saying it does an act changes nothing true.
    // Live run `run-mup2i28c-6c7fc209` sent `5 add a2` about the `snap.store`
    // look and had it applied: the look was recorded as adding two packs of
    // towels. The draft entry lists it as `disposition: look` (`./entry.ts`).
    if (!automationStudioFlowDraftStepIsAction(step) && (amendment.change === "add" || amendment.change === "keep" || amendment.act !== undefined)) {
      refused.push({ step: amendment.step, reason: NOT_A_FLOW_STEP });
      continue;
    }
    // An act is something done: a step that only reads -- a listing a Flow may
    // hold, as much as the look above -- does none, whatever the model calls it.
    // Live run 36 (`run-muq3uozx-3153564b`, E11) sent `10 add act a1` about a
    // withdrawn rerun of the request listing and had it applied; every later
    // rerun of that listing carried the act on, and the completion check judged
    // the listing as the act's step 24 times running.
    // Information, not a refusal (user, 2026-10-01: no restriction on what the
    // model does beyond permission asks): the rest of the amendment is applied,
    // the act is not recorded on the read -- it cannot be done there -- and the
    // model is told so, beside whatever else the amendment changed.
    const actOnRead = amendment.act !== undefined && step.effect !== "mutate";
    if (actOnRead) refused.push({ step: amendment.step, reason: "act_on_a_read" });
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
    const disposition = amendment.change === "keep" || amendment.change === "add" ? "kept" : amendment.change === "drop" ? "dropped" : "exploratory";
    const changesDisposition = step.disposition !== disposition;
    const changesSettings = amendment.settings !== undefined;
    // `keep` is how a step is put back the way it was found, and a condition
    // is part of the way it was changed: a model that says "keep" about a step
    // it made conditional means the step, unconditionally. `add` leaves routing
    // alone: it says the step is in the Flow, nothing more. Two things `keep`
    // never clears. A `repeat` is the act done to every row, not a condition on
    // the step. And a `keep` carrying `act` is a statement about the act: live
    // run 36 (E21, E26) sent `keep act a1` about the repeated Confirm and lost
    // its repeat each time.
    const clearsRouting = amendment.change === "keep" && amendment.act === undefined && step.routing !== undefined && step.routing.kind !== "repeat";
    const alreadyNamed = amendment.act !== undefined && step.acts?.includes(amendment.act) === true;
    const act = disposition === "kept" && !actOnRead && amendment.act !== undefined && AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID.test(amendment.act) && !alreadyNamed ? amendment.act : undefined;
    // `add` at a position is one thought: put this step in the Flow, there.
    const moves = amendment.change === "add" && amendment.to !== undefined && amendment.to !== step.position && placeExists(steps, amendment.to);
    if (!changesDisposition && !changesSettings && !clearsRouting && act === undefined && !moves) {
      // Said as which side of the Flow the step is already on, because that is
      // what the model was trying to settle: a `keep` about a step in the Flow
      // is a confirmation, and the generic "already so" got it sent again.
      // Except where it named an act the step already names: that model was
      // told by the checklist to name it, and "nothing to confirm" contradicted
      // it (live run 36). It is told the name stands and the todo is the fault.
      const reason = disposition !== "kept" ? "already_out" : alreadyNamed ? "act_already_named" : "already_in_flow";
      // A read whose only news was the act has already been told why.
      if (!actOnRead) refused.push({ step: amendment.step, reason });
      continue;
    }
    step.disposition = disposition;
    if (clearsRouting) delete step.routing;
    if (act !== undefined) step.acts = [...(step.acts ?? []), act];
    if (moves) moveStep(steps, step, amendment.to, undefined);
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
    // `repeat` goes on the act and `over` names the listing before it. A model
    // that put it on the listing -- `repeat` on step 15 `over` 15, live run
    // `run-munuj2os-c205ee3a` -- is told that, not that a position is missing.
    if (over.position >= step.position) return { ok: false, reason: "over_not_before" };
    if (through.position < step.position) return { ok: false, reason: "no_such_position" };
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
