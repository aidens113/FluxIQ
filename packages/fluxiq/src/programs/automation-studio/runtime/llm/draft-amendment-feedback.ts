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

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftAmendmentRefusal } from "../flow-draft/index.ts";

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
  changes_nothing: "This identical request was not sent again on the same state. Inspect the previous result: only if it actually returned the intended rows should you go on to the act; otherwise correct the failed/refused argument or gather new evidence. A rerun patch merges over the step's argument: an omitted key remains, and null explicitly removes an unneeded key. Required parameters still need valid values.",
  did_not_work: "That step did not work, so it is already out of the Flow and nothing needs dropping or keeping about it. The only amendment that changes it is rerun with a corrected argument; or run the action again as a new call. If the Flow does not need it, leave it alone.",
  already_in_flow: "That step is already in the Flow (inResult: true). Every step with inResult true is part of the finished Flow as it stands, so there is nothing to confirm: do not keep it again. Run what the Flow still lacks, or complete.",
  already_out: "That step is already out of the Flow (inResult: false), so dropping it again changes nothing. Leave it, or keep it to put it back.",
  act_on_a_read: "That step only reads -- a listing, a look or another read that changes nothing -- so it does no act: the rest of your change to it was made, but the act was not recorded on it. An act is done by the step that changes something, such as the press: name the act there. To do it to every item a listing kept, add the listing without act, add the press with act, then repeat the press over the listing.",
  act_already_named: "That step already names that act or choice (act beside it in the draft), so naming it again changes nothing. If the acts checklist shows the act done, nothing is left to do for it: go on with the acts and choices still not done. Otherwise its todo says why and its step says which step: correct exactly that fault rather than naming it again. A singular quantity is set with the item's quantity control, not a repeat over a list. Remove a mistaken repeat explicitly with unrepeat on the step that carries it; keep and keep with act preserve intentional repeats.",
  bind_not_a_binding: "bind only lifts values into bindings: every value its input sets has to be a binding form, {\"$input\": <name>, \"test\": <value>} or {\"$row\": <field>}, and parameter names the first one that is not. To change a value to another concrete value, rerun the step with it instead.",
  bind_new_key: "bind lifts a value the step already has -- one it typed, or a read's condition -- into a binding; it never adds one, and parameter names a key the step ran with no value at. When it names the control the step acted on, such as a press's target, there is no value to bind: a press has no value to vary, and its control is found by its words each run, so leave that step as it is. Otherwise bind only a parameter bindable lists beside the refusal: the values of its input the step ran with as shown. An empty bindable means the step has no value to bind.",
  bind_row_outside_loop: "{\"$row\": <field>} is the field of the row a repeat is on, and this step is in no repeat, so it has no row. Put the step in a repeat over the listing first (repeat, with over the listing), or bind the value as {\"$input\": <name>, \"test\": <value>} when it is the same for every row.",
  bind_malformed: "That binding is not one bind can write. {\"$input\": <name>, \"test\": <value>}: name starts with a lowercase letter, then letters and digits, at most 32, never item, and test is a value, not null. {\"$row\": <field>}: field is one of the row's own field names, with no dot or space. Nothing else may sit beside either. {\"$step\": ...}, an earlier step's output, cannot be bound yet.",
  rerun_holds_binding: "A bound step runs only in the Flow. Rerun patches merge: omitted bound parameters remain bound. Replace every binding with a concrete value, or null-remove an unneeded parameter where the node schema permits removal. If evidence is sufficient to author a new written step, use a new tool_call to the offered core.run_node with input.write:true and declared parameters/consequences. That does not convert or remove the old recorded step, prove an act performed, or bypass permissions and whole-Flow testing. write:true on a recorded step's rerun does not convert it to written.",
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
}): JsonObject {
  const refused = input.refusals.map((refusal) => {
    const next = takenOff(refusal) ?? replacedAttempt(refusal, input.actsNotDone) ?? nextStep(refusal, input.steps) ?? actDone(refusal, input.actsNotDone)
      ?? notRunYet(refusal, input.steps, input.actsNotDone) ?? stillToDo(refusal, input.actsNotDone);
    return {
      step: refusal.step,
      reason: refusal.reason,
      // A refused bind names its parameter, in the model's own key names.
      ...(refusal.parameter === undefined ? {} : { parameter: refusal.parameter }),
      // What the step offers instead, from the step the bind examined (`../flow-draft/bindable/paths.ts`, run B7).
      ...(refusal.reason === "bind_new_key" && refusal.bindable ? { bindable: refusal.bindable } : {}),
      // A repeat Core took off was never sent, so it is never sent again (header).
      ...(refusal.repeated && refusal.reason !== "repeat_taken_off" ? { repeated: true } : {}),
      ...(next ? { next } : {})
    };
  });
  // Entries that are only repeats Core took off refuse no amendment of the model's (header).
  const amendmentsRefused = refused.some((refusal) => refusal.reason !== "repeat_taken_off");
  const repeatsTakenOff = refused.length > 0 && !amendmentsRefused;
  const undone = input.sameDraftAsIteration !== undefined;
  const moved = (input.moved ?? []).map((move) => ({ step: move.from, act: move.act, to: move.to, note: movedNote(move) }));
  // An answer that is only about a moved act refused nothing: it is told as that.
  const onlyMoved = !refused.length && !undone && moved.length > 0;
  const met = [...new Set(refused.map((refusal) => refusal.reason))];
  const reasons: JsonObject = {};
  for (const reason of met) reasons[reason] = REFUSAL_REASONS[reason];
  return {
    ok: onlyMoved,
    code: onlyMoved ? ACT_MOVED_CODE : refused.length || !undone ? AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENTS_REFUSED_CODE : AMENDMENT_UNDONE_CODE,
    refused,
    ...(moved.length ? { moved } : {}),
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
      + (moved.length ? MOVED_INSTRUCTION : "")).trim()
  };
}

/**
 * What the feedback reads of a draft step. The position always; from the loop,
 * which passes the draft itself, also whether the step changes something
 * (`effect`), whether that worked, and whether it is in the Flow -- enough to
 * tell a listing from a press. A step given as a position alone gets the
 * general reason and no `next`.
 */
type AutomationStudioDraftAmendmentFeedbackStep = { position: number; effect?: string; effectApplied?: boolean; disposition?: string; routing?: { kind: string } };

/**
 * What to do instead of a refused amendment about a listing, in the draft's
 * numbers, or nothing when the refusal is not about one.
 *
 * `over_not_before`: the listing is whichever of the two steps named only
 * reads -- `over`, or the step the repeat was put on (`13 repeat over 13`).
 * `changes_nothing`: the step rerun unchanged, when it only reads.
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
    if (!reads(listing)) return undefined;
    return `Step ${listing.position}'s identical request was not sent again. Inspect the previous result: only if it actually returned the intended rows should you go on to the act; otherwise correct the failed/refused argument or gather new evidence. If those rows are right: ${rowAct(listing.position, steps)}`;
  }
  return undefined;
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
 * What a repeat taken off after a decision's moves was, and why, or nothing
 * when the entry is not one (header, `run-musr9pv3-f4bf6256`): the step, the
 * step it repeated over -- and the one its span ran through when that broke
 * -- in the numbers the model wrote, with the numbers the draft now shows
 * where the moves changed them.
 */
function takenOff(refusal: AutomationStudioFlowDraftAmendmentRefusal): string | undefined {
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
 * What to do instead of amending or rerunning the attempt a rerun replaced, or
 * nothing when the refusal is not about one (header, `run-musp474o-e0ed7432`),
 * ending, like every other refusal's, with what the checklist still shows not
 * done when there is one.
 */
function replacedAttempt(refusal: AutomationStudioFlowDraftAmendmentRefusal, actsNotDone: readonly string[] | undefined): string | undefined {
  if (refusal.replacedBy === undefined) return undefined;
  const by = refusal.replacedBy;
  const change = `Step ${refusal.step} is the attempt step ${by}'s rerun replaced: it is listed only as the record of what was replaced, and nothing changes it, so change step ${by} instead -- amend it, or rerun it with what still differs. When step ${by} already holds the argument you meant, its result stands as shown: go on from it.`;
  return actsNotDone === undefined ? change : `${change} ${checklistLeft(actsNotDone)}`;
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
  return `The acts checklist shows ${refusal.act} done, so nothing is left to do for it: do not name it again. ${checklistLeft(actsNotDone)}`;
}

/**
 * What to do instead of amending a step that has not run yet: a refusal of the
 * number right after the draft's last step, which is the number the step would
 * take, says to run it first with add true, then what the checklist still
 * shows not done when there is one. Nothing for any other number.
 *
 * Run `run-musp8nz1-dbd3905a` (t174-w108, Cause 6) had steps 1-13 and sent
 * `{step 14, add, act a1}` for an Add to cart press it had not run. It was told
 * `no_such_step` and the positions, but not that a step enters the draft by
 * running; it ran the press only in the decision after.
 */
function notRunYet(refusal: AutomationStudioFlowDraftAmendmentRefusal, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[], actsNotDone: readonly string[] | undefined): string | undefined {
  if (refusal.reason !== "no_such_step") return undefined;
  const positions = existingPositions(steps);
  const free = positions.length ? Math.max(...positions) + 1 : 1;
  if (refusal.step !== free) return undefined;
  const run = `There is no step ${free} yet: a step enters the draft only by running. Run that action first as a call with add true (and its act, if it does one), and it becomes step ${free}; do not amend it before it has run.`;
  return actsNotDone === undefined ? run : `${run} ${checklistLeft(actsNotDone)}`;
}

/**
 * What every other refusal is told to go on with: the acts the checklist still
 * shows not done, the one source `act_already_named` reads -- led, where the
 * refusal says something the model keeps re-sending, by what to do about its
 * step. A bind of the control a step acted on (`control`) is told as a press
 * even with no checklist to read. Nothing for an act named again that is still
 * to do: its todo is the fault, and naming the checklist would send it back to
 * the same act.
 *
 * Live run `run-musp4h2f-72e8ed99` re-sent `keep 9` and `drop 10` three
 * decisions running, refused `already_in_flow` and `already_out` with no word
 * of the four acts still to do, and bound a press's `target` four times.
 */
function stillToDo(refusal: AutomationStudioFlowDraftAmendmentRefusal, actsNotDone: readonly string[] | undefined): string | undefined {
  if (refusal.reason === "bind_new_key" && refusal.control === true) {
    const press = `On step ${refusal.step}, ${refusal.parameter ?? "that parameter"} names the control the step acted on, not a value it typed: a press has no value to vary, and its control is found by its words each run, so it is never bound. Bind only a value a step typed, or a read's condition.`;
    return actsNotDone === undefined
      ? `${press} Leave step ${refusal.step} as it is and go on with what the Flow still lacks.`
      : `${press} Leave step ${refusal.step} as it is. ${checklistLeft(actsNotDone)}`;
  }
  if (actsNotDone === undefined) return undefined;
  if (refusal.reason === "act_already_named" && refusal.act !== undefined && actsNotDone.includes(refusal.act)) return undefined;
  const lead = refusal.reason === "already_in_flow" ? `Step ${refusal.step} is in the Flow already: leave it. `
    : refusal.reason === "already_out" ? `Step ${refusal.step} is out of the Flow already: leave it out. `
      : "";
  return `${lead}${checklistLeft(actsNotDone)}`;
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
