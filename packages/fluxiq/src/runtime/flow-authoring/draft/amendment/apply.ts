// One decision's amendments, applied to the draft in place (`./index.ts` says
// what each edit means and why the draft is edited this way).
import { automationStudioFlowDraftClaimAct } from "../act-claim.ts";
import { automationStudioFlowDraftSettleLoopCovered } from "../loop-covered/index.ts";
import { automationStudioFlowDraftKeepOpeners } from "../opener.ts";
import { automationStudioFlowDraftDropReversals } from "../reversal.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_ROUTE_PLACE_VALUE, automationStudioFlowDraftSetRoutePlaces } from "../route-places/index.ts";
import { automationStudioFlowDraftRepeatIsWhile } from "../routing.ts";
import { automationStudioFlowDraftSecondCopy } from "../second-copy.ts";
import { automationStudioFlowDraftStepIsAction, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../step.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID } from "./act-id.ts";
import { automationStudioFlowDraftAmendmentBind } from "./bind.ts";
import { automationStudioFlowDraftEditPutInNamed, automationStudioFlowDraftEditResult, automationStudioFlowDraftStepLeftOut } from "./edits/index.ts";
import { automationStudioFlowDraftAmendmentRoute } from "./route.ts";
import { automationStudioFlowDraftHoldRepeatSteps, automationStudioFlowDraftSettleSpanRouting, automationStudioFlowDraftSpanChangeRefusal, type AutomationStudioFlowDraftWrittenRouting } from "./repeat-hold.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLACED_ATTEMPT_REASON, automationStudioFlowDraftReplacingStep } from "./replaced-attempt.ts";
import { automationStudioFlowDraftSettleWrittenRepeats, type AutomationStudioFlowDraftWrittenRepeat } from "./repeat-revalidation.ts";
import { automationStudioFlowDraftSettingsRewriteRun } from "./settings-rewrite-run.ts";
import { automationStudioFlowDraftSaidInNumbers } from "./said-numbers.ts";
import { automationStudioFlowDraftShownNumbering } from "./shown-numbering.ts";
import { automationStudioFlowDraftReach } from "./reach.ts";
import { automationStudioFlowDraftStrandCheck, type AutomationStudioFlowDraftWithdrawal } from "./strand-check.ts";
import type {
  AutomationStudioFlowDraftAmendment,
  AutomationStudioFlowDraftAmendmentRefusal,
  AutomationStudioFlowDraftClaimRefused,
  AutomationStudioFlowDraftLoopNeverEnds,
  AutomationStudioFlowDraftUnreachedStep
} from "./types.ts";

/**
 * An act an amendment moved off a step that is still in the Flow and now does
 * no act, in the numbers the whole decision left: the step it left (`from`)
 * and the step that does it now (`to`). Information, never a refusal: the move
 * is applied, and the step left is the model's to drop or keep
 * (`../act-claim.ts`).
 */
type ActMove = { act: string; from: number; to: number };

/**
 * The reason a `keep` or an act on a look is refused under.
 *
 * Borrowed from the routing refusals -- "it named a step the Flow does not
 * contain" -- because a reason of its own has to be explained in
 * `../../llm/draft-amendment-feedback/index.ts` and allowed in
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
 * The framework drafts the Flow and the model edits it (`./edits/`): every
 * ruling the model makes deletes `drafted` from the steps it rules on, so its
 * word stands from then on, and a `keep` of a step the framework left out puts
 * it in, with the checks that putting a step in has always had.
 *
 * Every number an amendment carries names the step the draft as passed in
 * numbered so (`./shown-numbering.ts`). A repeat this decision wrote is checked
 * once its last amendment is read, and taken back, refused, when it cannot run
 * (`./repeat-revalidation.ts`).
 *
 * `moved`, when there is any, names each step an act was moved off that the
 * decision left in the Flow with no act (`ActMove`). `unreached`, when there is
 * any, names each step of the Flow the decision newly left after a step that
 * does not bring it to its page: information, never a refusal
 * (`./strand-check.ts`).
 *
 * `options.claimRefused`, when given, is asked before an act is claimed on a
 * step (`./types.ts`, week report W1): a claim it refuses is not made and is
 * reported `act_not_done_there`, and the rest of that amendment still applies,
 * as with `act_on_a_read`.
 *
 * `options.loopNeverEnds`, when given, is asked of each repeat an amendment
 * writes that runs its span again while the span's last step succeeds
 * (`./types.ts`): a loop it refuses -- one assembly would refuse, whose last
 * step can answer no route that ends it and which has no `most` the person
 * gave -- is taken back and reported `repeat_never_ends`, with assembly's own
 * sentence, so the model fixes the loop in the decision after rather than
 * meeting the refusal only when the Flow is assembled.
 *
 * `options.withdrawsReplacedAttempt` is Core's own withdrawal of the attempt a
 * rerun replaced (`../../../llm/evidence-loop/rerun/replacement.ts`), the one
 * internal caller: a `drop` that is not the model's ruling, so the step stays
 * the framework's to draft (`drafted` is kept), and the attempt's leaving
 * strands no step, since the rerun stands in its place.
 */
export function applyAutomationStudioFlowDraftAmendments(
  steps: AutomationStudioFlowDraftStep[],
  amendments: readonly AutomationStudioFlowDraftAmendment[],
  options: AmendmentOptions = {}
): AmendmentReport {
  const before = steps.map((step) => ({ step, copy: snapshot(step) }));
  const report = applyEach(steps, amendments, options);
  // All or none (t1068): a refused edit leaves the whole decision unapplied, each refusal still naming its edit and why.
  if (!report.refused.some((entry) => !NOT_BLOCKING.has(entry.reason))) return report;
  for (const { step, copy } of before) {
    for (const key of Object.keys(step)) delete (step as Record<string, unknown>)[key];
    Object.assign(step, copy);
  }
  return { applied: 0, refused: report.refused };
}

/** Refusals that stop nothing: the edit changed nothing, or one part of it was told and the rest applied. */
const NOT_BLOCKING: ReadonlySet<string> = new Set(["already_so", "already_in_flow", "already_out", "changes_nothing", "act_already_named", "act_on_a_read", "act_not_done_there"]);

function snapshot(step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep {
  try {
    return structuredClone(step);
  } catch {
    return { ...step };
  }
}

type AmendmentOptions = {
  claimRefused?: AutomationStudioFlowDraftClaimRefused | undefined;
  loopNeverEnds?: AutomationStudioFlowDraftLoopNeverEnds | undefined;
  withdrawsReplacedAttempt?: boolean | undefined;
};
type AmendmentReport = { applied: number; refused: AutomationStudioFlowDraftAmendmentRefusal[]; moved?: ActMove[]; unreached?: AutomationStudioFlowDraftUnreachedStep[] };

function applyEach(
  steps: AutomationStudioFlowDraftStep[],
  amendments: readonly AutomationStudioFlowDraftAmendment[],
  options: AmendmentOptions
): AmendmentReport {
  let applied = 0;
  const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
  const claims: { act: string; from: AutomationStudioFlowDraftStep; to: AutomationStudioFlowDraftStep }[] = [];
  const shown = automationStudioFlowDraftShownNumbering(steps);
  // The number the model wrote for the step now at `position` (`./said-numbers.ts`, t285 gap 2).
  const shownAt = (position: number): number => {
    const there = steps.find((each) => each.position === position);
    return there ? shown.number(there) : position;
  };
  const written: AutomationStudioFlowDraftWrittenRepeat[] = [];
  // Every routing the decision wrote, checked against the spans once its last amendment is read (`./repeat-hold.ts`, t981).
  const routedNow: AutomationStudioFlowDraftWrittenRouting[] = [];
  // Each step's way to its page as the decision found it, and the steps it took out (`./strand-check.ts`).
  const reachBefore = automationStudioFlowDraftReach(steps);
  const withdrawn: AutomationStudioFlowDraftWithdrawal[] = [];
  // A step kept after a withdrawal of this decision, whose reversal waits for the strand check.
  let reversalAfterCheck = false;
  // Whether this is the model's ruling, which makes the steps it names the model's (`./edits/`), or Core's own withdrawal.
  const modelsWord = options.withdrawsReplacedAttempt !== true;
  for (const amendment of amendments) {
    const step = shown.step(amendment.step);
    if (!step) {
      refused.push({ step: amendment.step, reason: "no_such_step" });
      continue;
    }
    // A `keep` of a step the framework left out puts it in the Flow (`./edits/`).
    const putsIn = amendment.change === "keep" && automationStudioFlowDraftStepLeftOut(step);
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
    // be in it, so keeping it or saying it does an act changes nothing true.
    // Live run `run-mup2i28c-6c7fc209` named an act on the `snap.store` look and
    // had it applied: the look was recorded as adding two packs of towels. The
    // draft entry lists it as `disposition: look` (`../entry.ts`).
    if (!automationStudioFlowDraftStepIsAction(step) && (amendment.change === "keep" || amendment.act !== undefined)) {
      refused.push({ step: amendment.step, reason: NOT_A_FLOW_STEP });
      continue;
    }
    // `result`: this read holds the answer (`./edits/result.ts`).
    if (amendment.change === "result") {
      // Checked like `keep`: a step that is a second copy of one in the Flow cannot be the result (t1068).
      const copy = step.disposition !== "kept" ? automationStudioFlowDraftSecondCopy(steps, step) : undefined;
      if (copy) {
        refused.push({ step: amendment.step, reason: "second_copy", copyOf: shown.number(copy) });
        continue;
      }
      const ruled = automationStudioFlowDraftEditResult(step);
      if (ruled.ok) applied += 1;
      else refused.push({ step: amendment.step, reason: ruled.reason });
      continue;
    }
    // Settings that give a parameter the step ran with another value make it a
    // step nobody ran: refused whole, before anything about it changes, so no
    // disposition, act, routing or bind of the amendment is applied either.
    // Live run `run-mux74k5q-1c3c2127` (C1, 0025) put a press of Spain in the
    // Flow with `settings.target` the quantity field (`./settings-rewrite-run.ts`).
    // So does an `input` on a change that takes none (all but bind here; a
    // rerun was answered above): run `run-muxkzdjw-31a13429` (0029) put the
    // coupon press in with the input of typing 3 into the quantity field, which
    // was dropped unsaid.
    const inputNotTaken = amendment.change === "bind" ? undefined : amendment.input;
    if (automationStudioFlowDraftSettingsRewriteRun(step, amendment.settings, inputNotTaken)) {
      refused.push({ step: amendment.step, reason: "settings_rewrite_run" });
      continue;
    }
    // A step put back into the Flow that copies a step already in it -- the same
    // press on the same page, or a read of the same list with nothing changed in
    // between -- is refused whole, before anything about it changes: the Flow
    // does each step once. Live run `run-murwdp4f-35f976d2` (C9, 0046) put a
    // second press of step 18's 3-Pack link from the same page in (`../second-copy.ts`).
    const copyOf = amendment.change === "keep" && step.disposition !== "kept" ? automationStudioFlowDraftSecondCopy(steps, step) : undefined;
    if (copyOf) {
      refused.push({ step: amendment.step, reason: "second_copy", copyOf: shown.number(copyOf) });
      continue;
    }
    // An act is something done: a step that only reads -- a listing a Flow may
    // hold, as much as the look above -- does none, whatever the model calls it.
    // Live run 36 (`run-muq3uozx-3153564b`, E11) named act a1 on a withdrawn
    // rerun of the request listing and had it applied; every later rerun of
    // that listing carried the act on, and the completion check judged the
    // listing as the act's step 24 times running.
    // Information, not a refusal (user, 2026-10-01: no restriction on what the
    // model does beyond permission asks): the rest of the amendment is applied,
    // the act is not recorded on the read -- it cannot be done there -- and the
    // model is told so, beside whatever else the amendment changed.
    const actOnRead = amendment.act !== undefined && step.effect !== "mutate";
    if (actOnRead) refused.push({ step: amendment.step, reason: "act_on_a_read" });
    if (amendment.change === "bind") {
      const bound = automationStudioFlowDraftAmendmentBind(steps, step, amendment, shown);
      if (bound.ok) applied += 1;
      else refused.push({ step: amendment.step, reason: bound.reason, ...(bound.parameter === undefined ? {} : { parameter: bound.parameter }), ...(bound.control ? { control: true as const } : {}), ...(bound.bindable ? { bindable: bound.bindable } : {}) });
      continue;
    }
    if (amendment.change === "repeat") {
      const previous = step.routing;
      const settings = step.settings;
      // A repeat naming steps the framework left out -- its listing, its while, its span's last step -- puts them in; put
      // back if the repeat is refused (`./edits/put-in-named.ts`, the paging pattern's Next page).
      const named = [amendment.over, amendment.while, amendment.through].map((number) => (number === undefined ? undefined : shown.step(number)));
      const putBack = automationStudioFlowDraftEditPutInNamed(named);
      const routed = automationStudioFlowDraftAmendmentRoute(steps, step, amendment, shown);
      // A loop that could end only by failing is put back as it was and refused
      // with assembly's sentence, which names the nodes that do end one
      // (`./types.ts`, run `run-mwblz4aq-0baa810a`). Never offered a count.
      const neverEnds = routed.ok && automationStudioFlowDraftRepeatIsWhile(step.routing) ? options.loopNeverEnds?.(steps, step) : undefined;
      if (neverEnds !== undefined) {
        if (previous === undefined) delete step.routing;
        else step.routing = previous;
        if (settings === undefined) delete step.settings;
        else step.settings = settings;
        putBack?.();
        refused.push({ step: amendment.step, reason: "repeat_never_ends", said: automationStudioFlowDraftSaidInNumbers(neverEnds, shownAt) });
        continue;
      }
      if (routed.ok) {
        applied += 1;
        delete step.drafted;
        // A repeat that stands makes the steps it names and its whole span the model's: a recompose never takes them out.
        for (const ruled of [...named, ...spanOf(steps, step, named[2])]) if (ruled?.disposition === "kept") delete ruled.drafted;
        // Checked once the decision's last amendment is read (`./repeat-revalidation.ts`).
        if (step.routing?.kind === "repeat") written.push({ step, routing: step.routing, amendment, previous, settings });
        if (step.routing) routedNow.push({ step, routing: step.routing, amendment, previous, settings });
      } else {
        putBack?.();
        refused.push({ step: amendment.step, reason: routed.reason, ...(routed.over === undefined ? {} : { over: routed.over }), ...(routed.through === undefined ? {} : { through: routed.through }) });
      }
      continue;
    }
    const disposition = amendment.change === "keep" ? "kept" : "dropped";
    const changesDisposition = step.disposition !== disposition;
    const changesSettings = amendment.settings !== undefined;
    // `keep` of a step in the Flow is how a step is put back the way it was
    // found, and a condition a carried Flow gave it is part of the way it was
    // changed: a model that says "keep" about a step that is conditional means
    // the step, unconditionally. A `keep` that puts a left-out step in says the
    // step is in the Flow, nothing more. Two things `keep` never clears. A
    // `repeat` is the act done to every row, not a condition on the step. And a
    // `keep` carrying `act` is a statement about the act: live run 36 (E21,
    // E26) sent `keep act a1` about the repeated Confirm and lost its repeat
    // each time. A `keep` carrying `place` is likewise a statement about the
    // route (D phase 2).
    const clearsRouting = amendment.change === "keep" && !putsIn && amendment.act === undefined && amendment.place === undefined && step.routing !== undefined && step.routing.kind !== "repeat";
    const alreadyNamed = amendment.act !== undefined && step.acts?.includes(amendment.act) === true;
    const claimed = disposition === "kept" && !actOnRead && amendment.act !== undefined && AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID.test(amendment.act) && !alreadyNamed ? amendment.act : undefined;
    // A claim the act judge would reject -- the step chose one of the act's
    // options, closed something in the way or went to another page -- is not
    // made, and is said with the judge's sentence; the rest of the amendment
    // still applies, as with an act on a read (week report W1, live run
    // `run-mux74k5q-1c3c2127`: a1 on the press of "Spain"). Asked before the
    // step changes, so a claim that was the amendment's only news changes nothing.
    // Judged, and worded, on the draft as it stands; told in the numbers the
    // model wrote (`./said-numbers.ts`, t285 gap 2).
    const claimRefusal = claimed === undefined ? undefined : options.claimRefused?.(steps, step, claimed);
    if (claimRefusal) {
      refused.push({
        step: amendment.step, reason: "act_not_done_there", act: claimRefusal.act, said: automationStudioFlowDraftSaidInNumbers(claimRefusal.said, shownAt),
        ...(claimRefusal.instead !== undefined && steps.some((each) => each.position === claimRefusal.instead) ? { instead: shownAt(claimRefusal.instead) } : {})
      });
    }
    const act = claimRefusal ? undefined : claimed;
    // The places on the named route the step says it is on, taken wherever an
    // act is, a read included: a listing may be on the way (`../route-places/`).
    // A value outside the grammar is ignored, as a bad act id is. Whether it
    // changes anything is asked of a copy, so a refused amendment changes nothing.
    const routePlace = disposition === "kept" && amendment.place !== undefined && AUTOMATION_STUDIO_FLOW_DRAFT_ROUTE_PLACE_VALUE.test(amendment.place) ? amendment.place : undefined;
    const changesPlaces = routePlace !== undefined && automationStudioFlowDraftSetRoutePlaces({ ...step }, routePlace);
    // A `keep` of a step the framework put in, or a `drop` of one it left out, says what the draft already
    // shows, and still makes the step the model's: the framework never decides it again, so a later read or
    // a later rule cannot move it (`../step.ts`, `drafted`). Applied, not refused as already so -- unless its
    // news was an act that could not be recorded there, which is told as that and changes nothing (t1037).
    const pins = modelsWord && step.drafted !== undefined && (disposition === "kept") === (step.drafted === "in") && !actOnRead && !claimRefusal;
    if (!changesDisposition && !changesSettings && !clearsRouting && act === undefined && !changesPlaces && !pins) {
      // Said as which side of the Flow the step is already on, because that is
      // what the model was trying to settle: a `keep` about a step in the Flow
      // is a confirmation, and the generic "already so" got it sent again.
      // Except where it named an act the step already names: that model was
      // told by the checklist to name it, and "nothing to confirm" contradicted
      // it (live run 36). It is told the name stands and the todo is the fault.
      // A place the step already says is plainly already so: no reason of its
      // own, so the activity and chat refusal words stay as they are.
      const reason = disposition !== "kept" ? "already_out" : alreadyNamed ? "act_already_named" : routePlace !== undefined ? "already_so" : "already_in_flow";
      // A read, or a claim refused, whose only news was the act has already been told why.
      if (!actOnRead && !claimRefusal) refused.push({ step: amendment.step, reason, ...(reason === "act_already_named" ? { act: amendment.act! } : {}) });
      continue;
    }
    const spanRefusal = disposition === "kept" && changesDisposition
      ? automationStudioFlowDraftSpanChangeRefusal(steps, step, amendment, shown, { clearsRouting, act })
      : undefined;
    if (spanRefusal) {
      refused.push(spanRefusal);
      continue;
    }
    const leavesFlow = disposition !== "kept" && step.disposition === "kept";
    if (leavesFlow) withdrawn.push({ step, named: amendment.step, disposition: step.disposition, settings: step.settings });
    step.disposition = disposition;
    // A step in the Flow brings the press that opened its page (`../opener.ts`).
    if (disposition === "kept") automationStudioFlowDraftKeepOpeners(steps, step);
    if (clearsRouting) delete step.routing;
    // One act, one step: the claim moves here from any step that held it (`../act-claim.ts`).
    if (act !== undefined) for (const from of automationStudioFlowDraftClaimAct(steps, step, act)) claims.push({ act, from, to: step });
    // Many steps may be on one place: the claim replaces this step's own and no other's.
    if (changesPlaces) automationStudioFlowDraftSetRoutePlaces(step, routePlace!);
    // A press a later press of the same control undid leaves the Flow with it, once the
    // step, its openers, its act and its place are settled (`../reversal.ts`). A drop
    // of a kept step runs it after the strand check, below -- and so does a step kept
    // after one this decision withdrew: run now, it would read that drop as standing
    // and take its partner out before the check could put the drop back (t281's open edge).
    if (disposition === "kept") {
      if (withdrawn.length) reversalAfterCheck = true;
      else automationStudioFlowDraftDropReversals(steps);
    }
    if (amendment.settings) step.settings = { ...(step.settings ?? {}), ...amendment.settings };
    // The model has ruled on whether the step is in the Flow: its word stands from now on (`../step.ts`, `drafted`).
    if (modelsWord) delete step.drafted;
    applied += 1;
  }
  // A repeat this decision wrote that cannot run where its steps stand is taken back and refused.
  const settled = automationStudioFlowDraftSettleWrittenRepeats(steps, written, shown);
  applied -= settled.takenBack;
  refused.push(...settled.refused);
  // A drop that left a kept step no way to its page is put back and refused; a
  // step newly left after one that does not bring it there is said (D2-1).
  // The attempt a rerun replaced strands nothing: the rerun is the same step corrected, standing where it stood.
  // Reach cannot see that (where a step left the target is read off the step appended after it, and the rerun was
  // appended last), so the check would put the attempt back at the Flow's end, where it would run again after every
  // other step (t994; since t981 258f83958 withdrew it after the rerun took its place). Every other check still holds.
  const reach = automationStudioFlowDraftStrandCheck(steps, reachBefore, options.withdrawsReplacedAttempt ? [] : withdrawn, shown);
  applied -= reach.takenBack;
  refused.push(...reach.refused);
  // A drop of the listing a repeat in the Flow walks, or of its span's last step,
  // is put back and refused: the repeat would name a step the Flow does not run
  // (t981, `./repeat-hold.ts`, `run-mwp1jqze-388b466c`).
  const holds = automationStudioFlowDraftHoldRepeatSteps(steps, withdrawn, shown);
  applied -= holds.takenBack;
  refused.push(...holds.refused);
  // Check the final kept span after refused withdrawals have been restored:
  // withdrawing a routed member cannot hide it from the body check (t981).
  const spans = automationStudioFlowDraftSettleSpanRouting(steps, routedNow, shown);
  applied -= spans.takenBack;
  refused.push(...spans.refused);
  // A kept half whose partner really left the Flow -- dropped, and not put back
  // by the strand check -- would flip the control the wrong way (live run
  // `run-mux6n7m4-8273e7a0`, rule b). Run only once the check is done, so a drop
  // put back never takes its partner out with it (`../reversal.ts`).
  if (reversalAfterCheck || withdrawn.some((entry) => entry.step.disposition !== "kept")) automationStudioFlowDraftDropReversals(steps);
  // A step kept right after a loop that already does its act leaves the Flow, and one
  // taken out for that comes back once no loop covers it, once every repeat of the
  // decision stands (`../loop-covered/`, t975: the press of Next page kept after the
  // loop that presses it until the list ends, which stopped every replay).
  automationStudioFlowDraftSettleLoopCovered(steps);
  const moved = movedActs(claims);
  return { applied, refused, ...(moved.length ? { moved } : {}), ...(reach.unreached.length ? { unreached: reach.unreached } : {}) };
}

/**
 * The moves a decision's claims leave standing, read once every amendment of it
 * is applied: a later one may have dropped the step left, put another act on
 * it, or moved the act on again. Only a step still in the Flow with no act is
 * named, since that is the step run in every run for nothing the person asked
 * -- live run `run-musp4h2f-72e8ed99` pressed such an Add to cart again in its
 * next test.
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

/** The steps from `step` to `through` (or `step` alone), in the draft's order. */
function spanOf(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep, through: AutomationStudioFlowDraftStep | undefined): AutomationStudioFlowDraftStep[] {
  const last = through ?? step;
  const [from, to] = [step.position, last.position].sort((one, other) => one - other) as [number, number];
  return steps.filter((each) => each.position >= from && each.position <= to);
}
