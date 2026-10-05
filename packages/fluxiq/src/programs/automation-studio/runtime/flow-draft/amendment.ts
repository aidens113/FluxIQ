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
// costs the model a sentence rather than the whole result. Eleven changes: six
// about whether a step is in the Flow at all, four about when it runs, and one
// about what it runs with.
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
//   bind         -- this step's value comes from somewhere at run time: lift
//                   the parameters `input` names into bindings, the run that
//                   worked kept as its `instance` (design t252, D2).
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
// **One decision's amendments are read in order, each against the draft the
// one before it left.** A `reorder` renumbers the draft at once (`moveStep`),
// so an amendment after it in the same decision names steps by their new
// numbers. Live run `run-murz83zy-5030820f` (R8) pressed its act at step 9 and
// listed the rows at step 18, and sent `9 repeat over 18` six times: a listing
// after its act has to be moved before it first, `18 reorder to 9` and then
// `10 repeat over 9` in one decision, and the refusal now carries what that
// needs (`over`, `through`) so its telling can write both with the real numbers
// (`../llm/draft-amendment-feedback.ts`).
//
// `settings` rides alongside any of them, because "keep this step, but with
// this wait condition" is one thought and should not cost two calls.
//
// `bind` is how a step the model ran becomes general without running it again:
// a value the person gave becomes a Flow input, and a value of the row a
// repeat is on becomes that row's field (`./binding-forms.ts`). It lifts an
// argument the step already has and never invents one, so the run that worked
// stays evidence for the step it now is.
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

import { automationStudioFlowDraftClaimAct } from "./act-claim.ts";
import {
  automationStudioFlowDraftHoldsBinding,
  automationStudioFlowDraftIsBindingForm,
  automationStudioFlowDraftStoredBindingKind,
  automationStudioFlowDraftTranslateBindings
} from "./binding-forms.ts";
import { automationStudioFlowDraftKeepOpeners } from "./opener.ts";
import { automationStudioFlowDraftDropReversals } from "./reversal.ts";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";
import { automationStudioFlowDraftStepIsAction, automationStudioFlowDraftStepIsProposed } from "./step.ts";
import type { AutomationStudioFlowDraftStepRouting } from "./routing.ts";
import { automationStudioFlowDraftPrecedingProposedStep, automationStudioFlowDraftStepId } from "./routing.ts";

/** Every change one amendment may ask for. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES = ["add", "drop", "exploratory", "keep", "reorder", "rerun", "optional", "only_if", "on_failed", "repeat", "unrepeat", "bind"] as const;

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
  /**
   * `rerun`: what changes in the argument the step ran with, as a JSON merge
   * patch (`../llm/evidence-loop/rerun-input.ts`). `bind`: the parameters to
   * lift, each set to a binding form (`./binding-forms.ts`), the `parameters`
   * wrapper optional.
   */
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
  reason: "no_such_step" | "already_so" | "no_such_position" | "run_by_the_loop" | "no_step_before_it" | "over_not_before" | "not_a_kept_step" | "did_not_work" | "already_in_flow" | "already_out" | "changes_nothing" | "act_on_a_read" | "act_already_named"
    | "bind_not_a_binding" | "bind_new_key" | "bind_row_outside_loop" | "bind_malformed" | "rerun_holds_binding";
  /**
   * `over_not_before` only: the step the repeat named as `over`, so the
   * telling can say, in the draft's numbers, which step lists the rows and
   * what a loop over them still needs (`../llm/draft-amendment-feedback.ts`).
   * Live run 37 (`run-muq5v4zg-39182b58`) sent `13 repeat over 13` on its
   * filtered listing with no press after it, and was told the rule in general.
   */
  over?: number;
  /**
   * `over_not_before` only, when `over` came after the act and the repeat named
   * a `through`: that step, so the telling can say where it stands once the
   * listing is moved before the act (live run `run-murz83zy-5030820f`, R8).
   */
  through?: number;
  /**
   * `act_already_named` only: the act the amendment named, so the telling can
   * say whether the checklist already shows it done and, when it does, which
   * acts are still to do (`../llm/draft-amendment-feedback.ts`). Live run
   * `run-muqiojz4-04a7a8fc` named `a2.quantity` on its step five decisions
   * running while the checklist showed it done and `a3` still to do.
   */
  act?: string;
  /**
   * `bind_*` only: the dotted path of the parameter the refusal is about,
   * under the step's parameters, in the model's own key names.
   */
  parameter?: string;
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
      description: "add: put this step you ran into the Flow -- a step you run is not in the Flow until you add it -- at the position given by to when given, and act names the act it does. drop: leave this step out of the result. exploratory: I did this only to look around. keep: put it back in, and make it unconditional again (it clears optional, only_if and on_failed, never repeat, and nothing when it carries act). reorder: move it to the position given by to. rerun: do it again with input's changes; the run replaces this step. optional: the Flow carries on when this step fails, for something that is not always there. only_if: run this step only when the step before it succeeded, or the one given by check. on_failed: when this step fails, run the step given by to instead, then carry on. unrepeat: explicitly remove only the repeat carried by this step, preserving its input, acts, disposition and other routing; send only step and change. Use this on the first step of a mistakenly repeated span (such as a quantity repeated over a list); keep preserves intentional repeats. repeat: do this step, through the one given by through, once for each row the step given by over produced, or while that step keeps succeeding. To do one act to every listed item, three steps in this order: the listing, with a where that keeps only the items to act on (every row it returns is acted on; rerun it only when its where is missing or wrong, never to run it again as it stands); the act done to one row it kept -- that row's own control, never one on a row it leaves out -- added with its act; then repeat on that act, with over the listing. The repeat goes on the act, never on the listing itself; each pass acts on its own row. When the listing comes after the act, reorder the listing to the act's position first, then repeat the act, which the move put one later: the amendments of one decision are read in order, each against the numbers the one before it left. Drop any other step that does the same act to a single row. bind: make a step in the Flow general without running it again: input names parameters it already has, each set to a binding -- {\"$input\": <name>, \"test\": <value>} for a value the person gave that would change between runs (test is that value, and defaults to the one the step ran with), {\"$row\": <field>} for a field of the row a repeat is on (only for a step inside a repeat). The run that worked is kept as evidence."
    },
    settings: { type: "object", description: "Settings to carry on the step, merged over any it already has." },
    to: { type: "integer", minimum: 1, description: "add or reorder: the position to put the step at. on_failed: the step to run when this one fails. Counting from 1." },
    input: { type: "object", description: "rerun only: a JSON merge patch over the argument the step ran with. Only the keys that change, and a node's parameters may be written without parameters around them; a list replaces whole; null removes a key; a key left out is kept, and a new key given a left-out key's value renames it. bind: the parameters to lift, each set to a binding form, {\"$input\": <name>, \"test\": <value>} or {\"$row\": <field>}, at any depth; only parameters the step already has, never a new one." },
    check: { type: "integer", minimum: 1, description: "only_if only: the step whose success this one runs on. Leave it out for the step before it, which is usually the check you just ran." },
    through: { type: "integer", minimum: 1, description: "repeat only: the last step of the span that repeats. Leave it out to repeat this step alone. A press that opens a confirmation repeats with it: name the confirmation as through." },
    over: { type: "integer", minimum: 1, description: "repeat only: the step whose rows the span repeats for -- the listing, a step before this one -- or whose success it repeats while. Leave it out for the step before it." },
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
    // A mistaken repeat needs its own explicit edit: keep (with or without an
    // act) preserves a deliberate row loop. B run mustzxhi could not undo a
    // quantity loop with keep. No disposition, claim, input or settings change.
    if (amendment.change === "unrepeat") {
      if (step.routing?.kind !== "repeat") {
        refused.push({ step: amendment.step, reason: "already_so" });
      } else {
        delete step.routing;
        // The span and everything following it now run in another context.
        for (const changed of steps.slice(steps.indexOf(step))) delete changed.replayed;
        applied += 1;
      }
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
    // A written step changed nothing by construction: it was never performed.
    if (step.written !== true && step.checkedCandidate === undefined && (automationStudioFlowDraftStepIsAction(step) || step.effect === "mutate") && step.effectApplied === false) {
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
    if (amendment.change === "bind") {
      const bound = bindStep(steps, step, amendment);
      if (bound.ok) applied += 1;
      else refused.push({ step: amendment.step, reason: bound.reason, ...(bound.parameter === undefined ? {} : { parameter: bound.parameter }) });
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
      else refused.push({ step: amendment.step, reason: routed.reason, ...(routed.over === undefined ? {} : { over: routed.over }), ...(routed.through === undefined ? {} : { through: routed.through }) });
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
      if (!actOnRead) refused.push({ step: amendment.step, reason, ...(reason === "act_already_named" ? { act: amendment.act! } : {}) });
      continue;
    }
    step.disposition = disposition;
    // A step in the Flow brings the press that opened its page (`./opener.ts`).
    if (disposition === "kept") automationStudioFlowDraftKeepOpeners(steps, step);
    if (clearsRouting) delete step.routing;
    // One act, one step: the claim moves here from any step that held it (`./act-claim.ts`).
    if (act !== undefined) automationStudioFlowDraftClaimAct(steps, step, act);
    if (moves) moveStep(steps, step, amendment.to, undefined);
    // A press a later press of the same control undid leaves the Flow with it, once the
    // step, its openers, its act and its place are settled (`./reversal.ts`).
    if (disposition === "kept") automationStudioFlowDraftDropReversals(steps);
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
): { ok: true } | { ok: false; reason: AutomationStudioFlowDraftAmendmentRefusal["reason"]; over?: number; through?: number } {
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
    // The step it named as over rides along, so the telling can name the
    // listing and the press a loop over it needs by number (live run 37).
    // A listing after the act (`9 repeat over 18`, live run
    // `run-murz83zy-5030820f`) has to be moved before it, which shifts the act
    // and a `through` after it: the through rides along so the telling can say
    // where it stands then.
    if (over.position >= step.position) {
      const shifts = over.position > step.position && amendment.through !== undefined && through !== step;
      return { ok: false, reason: "over_not_before", over: over.position, ...(shifts ? { through: through.position } : {}) };
    }
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
 *
 * A move leaves every step from where it begins untested (`replayed` cleared,
 * `./step.ts`): each of them now runs after other steps than the test ran it
 * after. Live run `run-musq0b1m-0472cfa0` (Cause 6) moved an `unreproducible`
 * Space Grey press after the listing click that brings it onto its page, and
 * the draft went on showing it `unreproducible` -- the model reordered four
 * times. The steps before the move ran after exactly what they run after now,
 * so their marks stand.
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
  if (from !== to! - 1) for (const moved of steps.slice(Math.min(from, to! - 1))) delete moved.replayed;
  if (settings) step.settings = { ...(step.settings ?? {}), ...settings };
  return true;
}

/** Whether the draft has the position an amendment asked to move a step to. */
function placeExists(steps: readonly AutomationStudioFlowDraftStep[], to: number | undefined): boolean {
  return to !== undefined && Number.isInteger(to) && to >= 1 && to <= steps.length;
}

/** The key a node call's argument holds its parameters under. */
const PARAMETERS_KEY = "parameters";

type BindRefusal = { ok: false; reason: AutomationStudioFlowDraftAmendmentRefusal["reason"]; parameter?: string };

/** One binding form the patch sets, where it sits under the parameters, and the value it replaces. */
type BindLeaf = { path: string[]; form: JsonObject; replaced: JsonValue };

/**
 * Lift the parameters a `bind` names into bindings, or say why not (design
 * t252, D2).
 *
 * Everything is checked before anything is written, so a refused bind leaves
 * the step exactly as it was. Generalizing lifts an argument the step already
 * has: every leaf the patch sets must be a binding form, and must replace a
 * value the step ran with. The bindings are written into both what the step
 * runs with and what it shows -- the draft renders them back as forms
 * (`./binding-render.ts`) -- and the first concrete argument is kept as the
 * step's `instance`. A row field needs the step inside a repeat span; whether
 * that span is over a list is the assembler's to check, from the node it
 * repeats over.
 */
function bindStep(
  steps: readonly AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep,
  amendment: AutomationStudioFlowDraftAmendment
): { ok: true } | BindRefusal {
  if (!automationStudioFlowDraftStepIsProposed(step)) return { ok: false, reason: "not_a_kept_step" };
  const argument = step.ranWith ?? step.input;
  const nested = isObject(argument[PARAMETERS_KEY]);
  const parameters = nested ? argument[PARAMETERS_KEY] as JsonObject : argument;
  const patch = amendment.input === undefined ? undefined : unwrappedPatch(amendment.input, nested);
  if (!patch || !Object.keys(patch).length) return { ok: false, reason: "bind_not_a_binding" };
  const leaves: BindLeaf[] = [];
  const problem = collectBindLeaves(patch, parameters, [], leaves);
  if (problem) return problem;
  const bindings: { path: string[]; binding: JsonObject }[] = [];
  for (const leaf of leaves) {
    const parameter = leaf.path.join(".");
    // A Flow input written without its test value is tested with the value it replaces.
    let form = leaf.form;
    if (Object.hasOwn(form, "$input") && !Object.hasOwn(form, "test")) {
      const test = replacedTest(leaf.replaced);
      if (test === undefined) return { ok: false, reason: "bind_malformed", parameter };
      form = { ...form, test };
    }
    const translated = automationStudioFlowDraftTranslateBindings({ value: form });
    const binding = translated.parameters.value;
    if (translated.refused.length || !isObject(binding)) return { ok: false, reason: "bind_malformed", parameter };
    if (automationStudioFlowDraftStoredBindingKind(binding)?.kind === "row" && !insideRepeat(steps, step)) return { ok: false, reason: "bind_row_outside_loop", parameter };
    bindings.push({ path: leaf.path, binding });
  }
  const unchanged = bindings.every(({ path, binding }) => JSON.stringify(valueAt(parameters, path)) === JSON.stringify(binding));
  if (unchanged && amendment.settings === undefined) return { ok: false, reason: "already_so" };
  // The run that worked, once: a later bind never replaces it, and a written step has none.
  if (step.instance === undefined && step.written !== true && step.checkedCandidate === undefined && !automationStudioFlowDraftHoldsBinding(argument)) step.instance = structuredClone(argument);
  for (const { path, binding } of bindings) {
    if (step.ranWith) setAt(containerOf(step.ranWith, nested), path, binding);
    if (step.input !== step.ranWith) setAt(containerOf(step.input, nested), path, binding);
  }
  if (amendment.settings) step.settings = { ...(step.settings ?? {}), ...amendment.settings };
  return { ok: true };
}

/** The patch under the parameters: written with or without `parameters` around it. */
function unwrappedPatch(patch: JsonObject, nested: boolean): JsonObject {
  const keys = Object.keys(patch);
  return nested && keys.length === 1 && keys[0] === PARAMETERS_KEY && isObject(patch[PARAMETERS_KEY]) ? patch[PARAMETERS_KEY] as JsonObject : patch;
}

/**
 * Every binding form the patch sets, with the value each replaces, or the
 * first leaf that is not a form, or that names a parameter the step does not
 * have. An object that is not a form is a path to forms below it, and has to
 * be an object the step already has.
 */
function collectBindLeaves(patch: JsonObject, existing: JsonObject, path: string[], leaves: BindLeaf[]): BindRefusal | undefined {
  for (const [key, value] of Object.entries(patch)) {
    const at = [...path, key];
    const parameter = at.join(".");
    const has = Object.hasOwn(existing, key);
    if (automationStudioFlowDraftIsBindingForm(value)) {
      if (!has) return { ok: false, reason: "bind_new_key", parameter };
      leaves.push({ path: at, form: value, replaced: existing[key]! });
      continue;
    }
    if (!isObject(value) || Object.hasOwn(value, "$state") || !Object.keys(value).length) return { ok: false, reason: "bind_not_a_binding", parameter };
    if (!has) return { ok: false, reason: "bind_new_key", parameter };
    const below = existing[key];
    if (!isObject(below) || Object.hasOwn(below, "$state")) return { ok: false, reason: "bind_not_a_binding", parameter };
    const problem = collectBindLeaves(value, below, at, leaves);
    if (problem) return problem;
  }
  return undefined;
}

/** The test value a Flow input takes from the value it replaces: that value, or the test of an input already bound there. */
function replacedTest(replaced: JsonValue): JsonValue | undefined {
  if (replaced === null) return undefined;
  const stored = automationStudioFlowDraftStoredBindingKind(replaced);
  if (stored) return stored.kind === "input" ? stored.test : undefined;
  return automationStudioFlowDraftHoldsBinding(replaced) ? undefined : replaced;
}

/** Whether a step is inside a span some step repeats: that step, through the one it names as `through`. */
function insideRepeat(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): boolean {
  const at = steps.indexOf(step);
  return steps.some((first, start) => {
    if (first.routing?.kind !== "repeat") return false;
    const through = first.routing.through;
    const end = steps.findIndex((candidate) => automationStudioFlowDraftStepId(candidate) === through);
    return at === start || (end >= start && at >= start && at <= end);
  });
}

/** Where a step's parameters are kept in one of its arguments, made when it has none yet. */
function containerOf(argument: JsonObject, nested: boolean): JsonObject {
  if (!nested) return argument;
  if (!isObject(argument[PARAMETERS_KEY])) argument[PARAMETERS_KEY] = {};
  return argument[PARAMETERS_KEY] as JsonObject;
}

function valueAt(root: JsonObject, path: readonly string[]): JsonValue | undefined {
  let value: JsonValue | undefined = root;
  for (const key of path) value = isObject(value) ? value[key] : undefined;
  return value;
}

function setAt(root: JsonObject, path: readonly string[], value: JsonValue): void {
  let target = root;
  for (const key of path.slice(0, -1)) {
    if (!isObject(target[key])) target[key] = {};
    target = target[key] as JsonObject;
  }
  target[path[path.length - 1]!] = structuredClone(value);
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
