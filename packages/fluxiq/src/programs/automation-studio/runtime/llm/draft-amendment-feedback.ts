// An amendment that changed nothing, and what the model is told about it.
//
// The model edits the draft with amendments: one step number and one word
// (`../flow-draft/amendment/`). The module that applies them already computes
// a precise refusal for every amendment that changed nothing -- there is no
// step at that number, the step already says that, there is no position to move
// it to, a routing word named a step the Flow does not contain -- and until
// 2026-09-26 the loop read only how many had landed and dropped every reason on
// the floor.
//
// What that cost. `run-muhubegx-9469de5e` made nine `amend_draft` decisions.
// Seven of them changed nothing at all, five of those consecutively, and each
// time the model was asked again with no word about why its edit had not taken.
// It went on to complete with a Flow whose extraction carried one filter
// condition for a four-clause instruction and no pagination follow-through.
// Seven paid decisions were spent on edits the model had no way of knowing had
// failed, and the reason for every one of them had been computed and discarded.
//
// So a refused amendment is now told to the model before it is asked again, the
// same way a refused completion is (`./evidence-loop.ts`): one evidence entry,
// under this module's own tool id, naming each refused amendment by the step
// number the model wrote and a reason from a closed set. Codes, sentences Core
// wrote, and integers -- never a value from a page. There is nothing else in a
// refusal: it is Core's own bookkeeping about a number.
//
// **It does not guess.** A refusal names the step the model named, and nothing
// here proposes the step it might have meant instead. A step leaves a Flow
// because the model decided it should, and an amendment the loop reinterpreted
// would be an edit -- perhaps a removal -- that nobody decided.
//
// **It does say what comes next, by number, where the draft shows it.** Live run
// 37 (`run-muq5v4zg-39182b58`) filtered its friend requests correctly as step
// 13, sent `13 repeat over 13` with no press anywhere in the draft, was told
// the rule in general (`over_not_before`), then reran step 13 unchanged three
// times (`changes_nothing`) until the round stopped -- it never pressed a
// Confirm. Both refusals were about a listing whose rows were right and a loop
// that lacked its act. So a refusal about a listing carries `next`: the press
// after it to put the repeat on, or, when there is none, that the act on one
// row it kept comes first, with the repeat to send then. Nothing is changed on
// the model's behalf; `next` is information, in the draft's own numbers.
//
// **A listing after its act is moved first.** Live run `run-murz83zy-5030820f`
// (R8) pressed Amara's Confirm as step 9 and ran the filtered listing only at
// step 18, then sent `9 repeat over 18` five decisions running and once more in
// round 1. Each refusal told it to send `{step: <act>, change: repeat, over:
// <listing>}` -- exactly what it had sent -- and `next` looked for a press
// *after* the listing and said there was none. Nothing pointed to `reorder`.
// So when the repeat was put on a working act and `over` names a listing after
// it, `next` says to move the listing to the act's place and then repeat the
// act. Every number in one decision names the step as the draft shown numbered
// it, and the draft is renumbered once, after the whole decision
// (`../flow-draft/amendment/shown-numbering.ts`, t195 w45), so `18 reorder to 9`
// goes with `9 repeat over 18`, and a `through` keeps the number shown. Until
// then a reorder renumbered at once and the telling said `10 repeat over 9`:
// live run `run-musr9pv3-f4bf6256` wrote its numbers that way and once the
// other, and a repeat landed on its listing (`15 reorder to 14, 15 repeat over 14`).
//
// **A repeat a decision's moves broke is said, not left.** That stray repeat,
// over the Confirm after the listing, stood from decision 0056 to the end of
// the round, and the model was never told. A decision that moves a step now
// takes off every repeat that can no longer run (`repeat_taken_off`,
// `../flow-draft/amendment/repeat-revalidation.ts`), and the answer says which
// step's repeat over which step was taken off, and why, in the numbers the
// model wrote and, where they changed, the ones it reads next. It is not an
// amendment of the model's that changed nothing, so it is never marked
// repeated and the answer does not call it one.
//
// **The attempt a rerun replaced names its replacement.** Live run
// `run-musp474o-e0ed7432` reran its listing at step 6 with a fixed where, was
// shown the withdrawn attempt as step 7, and reran "step 7" with the same where
// three times; each refusal said only that the argument had already run, never
// that step 6 held it, and the round stopped. A refusal about such an attempt
// carries `replacedBy` (`../flow-draft/amendment/replaced-attempt.ts`), and
// `next` says it: step 7 is the attempt step 6's rerun replaced, so change
// step 6.
//
// **Every refusal says what is still to do (live run `run-musp4h2f-72e8ed99`).**
// Round 0 bound the `target` of its size press, as the draft showed it, and was
// told to "name a parameter it already has, as the draft shows it" -- which it
// had. It then re-sent `keep 9` and `drop 10`, refused `already_in_flow` and
// `already_out` with no word of what was left, until the round stopped
// `unusable_decisions` with four acts not done. Only `act_already_named` named
// them. So every refusal's `next` ends with the acts the checklist still shows
// not done, from the one source that refusal used; and a bind of the control a
// step acted on (`control`) is told as what it is: a press has no value to
// vary.
//
// **A step not run yet is run first (t174-w108, Cause 6).** A `no_such_step`
// for the number right after the draft's last step is the number a run with
// add true would take, so its `next` says to run it first.
//
// **A moved act names the step it left.** Round 2 moved a3 off the 3-Pack's Add
// to cart; that press stayed in the Flow with no act and was pressed again in
// the next test. The move stands -- it is applied, never refused -- and the
// answer says which step the act left, that it now does no act, and that it is
// pressed in every run unless dropped (`moved`, `../flow-draft/amendment/apply.ts`).
//
// **A step of the Flow keeps its way to its page (live run
// `run-muwao5n4-44977b2a`, D2-1).** Decision 0030 dropped both navigations to
// the friend-requests page with the listing that ran there still in the Flow,
// and was told "applied 7". A drop that leaves a kept step no way to its page
// is now refused (`strands`), and a step the decision newly left after a step
// that does not bring it to its page is said beside the applied decision
// (`../flow-draft/amendment/strand-check.ts`). The refused drop is
// `strands_a_step`, with `next` naming the step it would have stranded. The
// step left unreached is not a refusal and never travels as one: it is
// `unreached`, beside `refused` as `moved` is, each entry with a `note` saying
// which step before it does not bring it to its page and which steps did.
//
// **A step that did not work has no result to stand (live run
// `run-mustvzvg-99695308`, C4).** The read rerun as step 8 was refused
// `malformed_handle` and never ran; four identical reruns of it were each
// refused `changes_nothing` in words written for a read that ran -- "its result
// stands as shown ... go on to the act" -- and the model resent the same call
// until the round stalled. A `changes_nothing` about a step that did not work
// now says that exact call was refused before and would be refused again,
// names the step's own codes and the call whose result says what was refused
// (code-shaped words only, never a page's), and says to change exactly that,
// with `null` to remove a key, or to gather new evidence.
//
// **Every refusal names its way out (W2, refusal churn).** Many reasons got a
// `next` only when a checklist existed, `no_such_step` only for the next free
// number, and `already_so`, `no_such_position`, `run_by_the_loop`,
// `not_a_kept_step`, `did_not_work`, `act_on_a_read`, the `bind_*` reasons and
// `rerun_holds_binding` often none; a refusal with no way out is resent. Every
// reason now has a `next` in the draft's own numbers naming the amendment or
// call to send instead, with or without a checklist (`fallback`, below), and
// ends with the acts the checklist still shows not done when there is one.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftAmendmentRefusal, AutomationStudioFlowDraftUnreachedStep } from "../flow-draft/index.ts";

/** The evidence entry a refused amendment's feedback arrives under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID = "core.amendment_check";

/**
 * What the entry is recorded and shown under, and the issue a round that
 * stalled on amendments refused again is recorded under (`./decision-handlers/amendment.ts`).
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENTS_REFUSED_CODE = "llm_evidence_loop.draft_amendments_refused";

/**
 * What each reason means, in Core's words.
 *
 * A code alone says which refusal it was to a reader who already knows the
 * grammar; the model is being asked to correct the edit, so it is told what the
 * word means as well. Only the reasons a decision actually met are sent, so the
 * commonest entry carries one sentence. Exhaustive by type, which is what makes
 * a reason added to the draft's set fail to compile until it is explained here.
 */
const REFUSAL_REASONS: Record<AutomationStudioFlowDraftAmendmentRefusal["reason"], string> = {
  no_such_step: "There is no step at that number. Step numbers are the ones the draft entry shows: every number in one decision is read against that draft, which is renumbered once, after the whole decision. An add amendment includes an existing step; it does not create a new action from input. To author a missing action, issue a new tool_call using an offered tool and its input schema, with add:true and the intended act when applicable. Use that call's resulting draft step number for later amendments.",
  already_so: "The step already says that, and the amendment carried nothing else to change.",
  no_such_position: "There is no position to move a step to at that number.",
  run_by_the_loop: "A rerun is carried out by the loop rather than written onto the draft, and this one was not carried out. A rerun needs an input saying what changes in the step's argument, its step's action has to be one still offered, and only the first rerun of a decision runs -- ask for one, and do the rest in the next decision.",
  no_step_before_it: "This change was about the step before the one it named, and there is none. Name the step it is about: check for only_if, over for repeat.",
  over_not_before: "repeat goes on the act that is done to each row -- the press, or the first of the steps done to a row -- never on the step that lists the rows. over names that listing, and it must come before the act: send {\"step\": <the act>, \"change\": \"repeat\", \"over\": <the listing>}. When the listing comes after the act, sending that again is refused again: move the listing before the act with reorder, {\"step\": <the listing>, \"change\": \"reorder\", \"to\": <the act>}, and send the repeat beside it in the same decision -- every number in one decision names the step as the draft entry shows it, and the draft is renumbered once, after the whole decision. When no step does the act to a row yet, do it to one row the listing kept and add it first: there is nothing to repeat until then.",
  not_a_kept_step: "It named a step the Flow does not contain -- one dropped, marked exploratory, or that did not work, or the attempt a rerun replaced. Routing describes the Flow, so it may only name steps the Flow runs; an attempt a rerun replaced is changed through the step that replaced it.",
  changes_nothing: "This identical request was not sent again on the same state. Inspect the previous result: only if it actually returned the intended rows should you go on to the act; otherwise correct the failed/refused argument or gather new evidence. A rerun patch merges over the step's argument: an omitted key remains, and null explicitly removes an unneeded key. Required parameters still need valid values. A step whose disposition is did_not_work was refused and never ran, so it has no result to go on with, and the same call would be refused again: change exactly what its refusal named.",
  did_not_work: "That step did not work, so it is already out of the Flow and nothing needs dropping or keeping about it. The only amendment that changes it is rerun with a corrected argument; or run the action again as a new call. If the Flow does not need it, leave it alone.",
  already_in_flow: "That step is already in the Flow (inResult: true). Every step with inResult true is part of the finished Flow as it stands, so there is nothing to confirm: do not keep it again. Run what the Flow still lacks, or complete.",
  already_out: "That step is already out of the Flow (inResult: false), so dropping it again changes nothing. Leave it, or keep it to put it back.",
  act_on_a_read: "That step only reads -- a listing, a look or another read that changes nothing -- so it does no act: the rest of your change to it was made, but the act was not recorded on it. An act is done by the step that changes something, such as the press: name the act there. To do it to every item a listing kept, add the listing without act, add the press with act, then repeat the press over the listing.",
  act_already_named: "That step already names that act or choice (act beside it in the draft), so naming it again changes nothing. If the acts checklist shows the act done, nothing is left to do for it: go on with the acts and choices still not done. Otherwise its todo says why and its step says which step: correct exactly that fault rather than naming it again. A singular quantity is set with the item's quantity control, not a repeat over a list. Remove a mistaken repeat explicitly with unrepeat on the step that carries it; keep and keep with act preserve intentional repeats.",
  bind_not_a_binding: "bind only lifts values into bindings: every value its input sets has to be a binding form, {\"$input\": <name>, \"test\": <value>} or {\"$row\": <field>}, and parameter names the first one that is not. To change a value to another concrete value, rerun the step with it instead.",
  bind_new_key: "bind lifts a value the step already has -- one it typed, or a read's condition -- into a binding; it never adds one, and parameter names a key the step ran with no value at. When it names the control the step acted on, such as a press's target, there is no value to bind: a press has no value to vary, and its control is found by its words each run, so leave that step as it is. Otherwise bind only a parameter bindable lists beside the refusal: the values of its input the step ran with as shown. An empty bindable means the step has no value to bind.",
  bind_row_outside_loop: "{\"$row\": <field>} is the field of the row a repeat is on, and this step is in no repeat, so it has no row. Put the step in a repeat over the listing first (repeat, with over the listing), or bind the value as {\"$input\": <name>, \"test\": <value>} when it is the same for every row.",
  bind_malformed: "That binding is not one bind can write. {\"$input\": <name>, \"test\": <value>}: name starts with a lowercase letter, then letters and digits, at most 32, never item, and test is a value, not null. {\"$row\": <field>}: field is one of the row's own field names, with no dot or space. Nothing else may sit beside either. {\"$step\": <n>, \"output\": <output id>}: n is a step before this one that worked and is not withdrawn, output an output its node declares, and \"path\" (optional) field names of a record output, never a list index.",
  rerun_holds_binding: "A bound step runs only in the Flow. Rerun patches merge: omitted bound parameters remain bound. Replace every binding with a concrete value, or null-remove an unneeded parameter where the node schema permits removal. If evidence is sufficient to author a new written step, use a new tool_call to the offered core.run_node with input.write:true and declared parameters/consequences. That does not convert or remove the old recorded step, prove an act performed, or bypass permissions and whole-Flow testing. write:true on a recorded step's rerun does not convert it to written.",
  strands_a_step: "That drop was not made: the step is the only step of the Flow that brings the page to where a step still in the Flow acted, so without it that step would run on another page. Keep it, or drop the step it brings there as well when the Flow does not need that step.",
  settings_rewrite_run: "That amendment was not made: its settings would change what the step ran with (its target, text or value), and a step is what it ran with. To act on another control or with another value, run that as a new call with add true and its act; to correct this step's own argument, rerun it.",
  second_copy: "That step was not added to the Flow: copyOf names the step of the Flow that already does it -- the same press on the same page, or a read of the same list with nothing changed in between -- and the Flow does each step once. Leave this step out and go on from the step copyOf names; an act this step was meant for belongs on that step.",
  repeat_taken_off: "This is not an amendment of yours that changed nothing: it is a repeat Core took off after this decision's moves left it unable to run -- the step it repeated over no longer runs before it, or the step its span ran through now runs before it. That step now runs once, in order. next names the step, the step it repeated over and why; if the step should still repeat, send the repeat again with the listing before the act, in the numbers the draft now shows."
};

const AMENDMENT_FEEDBACK_INSTRUCTION = "The listed amendments changed nothing, for the reason beside each one, and the draft is as it was for them. "
  + "Amend a step that exists, do something else, or complete. A decision whose amendments all change nothing counts toward stopping this exploration.";

// Said beside any refusal: how the numbers in a decision are read
// (`../flow-draft/amendment/shown-numbering.ts`, t195 w45).
const NUMBERING_INSTRUCTION = " Every step number in one decision names the step as the draft entry you were shown numbered it, and the draft is renumbered once, after the whole decision: the next draft entry shows the new numbers.";

// Said when a decision's moves took a repeat off (`repeat_taken_off`), which
// no amendment of the model's asked for (header, run `run-musr9pv3-f4bf6256`).
const TAKEN_OFF_INSTRUCTION = " An entry whose reason is repeat_taken_off is a repeat Core took off after this decision's moves, not one of your amendments: next beside it says which step's repeat over which step was taken off, and why.";

/** What an amendment that put the draft back exactly as it stood is recorded and shown under. */
// Said when the decision newly left a step after one that does not bring it to its page (`unreached`).
const UNREACHED_INSTRUCTION = " unreached is not a refusal: those amendments were applied, and each entry names a step of the Flow that now runs after a step that does not leave the page it acted on, so when the Flow runs it runs on another page; its note says how to give it its way back.";

/** What an answer whose amendments all landed, one of them leaving a step without its way to its page, is shown under. */
const STEP_UNREACHED_CODE = "llm_evidence_loop.draft_step_unreached";

const AMENDMENT_UNDONE_CODE = "llm_evidence_loop.draft_amendment_undone";

/** What an answer whose amendments all landed, one of them moving an act, is shown under. */
const ACT_MOVED_CODE = "llm_evidence_loop.draft_act_moved";

const MOVED_INSTRUCTION = " moved names each step an act was moved off: the act now stands on the step to, and the step it left does no act yet is still in the Flow. Drop it unless the Flow needs it for something else.";

// Said once a refusal repeats, because the model had already been told the
// reason and sent the same edit anyway: everything-store round 2 sent one set
// of five refused amendments four decisions running.
const REPEATED_INSTRUCTION = " Every refusal marked repeated was refused for the same reason before, and it will be refused again however often it is sent: stop sending it.";

// Said whenever a refusal carries `next`, so the model reads it as the step to
// take rather than one more explanation (live run 37).
const NEXT_INSTRUCTION = " next, beside a refusal, is what to do instead, in the draft's own step numbers: do that rather than sending the refused amendment again.";

const UNDONE_INSTRUCTION = " These amendments put the draft back exactly as it stood at iteration sameDraftAsIteration, so the Flow is no different from then."
  + " Decide once whether the step belongs in the Flow and leave it: toggling a step counts toward stopping this exploration.";

/**
 * What the model reads after an amendment decision the draft refused, before it
 * is asked again: which amendments changed nothing and why, how far the draft
 * reaches, and how close the loop is to stopping. Every refusal and every
 * position is listed: until 2026-09-30 the entry listed at most 16 refusals and
 * the newest 32 positions (user: "Remove ANY AND ALL LIMITS ON THE NUMBER OF
 * ELEMENTS PASSED TO MODEL").
 *
 * `steps` is the draft as it now stands, read for the positions it has and
 * nothing else, so the positions reported are the ones an amendment would
 * actually be looked up against rather than a range assumed from a count.
 */
export function automationStudioLlmEvidenceDraftAmendmentFeedback(input: {
  /** `repeated` on a refusal this build already gave for the same step and reason (`./evidence-loop/amendment-memory.ts`). */
  refusals: readonly (AutomationStudioFlowDraftAmendmentRefusal & { repeated?: boolean })[];
  /** How many of the same decision's amendments did land. */
  applied: number;
  steps: readonly AutomationStudioDraftAmendmentFeedbackStep[];
  stepsWithoutProgress: number;
  maxStepsWithoutProgress: number;
  /** The iteration whose draft the applied amendments put back exactly, when they did. */
  sameDraftAsIteration?: number;
  /**
   * The acts and choices the checklist shows not done, by id, when the draft
   * has a checklist (`./loop-configuration.ts`, `draft.actsMissing`): what an
   * `act_already_named` about a done act is told to go on with, and what every
   * other refusal ends its `next` with.
   */
  actsNotDone?: readonly string[] | undefined;
  /**
   * Each act one of the decision's amendments moved off a step that it left in
   * the Flow with no act (`../flow-draft/amendment/apply.ts`, `moved`).
   */
  moved?: readonly { act: string; from: number; to: number }[] | undefined;
  /**
   * Each step of the Flow the decision newly left after a step that does not
   * bring it to its page (`../flow-draft/amendment/strand-check.ts`):
   * information, never a refusal.
   */
  unreached?: readonly AutomationStudioFlowDraftUnreachedStep[] | undefined;
}): JsonObject {
  const refused = input.refusals.map((refusal) => {
    const next = wayOut(refusal, input.steps, input.actsNotDone);
    return {
      step: refusal.step,
      reason: refusal.reason,
      // A refused bind names its parameter, in the model's own key names.
      ...(refusal.parameter === undefined ? {} : { parameter: refusal.parameter }),
      ...(refusal.copyOf === undefined ? {} : { copyOf: refusal.copyOf }),
      // What the step offers instead, from the step the bind examined (`../flow-draft/bindable/paths.ts`, run B7).
      ...(refusal.reason === "bind_new_key" && refusal.bindable ? { bindable: refusal.bindable } : {}),
      // A repeat Core took off was never sent, so it is never sent again (header).
      ...(refusal.repeated && refusal.reason !== "repeat_taken_off" ? { repeated: true } : {}),
      next
    };
  });
  // Entries that are only repeats Core took off refuse no amendment of the model's (header).
  const amendmentsRefused = refused.some((refusal) => refusal.reason !== "repeat_taken_off");
  const repeatsTakenOff = refused.length > 0 && !amendmentsRefused;
  const undone = input.sameDraftAsIteration !== undefined;
  const moved = (input.moved ?? []).map((move) => ({ step: move.from, act: move.act, to: move.to, note: movedNote(move) }));
  const unreached = (input.unreached ?? []).map((entry) => ({ step: entry.step, after: entry.after, reachedBy: [...entry.reachedBy], note: unreachedNote(entry) }));
  // An answer that is only about a moved act, or a step left unreached, refused nothing: it is told as that.
  const onlyMoved = !refused.length && !undone && (moved.length > 0 || unreached.length > 0);
  const met = [...new Set(refused.map((refusal) => refusal.reason))];
  const reasons: JsonObject = {};
  for (const reason of met) reasons[reason] = REFUSAL_REASONS[reason];
  return {
    ok: onlyMoved,
    code: onlyMoved ? (moved.length ? ACT_MOVED_CODE : STEP_UNREACHED_CODE) : refused.length || !undone ? AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENTS_REFUSED_CODE : AMENDMENT_UNDONE_CODE,
    refused,
    ...(moved.length ? { moved } : {}),
    ...(unreached.length ? { unreached } : {}),
    applied: input.applied,
    steps: input.steps.length,
    // Only when the model named a step that is not there: the numbers that are.
    ...(met.includes("no_such_step") ? { positions: existingPositions(input.steps) } : {}),
    reasons,
    stepsWithoutProgress: input.stepsWithoutProgress,
    maxStepsWithoutProgress: input.maxStepsWithoutProgress,
    ...(undone ? { sameDraftAsIteration: input.sameDraftAsIteration! } : {}),
    instruction: ((amendmentsRefused || (!undone && !onlyMoved && !repeatsTakenOff) ? AMENDMENT_FEEDBACK_INSTRUCTION : "")
      + (refused.length ? NUMBERING_INSTRUCTION : "")
      + (refused.some((refusal) => refusal.reason === "repeat_taken_off") ? TAKEN_OFF_INSTRUCTION : "")
      + (refused.some((refusal) => refusal.repeated) ? REPEATED_INSTRUCTION : "")
      + (refused.some((refusal) => refusal.next) ? NEXT_INSTRUCTION : "")
      + (undone ? UNDONE_INSTRUCTION : "")
      + (moved.length ? MOVED_INSTRUCTION : "")
      + (unreached.length ? UNREACHED_INSTRUCTION : "")).trim()
  };
}

/**
 * What the feedback reads of a draft step. The position always; from the loop,
 * which passes the draft itself, also whether the step changes something
 * (`effect`), whether that worked, and whether it is in the Flow -- enough to
 * tell a listing from a press. A step given as a position alone still gets a
 * `next` by its number, from the reason alone (`fallback`).
 *
 * The rest is what tells a step that did not work from one that ran, read
 * exactly as the draft entry and the amendments read it (`../flow-draft/entry.ts`,
 * `shownDisposition`; `../flow-draft/amendment/apply.ts`), and what the step's
 * own call said of it: its codes and call id, quoted only when code-shaped
 * (`coded`), never a value from a page. `resultReason` is read when the draft
 * step carries it; today's draft records only `resultCode` (`../evidence-loop.ts`).
 */
type AutomationStudioDraftAmendmentFeedbackStep = {
  position: number;
  id?: string;
  effect?: string;
  effectApplied?: boolean;
  disposition?: string;
  routing?: { kind: string; over?: string };
  proposes?: boolean;
  written?: true;
  checkedCandidate?: object;
  resultCode?: string;
  resultReason?: string;
  callId?: string;
};

/**
 * What to do instead of a refused amendment about a listing, in the draft's
 * numbers, or nothing when the refusal is not about one.
 *
 * `over_not_before`: the listing is whichever of the two steps named only
 * reads -- `over`, or the step the repeat was put on (`13 repeat over 13`).
 * `changes_nothing`: about a step that did not work, that the same call would
 * be refused again (header, C4); otherwise the step rerun unchanged, when it
 * only reads; when an act after it already repeats over it, that a read after
 * the act is a new step.
 */
function nextStep(refusal: AutomationStudioFlowDraftAmendmentRefusal, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): string | undefined {
  const at = (position: number | undefined) => position === undefined ? undefined : steps.find((step) => step.position === position);
  if (refusal.reason === "act_already_named" && refusal.act?.endsWith(".quantity") && at(refusal.step)?.routing?.kind === "repeat") {
    return `Step ${refusal.step} names ${refusal.act} but repeats over other items. If the quantity checklist says quantity_is_a_repeat, send {"step": ${refusal.step}, "change": "unrepeat"}, then set this item's quantity with its own quantity control and go on with missing acts. Do not repeat the add over a list to set a singular quantity.`;
  }
  const reads = (step: AutomationStudioDraftAmendmentFeedbackStep | undefined): step is AutomationStudioDraftAmendmentFeedbackStep => step?.effect !== undefined && step.effect !== "mutate";
  if (refusal.reason === "over_not_before") {
    const act = at(refusal.step);
    const named = at(refusal.over);
    if (act?.effect === "mutate" && act.effectApplied !== false && reads(named) && named.position > act.position) return listingFirst(act, named.position, refusal.through);
    const listing = [at(refusal.over), at(refusal.step)].find(reads);
    return listing ? `Step ${listing.position} is the listing, so the repeat cannot go on it. ${rowAct(listing.position, steps)}` : undefined;
  }
  if (refusal.reason === "changes_nothing") {
    const listing = at(refusal.step);
    // A step that did not work never ran: it has no result to stand (header, C4).
    if (listing && didNotWork(listing)) return refusedAgain(listing);
    if (!reads(listing)) return undefined;
    const loop = repeatOver(listing, steps);
    if (loop) return readAfterAct(listing.position, loop.position);
    return `Step ${listing.position}'s identical request was not sent again. Inspect the previous result: only if it actually returned the intended rows should you go on to the act; otherwise correct the failed/refused argument or gather new evidence. If those rows are right: ${rowAct(listing.position, steps)}`;
  }
  return undefined;
}

/**
 * The step after the listing whose repeat is already over it, or nothing. The
 * draft names a step in routing by its id, or `p<position>` for a step built
 * without one (`../flow-draft/routing.ts`, `automationStudioFlowDraftStepId`).
 */
function repeatOver(listing: AutomationStudioDraftAmendmentFeedbackStep, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): AutomationStudioDraftAmendmentFeedbackStep | undefined {
  const name = listing.id ?? `p${listing.position}`;
  return steps.find((step) => step.position > listing.position && step.routing?.kind === "repeat" && step.routing.over === name);
}

/**
 * What an unchanged rerun of a listing an act already repeats over needs
 * instead (live run `run-mux6nxst-c9bca37c`, D3-2): the loop is in place, a
 * rerun only replaces the listing, and a read of the rows after the act is a
 * new step, run where the act left the page and added after it. Nineteen
 * decisions of that run reran step 6 unchanged, each told to put the repeat on
 * step 7, which already carried it.
 */
function readAfterAct(listing: number, act: number): string {
  return `Step ${act} already repeats over step ${listing}, so the loop is in place: rerunning step ${listing} only replaces it and never adds a step after step ${act}. A read of the rows after the act is a new step: with the act done on the page, run the read there as a new call ("core.run_node" with add true) so it is added after step ${act}, with a where keeping the rows the instruction asks for -- or write it with write true.`;
}

/**
 * What a repeat on the act at `act.position` over the listing at `listing`,
 * after it, needs instead: the listing moved to the act's place, and the
 * repeat beside it, both in the numbers the draft shows. Every number in one
 * decision names the step as the draft shown numbered it, and the draft is
 * renumbered once, after the whole decision
 * (`../flow-draft/amendment/shown-numbering.ts`), so the act, the listing and
 * a `through` keep the numbers shown.
 */
function listingFirst(act: AutomationStudioDraftAmendmentFeedbackStep, listing: number, through: number | undefined): string {
  const at = act.position;
  const span = through === undefined || through === listing ? undefined : through;
  const add = act.disposition === "kept" ? "" : `add step ${at} with its act, then `;
  const repeat = `{"step": ${at}, "change": "repeat", "over": ${listing}${span === undefined ? "" : `, "through": ${span}`}}`;
  return `Step ${listing} is the listing, and it comes after step ${at}, the act the repeat was put on: over must come before the act, so the same repeat is refused however often it is sent. Move the listing before the act: ${add}send {"step": ${listing}, "change": "reorder", "to": ${at}} and ${repeat} in one decision. Every number in one decision names the step as this draft numbers it, and the draft is renumbered once, after the whole decision.`;
}

/**
 * The act a loop over the listing at `listing` needs: the first step after it
 * that changed something, with the repeat to put on it, or -- when there is
 * none -- that the act on one row comes first.
 */
function rowAct(listing: number, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): string {
  const press = steps.find((step) => step.position > listing && step.effect === "mutate" && step.effectApplied !== false);
  const repeat = (act: string): string => `{"step": ${act}, "change": "repeat", "over": ${listing}}`;
  if (!press) {
    return `No step after step ${listing} does anything to a row yet, so there is nothing to repeat. A loop over rows needs the act done once first: do it to one row step ${listing} kept -- press that row's own control, never one on a row it left out -- with add true and its act, then send ${repeat("<that press>")}.`;
  }
  const add = press.disposition === "kept" ? "" : `add step ${press.position} with its act, then `;
  return `Step ${press.position} is the first step after step ${listing} that changes something. If it is the act done to one row step ${listing} kept, the repeat goes on it: ${add}send ${repeat(String(press.position))}.`;
}

/**
 * What to do about a drop refused because it would strand a step of the Flow
 * from its page, or nothing when the refusal is not one (header, D2-1).
 */
function reach(refusal: AutomationStudioFlowDraftAmendmentRefusal): string | undefined {
  if (refusal.reason !== "strands_a_step" || refusal.strands === undefined) return undefined;
  const kept = refusal.strands;
  return `Step ${refusal.step} stays in the Flow: it is the only step of the Flow that brings the page to where step ${kept} acted, and step ${kept} is still in the Flow. Leave step ${refusal.step} in, or drop step ${kept} too if the Flow does not need it.`;
}

/**
 * What the model is told of a step the decision newly left after one that does
 * not bring it to its page (header, D2-1): the step before it now, and the
 * steps that moved the page there while exploring, or that none did.
 */
function unreachedNote(entry: AutomationStudioFlowDraftUnreachedStep): string {
  const step = entry.step;
  const by = entry.reachedBy;
  const way = by.length === 0
    ? `No step in the draft moved the page to where step ${step} acted: run the step that gets there with add true, before step ${step}.`
    : `Step${by.length > 1 ? "s" : ""} ${by.join(", ")} moved the page to where step ${step} acted while exploring: keep ${by.length > 1 ? "the one it needs" : `step ${by[0]}`} in the Flow and put step ${step} after it with reorder.`;
  return `Step ${step} is in the Flow, but the step before it now, step ${entry.after}, does not leave the page where step ${step} acted, so when the Flow runs step ${step} runs on another page. ${way}`;
}

/**
 * What a repeat taken off after a decision's moves was, and why, or nothing
 * when the entry is not one (header, `run-musr9pv3-f4bf6256`): the step, the
 * step it repeated over -- and the one its span ran through when that broke
 * -- in the numbers the model wrote, with the numbers the draft now shows
 * where the moves changed them. A repeat that ran again while its last step
 * succeeded was over no step, and is told by that step (`takenOffWhile`).
 */
function takenOff(refusal: AutomationStudioFlowDraftAmendmentRefusal): string | undefined {
  if (refusal.reason === "repeat_taken_off" && refusal.over === undefined) return takenOffWhile(refusal);
  if (refusal.reason !== "repeat_taken_off" || refusal.over === undefined || refusal.takenOff === undefined) return undefined;
  const step = refusal.step;
  const over = refusal.over;
  const span = refusal.takenOff === "span_broken" && refusal.through !== undefined ? refusal.through : undefined;
  const why = span === undefined
    ? `after this decision's moves step ${over} runs after step ${step}, and a repeat's over has to run before the step it repeats`
    : `after this decision's moves step ${span} runs before step ${step}, so the span from step ${step} through step ${span} no longer holds together`;
  const now = [
    refusal.now === undefined ? undefined : `step ${step} is now step ${refusal.now}`,
    refusal.overNow === undefined ? undefined : `step ${over} is now step ${refusal.overNow}`,
    span === undefined || refusal.throughNow === undefined ? undefined : `step ${span} is now step ${refusal.throughNow}`
  ].filter((part): part is string => part !== undefined);
  const renumbered = now.length ? ` In the draft you read next, ${now.join(", and ")}.` : "";
  return `Step ${step}'s repeat over step ${over}${span === undefined ? "" : `, through step ${span},`} was taken off: ${why}. It now runs once, in order.${renumbered} If it should still repeat, send the repeat again with the listing before the act, in the numbers the draft now shows.`;
}

/**
 * What a repeat that ran its span again while its last step succeeded was,
 * once a decision's moves broke its span (read-list design, S2): the step and
 * the last step it ran while, which now runs before it, with the numbers the
 * draft now shows where the moves changed them.
 */
function takenOffWhile(refusal: AutomationStudioFlowDraftAmendmentRefusal): string | undefined {
  if (refusal.takenOff !== "span_broken" || refusal.through === undefined) return undefined;
  const step = refusal.step;
  const last = refusal.through;
  const now = [
    refusal.now === undefined ? undefined : `step ${step} is now step ${refusal.now}`,
    refusal.throughNow === undefined ? undefined : `step ${last} is now step ${refusal.throughNow}`
  ].filter((part): part is string => part !== undefined);
  const renumbered = now.length ? ` In the draft you read next, ${now.join(", and ")}.` : "";
  return `Step ${step}'s repeat while step ${last} succeeds was taken off: after this decision's moves step ${last} runs before step ${step}, so the span from step ${step} through step ${last} no longer holds together. It now runs once, in order.${renumbered} If it should still repeat, send the repeat again on the span's first step with while naming its last step, in the numbers the draft now shows.`;
}

/**
 * What to do instead of amending or rerunning the attempt a rerun replaced, or
 * nothing when the refusal is not about one (header, `run-musp474o-e0ed7432`).
 * Like every refusal's, it ends with what the checklist still shows not done
 * when there is one (`wayOut`).
 */
function replacedAttempt(refusal: AutomationStudioFlowDraftAmendmentRefusal): string | undefined {
  if (refusal.replacedBy === undefined) return undefined;
  const by = refusal.replacedBy;
  return `Step ${refusal.step} is the attempt step ${by}'s rerun replaced: it is listed only as the record of what was replaced, and nothing changes it, so change step ${by} instead -- amend it, or rerun it with what still differs. When step ${by} already holds the argument you meant, its result stands as shown: go on from it.`;
}

/**
 * What a step not added because a step of the Flow already does it is told, or
 * nothing when the refusal is not one (`../flow-draft/second-copy.ts`, live run
 * `run-murwdp4f-35f976d2`, C9): the step that does it, and which kind of copy
 * it was, read off that step's effect where the draft says it.
 */
function secondCopy(refusal: AutomationStudioFlowDraftAmendmentRefusal, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): string | undefined {
  if (refusal.reason !== "second_copy" || refusal.copyOf === undefined) return undefined;
  const effect = steps.find((step) => step.position === refusal.copyOf)?.effect;
  const what = effect === "mutate" ? "the same press on the same page"
    : effect === undefined ? "the same press on the same page, or a read of the same list with nothing changed in between"
      : "a read of the same list with nothing changed in between";
  return `Step ${refusal.step} was not added to the Flow: step ${refusal.copyOf} already does this (${what}); the Flow does each step once.`;
}

/**
 * What to do instead of naming again an act the checklist already shows done,
 * or nothing when the act is still to do or there is no checklist to read.
 *
 * Live run `run-muqiojz4-04a7a8fc` sent `10 keep act a2.quantity` five
 * decisions running, each refused `act_already_named`, while the checklist
 * showed `a2.quantity` done and `a3` still to do: the reason told it only what
 * to do about an act *not* done, and the round ended. So the refusal says the
 * act needs nothing more, and names, from the checklist, what does.
 */
function actDone(refusal: AutomationStudioFlowDraftAmendmentRefusal, actsNotDone: readonly string[] | undefined): string | undefined {
  if (refusal.reason !== "act_already_named" || refusal.act === undefined || actsNotDone === undefined) return undefined;
  if (actsNotDone.includes(refusal.act)) return undefined;
  return `Step ${refusal.step} already names ${refusal.act}, and the acts checklist shows ${refusal.act} done, so nothing is left to do for it: do not name it again.`;
}

/**
 * What to do instead of amending a step that has not run yet: a refusal of the
 * number right after the draft's last step, which is the number the step would
 * take, says to run it first with add true. Nothing for any other number,
 * which `fallback` answers.
 *
 * Run `run-musp8nz1-dbd3905a` (t174-w108, Cause 6) had steps 1-13 and sent
 * `{step 14, add, act a1}` for an Add to cart press it had not run. It was told
 * `no_such_step` and the positions, but not that a step enters the draft by
 * running; it ran the press only in the decision after.
 */
function notRunYet(refusal: AutomationStudioFlowDraftAmendmentRefusal, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): string | undefined {
  if (refusal.reason !== "no_such_step") return undefined;
  const free = lastPosition(steps) + 1;
  if (refusal.step !== free) return undefined;
  return `There is no step ${free} yet: a step enters the draft only by running. Run that action first as a call with add true (and its act, if it does one), and it becomes step ${free}; do not amend it before it has run.`;
}

/**
 * What a refusal is told to do instead (header, W2): the most precise answer
 * the refusal and the draft allow, or the reason's own way out by number
 * (`fallback`), ending with the acts the checklist still shows not done -- the
 * one source `act_already_named` reads -- when there is one. Not for an act
 * named again that is still to do: its todo is the fault, and naming the
 * checklist would send it back to the same act.
 *
 * Live run `run-musp4h2f-72e8ed99` re-sent `keep 9` and `drop 10` three
 * decisions running, refused `already_in_flow` and `already_out` with no word
 * of the four acts still to do, and bound a press's `target` four times.
 */
function wayOut(refusal: AutomationStudioFlowDraftAmendmentRefusal, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[], actsNotDone: readonly string[] | undefined): string {
  const lead = reach(refusal) ?? takenOff(refusal) ?? replacedAttempt(refusal) ?? secondCopy(refusal, steps) ?? nextStep(refusal, steps) ?? actDone(refusal, actsNotDone)
    ?? notRunYet(refusal, steps) ?? pressBound(refusal, actsNotDone !== undefined) ?? fallback(refusal, steps, actsNotDone);
  if (actsNotDone === undefined) return lead;
  if (refusal.reason === "act_already_named" && refusal.act !== undefined && actsNotDone.includes(refusal.act)) return lead;
  return `${lead} ${checklistLeft(actsNotDone)}`;
}

/**
 * A bind of the control a step acted on (`control`), told as a press, or
 * nothing for any other refusal (live run `run-musp4h2f-72e8ed99`).
 */
function pressBound(refusal: AutomationStudioFlowDraftAmendmentRefusal, checklist: boolean): string | undefined {
  if (refusal.reason !== "bind_new_key" || refusal.control !== true) return undefined;
  const press = `On step ${refusal.step}, ${refusal.parameter ?? "that parameter"} names the control the step acted on, not a value it typed: a press has no value to vary, and its control is found by its words each run, so it is never bound. Bind only a value a step typed, or a read's condition.`;
  return checklist ? `${press} Leave step ${refusal.step} as it is.` : `${press} Leave step ${refusal.step} as it is and go on with what the Flow still lacks.`;
}

/**
 * Each reason's own way out, by the number the model wrote, for a refusal no
 * more precise answer above covers: the amendment or call to send instead,
 * placeholders in angle brackets where only the model knows the value
 * (header, W2). Exhaustive by type, so a reason added to the draft's set fails
 * to compile until it is given one here.
 */
function fallback(refusal: AutomationStudioFlowDraftAmendmentRefusal, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[], actsNotDone: readonly string[] | undefined): string {
  const n = refusal.step;
  const step = steps.find((candidate) => candidate.position === n);
  const key = refusal.parameter ?? "each value";
  const rerun = `{"step": ${n}, "change": "rerun", "input": {<only the keys that change>}}`;
  const ways: Record<AutomationStudioFlowDraftAmendmentRefusal["reason"], () => string> = {
    no_such_step: () => existingPositions(steps).includes(n)
      ? `Step ${n} is in the draft, but the step its check, to or over named is not: name only a step listed under positions, as the draft shows it; a step not run yet is run first, as a new call with add true.`
      : `There is no step ${n} in the draft: name a step listed under positions, as the draft shows it, or run the step you meant as a new call with add true.`,
    already_so: () => `Step ${n} already says that, so it stays as it is: do not send the same change again. Send step ${n} a different change only if it should say something else; otherwise go on with what the Flow still lacks.`,
    no_such_position: () => `Step ${n} was not moved: to, or a repeat's through, has to name a step the draft shows. Send {"step": ${n}, "change": "reorder", "to": <a step from 1 to ${Math.max(lastPosition(steps), 1)}>}, or leave step ${n} where it is.`,
    run_by_the_loop: () => `Step ${n} was not rerun. Send it on its own in the next decision, with an input: ${rerun} -- one rerun per decision -- or, when its action is no longer offered, run an offered tool as a new call with add true.`,
    no_step_before_it: () => `Step ${n} has no step before it in the Flow for this change to be about: name the step it is about -- {"step": ${n}, "change": "only_if", "check": <that step>}, or {"step": ${n}, "change": "repeat", "over": <the listing>} -- or leave step ${n} as it is.`,
    over_not_before: () => `Step ${n}'s repeat over step ${refusal.over ?? "<the listing>"} was refused: the repeat goes on the act done to each row, over the listing before it. Send {"step": <the act>, "change": "repeat", "over": <the listing>}; when the listing comes after the act, send {"step": <the listing>, "change": "reorder", "to": <the act>} beside it, in the same decision.`,
    not_a_kept_step: () => notKept(n, step),
    did_not_work: () => `Step ${n} did not work, so it is already out of the Flow: leave it, and do not drop or keep it. To have what it tried, read what its result${under(step)} names as refused and rerun it with exactly that changed: ${rerun} -- or run the action again as a new call with add true.`,
    already_in_flow: () => `Step ${n} is in the Flow already: leave it, and do not keep it again. Run what the Flow still lacks as a new call with add true, or complete.`,
    already_out: () => `Step ${n} is out of the Flow already: leave it out, or send {"step": ${n}, "change": "add"} if the Flow needs it after all.`,
    changes_nothing: () => `Step ${n}'s identical call was not sent again: on the same page it would do what it did before. Rerun it only with what should differ -- ${rerun} -- or leave step ${n} as it is and go on with what the Flow still lacks.`,
    act_on_a_read: () => actOnRead(n, steps),
    act_already_named: () => refusal.act !== undefined && actsNotDone?.includes(refusal.act)
      ? `Step ${n} already names ${refusal.act}, and the checklist still shows it not done: naming it again changes nothing. Its todo says why and which step: correct exactly that step -- rerun it with a corrected argument -- or run the act's own control as a new call with add true and act ${refusal.act}.`
      : `Step ${n} already names ${refusal.act ?? "that act"}, so naming it again changes nothing: leave step ${n} as it is and go on with what the Flow still lacks, or complete.`,
    bind_not_a_binding: () => `On step ${n}, ${key} is not a binding form. To bind it, send bind on step ${n} with ${key} set to {"$input": <name>, "test": <its value>} (or {"$row": <field>} inside a repeat); to give it another concrete value, rerun step ${n} with it: ${rerun}.`,
    bind_new_key: () => refusal.bindable?.length
      ? `Step ${n} ran with no value at ${key}: bind one of ${refusal.bindable.join(", ")} on step ${n} instead, or leave it as it is.`
      : `Step ${n} has no value to bind at ${key}: leave step ${n} as it is. A value that should vary is bound on the step that typed it, or written into a new step with a new call with write true.`,
    bind_row_outside_loop: () => `Step ${n} is in no repeat, so ${key} has no row to come from: send {"step": ${n}, "change": "repeat", "over": <the listing>} first and the bind after it, or bind ${key} as {"$input": <name>, "test": <its value>} when it is the same for every row.`,
    bind_malformed: () => `Write ${key} on step ${n} again in one of the forms reasons.bind_malformed lists and send it again; to set a concrete value instead, rerun step ${n} with it: ${rerun}.`,
    rerun_holds_binding: () => `Step ${n} holds a binding, so it runs only in the Flow: rerun it with a concrete value for every bound parameter -- {"step": ${n}, "change": "rerun", "input": {<each bound key: a value>}} -- or write the step you need as a new call to core.run_node with write true.`,
    strands_a_step: () => `Step ${n} stays in the Flow: it brings the page to where a later step of the Flow acted. Leave step ${n} in, or drop that later step too if the Flow does not need it.`,
    second_copy: () => `Step ${n} was not added to the Flow: a step of the Flow already does it, and the Flow does each step once. Leave it out and go on with what the Flow still lacks.`,
    settings_rewrite_run: () => `Step ${n} keeps what it ran with. To act on another control or with another value, run that call as a new step with add true and its act; to correct step ${n}'s own argument, rerun it: ${rerun}.`,
    repeat_taken_off: () => `Step ${n}'s repeat was taken off after this decision's moves, so it now runs once. If it should still repeat, send {"step": ${n}, "change": "repeat", "over": <the listing>} with the listing before it, in the numbers the draft now shows.`
  };
  return ways[refusal.reason]();
}

/**
 * A routing, bind or act named a step that is not in the Flow: the look named
 * itself, the step named is out of the Flow, or -- the step named being in it
 * -- the step its check, to, over or through named is not.
 */
function notKept(n: number, step: AutomationStudioDraftAmendmentFeedbackStep | undefined): string {
  if (step?.effect !== undefined && !(step.proposes ?? step.effect === "mutate")) {
    return `Step ${n} only looked, so it is never in the Flow and does no act: leave it, and run the step that does what you meant as a new call with add true (and its act).`;
  }
  if (step && didNotWork(step)) return `Step ${n} did not work, so it is not in the Flow: rerun it with a corrected argument, {"step": ${n}, "change": "rerun", "input": {<only the keys that change>}}, then send this change again.`;
  if (step?.disposition !== undefined && step.disposition !== "kept") {
    return `Step ${n} is not in the Flow (inResult false): add it first, {"step": ${n}, "change": "add"}, and send this change again in the next decision -- or leave step ${n} out.`;
  }
  if (step?.disposition === "kept") {
    return `Step ${n} is in the Flow, but the step its check, to, over or through named is not: name a step whose inResult is true, or add that step first with {"step": <that step>, "change": "add"} and send this change again in the next decision.`;
  }
  return `Name only steps whose inResult is true: step ${n} and the step its check, to, over or through named each have to be in the Flow -- add one that is not with {"step": <it>, "change": "add"} first, or leave step ${n} as it is.`;
}

/** An act named on a read: the press after it to name the act on, or that one is still to run. */
function actOnRead(n: number, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): string {
  const lead = `Step ${n} only reads, so the act was not recorded on it; the rest of that change was made.`;
  const press = steps.find((step) => step.position > n && step.effect === "mutate" && step.effectApplied !== false);
  if (press) return `${lead} Name the act on the step that does it: {"step": ${press.position}, "change": "${press.disposition === "kept" ? "keep" : "add"}", "act": <the act>}, if step ${press.position} is that act's press.`;
  const known = steps.some((step) => step.effect !== undefined);
  return known
    ? `${lead} No step after step ${n} does an act yet: run the press that does it as a new call with add true and its act.`
    : `${lead} Name the act on the press that does it, {"step": <that press>, "change": "keep", "act": <the act>}, or run that press as a new call with add true and its act.`;
}

/**
 * Whether a step did not work, read exactly as the draft entry shows it
 * `did_not_work` and the amendments refuse it (`../flow-draft/entry.ts`,
 * `../flow-draft/amendment/apply.ts`): a call that was performed, of the kind a
 * Flow is made of or one that changes something, and did not take effect. A
 * written or checked step was never performed, so it never failed.
 */
function didNotWork(step: AutomationStudioDraftAmendmentFeedbackStep): boolean {
  return step.written !== true && step.checkedCandidate === undefined && step.effectApplied === false && (step.effect === "mutate" || step.proposes === true);
}

/**
 * What an unchanged rerun of a step that did not work is told (header, C4):
 * the call was refused and never ran, the same call would be refused again,
 * and what to change -- read off its own result, named by its call -- or that
 * new evidence comes first. Never that its result stands.
 */
function refusedAgain(step: AutomationStudioDraftAmendmentFeedbackStep): string {
  const n = step.position;
  const codes = [coded(step.resultCode), coded(step.resultReason)].filter((code): code is string => code !== undefined);
  const said = codes.length ? ` (${codes.join(", ")})` : "";
  return `Step ${n} did not work: this exact call was refused before${said} and would be refused again, so it was not sent, and there is nothing from it to go on with. `
    + `Read what its result${under(step)} names as refused and change exactly that in a rerun: {"step": ${n}, "change": "rerun", "input": {<only the keys to change>}} -- the input merges over step ${n}'s stored argument, so a key the refusal named stays until you change it, and null removes it. `
    + "Or gather new evidence first: look at the page again, or run the action as a new call.";
}

/** Where a step's result is, by its call id, when it has one that is code-shaped. */
function under(step: AutomationStudioDraftAmendmentFeedbackStep | undefined): string {
  const call = coded(step?.callId);
  return call === undefined ? "" : ` under call ${call}`;
}

// A word Core may quote from a step: letters, digits and code punctuation, with
// no space, so neither a page's text nor a value it carried can pass.
const CODE_SHAPED = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;

/** The value when it is code-shaped, and nothing otherwise. */
function coded(value: string | undefined): string | undefined {
  return value !== undefined && CODE_SHAPED.test(value) ? value : undefined;
}

/** The acts the checklist still shows not done, to go on with, or that none are. */
function checklistLeft(actsNotDone: readonly string[]): string {
  return actsNotDone.length
    ? `Still not done on the checklist: ${actsNotDone.join(", ")}. Go on with those.`
    : "Nothing on the checklist is still to do: complete when the Flow does what the person asked.";
}

/**
 * What the model is told of an act moved off a step that stays in the Flow
 * with no act: which step it left, that the step now does no act, and that it
 * is pressed in every run unless dropped -- with the drop to send, never sent
 * for it (live run `run-musp4h2f-72e8ed99`, the 3-Pack's Add to cart).
 */
function movedNote(move: { act: string; from: number; to: number }): string {
  return `Step ${move.from} no longer does ${move.act}: step ${move.to} does it now. Step ${move.from} now does no act, yet it is still in the Flow, so it is pressed in every run unless you drop it: send {"step": ${move.from}, "change": "drop"} unless the Flow needs it for something else.`;
}

/** Every position the draft has, ascending. */
function existingPositions(steps: readonly { position: number }[]): number[] {
  return steps.map((step) => step.position).filter((position) => Number.isSafeInteger(position));
}

/** The draft's last position, or 0 for a draft with none. */
function lastPosition(steps: readonly { position: number }[]): number {
  const positions = existingPositions(steps);
  return positions.length ? Math.max(...positions) : 0;
}
