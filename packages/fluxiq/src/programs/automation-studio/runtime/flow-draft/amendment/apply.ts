// One decision's amendments, applied to the draft in place (`./index.ts` says
// what each change means and why the draft is edited this way).
import { automationStudioFlowDraftClaimAct } from "../act-claim.ts";
import { automationStudioFlowDraftKeepOpeners } from "../opener.ts";
import { automationStudioFlowDraftDropReversals } from "../reversal.ts";
import { automationStudioFlowDraftStepIsAction, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../step.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID } from "./act-id.ts";
import { automationStudioFlowDraftAmendmentBind } from "./bind.ts";
import type { AutomationStudioFlowDraftAmendmentChange } from "./changes.ts";
import { automationStudioFlowDraftAmendmentMove } from "./move.ts";
import { automationStudioFlowDraftAmendmentRoute } from "./route.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLACED_ATTEMPT_REASON, automationStudioFlowDraftReplacingStep } from "./replaced-attempt.ts";
import {
  automationStudioFlowDraftSettleWrittenRepeats,
  automationStudioFlowDraftTakeOffBrokenRepeats,
  type AutomationStudioFlowDraftWrittenRepeat
} from "./repeat-revalidation.ts";
import { automationStudioFlowDraftShownNumbering } from "./shown-numbering.ts";
import type { AutomationStudioFlowDraftAmendment, AutomationStudioFlowDraftAmendmentRefusal } from "./types.ts";

/** The four changes that say when a step runs rather than whether it is kept. */
const ROUTING_CHANGES = new Set<AutomationStudioFlowDraftAmendmentChange>(["optional", "only_if", "on_failed", "repeat"]);

/**
 * An act an amendment moved off a step that is still in the Flow and now does
 * no act, in the numbers the whole decision left: the step it left (`from`)
 * and the step that does it now (`to`). Information, never a refusal: the move
 * is applied, and the step left is the model's to drop or keep
 * (`../act-claim.ts`).
 */
type ActMove = { act: string; from: number; to: number };

/**
 * The reason an `add`, a `keep` or an act on a look is refused under.
 *
 * Borrowed from the routing refusals -- "it named a step the Flow does not
 * contain" -- because a reason of its own has to be explained in
 * `../../llm/draft-amendment-feedback.ts` and allowed in
 * `../../flow-bootstrap/evidence-loop-steps.ts`, which other work held when this
 * landed. A dedicated reason replaces it here, in this one place.
 */
const NOT_A_FLOW_STEP: AutomationStudioFlowDraftAmendmentRefusal["reason"] = "not_a_kept_step";

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
 *
 * Every number an amendment carries names the step the draft as passed in
 * numbered so (`./shown-numbering.ts`). A repeat this decision wrote is checked
 * once its moves are done, and taken back, refused, when it cannot run; after
 * a decision that moved a step, every other repeat that can no longer run is
 * taken off and reported `repeat_taken_off` (`./repeat-revalidation.ts`).
 *
 * `moved`, when there is any, names each step an act was moved off that the
 * decision left in the Flow with no act (`ActMove`).
 */
export function applyAutomationStudioFlowDraftAmendments(
  steps: AutomationStudioFlowDraftStep[],
  amendments: readonly AutomationStudioFlowDraftAmendment[]
): { applied: number; refused: AutomationStudioFlowDraftAmendmentRefusal[]; moved?: ActMove[] } {
  let applied = 0;
  const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
  const claims: { act: string; from: AutomationStudioFlowDraftStep; to: AutomationStudioFlowDraftStep }[] = [];
  const shown = automationStudioFlowDraftShownNumbering(steps);
  const written: AutomationStudioFlowDraftWrittenRepeat[] = [];
  let movedStep = false;
  for (const amendment of amendments) {
    const step = shown.step(amendment.step);
    if (!step) {
      refused.push({ step: amendment.step, reason: "no_such_step" });
      continue;
    }
    // The attempt a rerun replaced: told which step to change instead (`./replaced-attempt.ts`).
    const replacing = automationStudioFlowDraftReplacingStep(steps, step);
    if (replacing) {
      refused.push({ step: amendment.step, reason: AUTOMATION_STUDIO_FLOW_DRAFT_REPLACED_ATTEMPT_REASON, replacedBy: shown.number(replacing) });
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
    // press, and the draft entry shows it the same way (`../entry.ts`).
    // A written step changed nothing by construction: it was never performed.
    if (step.written !== true && step.checkedCandidate === undefined && (automationStudioFlowDraftStepIsAction(step) || step.effect === "mutate") && step.effectApplied === false) {
      refused.push({ step: amendment.step, reason: "did_not_work" });
      continue;
    }
    // A step that is not of the kind a Flow is made of -- a look -- can never
    // be in it, so putting it in or saying it does an act changes nothing true.
    // Live run `run-mup2i28c-6c7fc209` sent `5 add a2` about the `snap.store`
    // look and had it applied: the look was recorded as adding two packs of
    // towels. The draft entry lists it as `disposition: look` (`../entry.ts`).
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
      const bound = automationStudioFlowDraftAmendmentBind(steps, step, amendment);
      if (bound.ok) applied += 1;
      else refused.push({ step: amendment.step, reason: bound.reason, ...(bound.parameter === undefined ? {} : { parameter: bound.parameter }), ...(bound.control ? { control: true as const } : {}) });
      continue;
    }
    if (amendment.change === "reorder") {
      const to = shown.step(amendment.to);
      if (automationStudioFlowDraftAmendmentMove(steps, step, to, amendment.settings)) {
        applied += 1;
        if (to !== step) movedStep = true;
      } else refused.push({ step: amendment.step, reason: to ? "already_so" : "no_such_position" });
      continue;
    }
    if (ROUTING_CHANGES.has(amendment.change)) {
      const previous = step.routing;
      const settings = step.settings;
      const routed = automationStudioFlowDraftAmendmentRoute(steps, step, amendment, shown);
      if (routed.ok) {
        applied += 1;
        // Checked once the decision's moves are done (`./repeat-revalidation.ts`).
        if (step.routing?.kind === "repeat") written.push({ step, routing: step.routing, amendment, previous, settings });
      } else refused.push({ step: amendment.step, reason: routed.reason, ...(routed.over === undefined ? {} : { over: routed.over }), ...(routed.through === undefined ? {} : { through: routed.through }) });
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
    const place = amendment.change === "add" ? shown.step(amendment.to) : undefined;
    const moves = place !== undefined && place !== step;
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
    // A step in the Flow brings the press that opened its page (`../opener.ts`).
    if (disposition === "kept") automationStudioFlowDraftKeepOpeners(steps, step);
    if (clearsRouting) delete step.routing;
    // One act, one step: the claim moves here from any step that held it (`../act-claim.ts`).
    if (act !== undefined) for (const from of automationStudioFlowDraftClaimAct(steps, step, act)) claims.push({ act, from, to: step });
    if (moves && automationStudioFlowDraftAmendmentMove(steps, step, place, undefined)) movedStep = true;
    // A press a later press of the same control undid leaves the Flow with it, once the
    // step, its openers, its act and its place are settled (`../reversal.ts`).
    if (disposition === "kept") automationStudioFlowDraftDropReversals(steps);
    if (amendment.settings) step.settings = { ...(step.settings ?? {}), ...amendment.settings };
    applied += 1;
  }
  // A repeat this decision wrote that its moves left unable to run is taken
  // back and refused, as it would have been had the move come first.
  const settled = automationStudioFlowDraftSettleWrittenRepeats(steps, written, shown);
  applied -= settled.takenBack;
  refused.push(...settled.refused);
  if (movedStep) refused.push(...automationStudioFlowDraftTakeOffBrokenRepeats(steps, shown));
  const moved = movedActs(claims);
  return { applied, refused, ...(moved.length ? { moved } : {}) };
}

/**
 * The moves a decision's claims leave standing, read once every amendment of it
 * is applied: a later one may have dropped the step left, put another act on
 * it, moved the act on again, or renumbered the draft. Only a step still in the
 * Flow with no act is named, since that is the step run in every run for
 * nothing the person asked -- live run `run-musp4h2f-72e8ed99` pressed such an
 * Add to cart again in its next test.
 */
function movedActs(claims: readonly { act: string; from: AutomationStudioFlowDraftStep; to: AutomationStudioFlowDraftStep }[]): ActMove[] {
  const moved: ActMove[] = [];
  for (const { act, from, to } of claims) {
    if (!automationStudioFlowDraftStepIsProposed(from) || from.acts?.length || !to.acts?.includes(act)) continue;
    if (moved.some((entry) => entry.act === act && entry.from === from.position)) continue;
    moved.push({ act, from: from.position, to: to.position });
  }
  return moved;
}
