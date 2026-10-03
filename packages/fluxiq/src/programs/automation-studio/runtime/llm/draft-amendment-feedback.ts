// An amendment that changed nothing, and what the model is told about it.
//
// The model edits the draft with amendments: one step number and one word
// (`../flow-draft/amendment.ts`). The module that applies them already computes
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
  no_such_step: "There is no step at that number. Step numbers are the ones the draft entry shows, and they are renumbered whenever a step moves.",
  already_so: "The step already says that, and the amendment carried nothing else to change.",
  no_such_position: "There is no position to move a step to at that number.",
  run_by_the_loop: "A rerun is carried out by the loop rather than written onto the draft, and this one was not carried out. A rerun needs an input saying what changes in the step's argument, its step's action has to be one still offered, and only the first rerun of a decision runs -- ask for one, and do the rest in the next decision.",
  no_step_before_it: "This change was about the step before the one it named, and there is none. Name the step it is about: check for only_if, over for repeat.",
  over_not_before: "repeat goes on the act that is done to each row -- the press, or the first of the steps done to a row -- never on the step that lists the rows. over names that listing, and it must come before the act: send {\"step\": <the act>, \"change\": \"repeat\", \"over\": <the listing>}. When no step does the act to a row yet, do it to one row the listing kept and add it first: there is nothing to repeat until then.",
  not_a_kept_step: "It named a step the Flow does not contain -- one dropped, marked exploratory, or that did not work. Routing describes the Flow, so it may only name steps the Flow runs.",
  changes_nothing: "That rerun was already run with exactly this argument on this same page, and its result is the one already shown: running it again changes nothing, so it was not run. Change what differs in the step's argument, change the page first, or go on with the result you have. A listing whose rows are right is never run again: go on to the act on one row it kept.",
  did_not_work: "That step did not work, so it is already out of the Flow and nothing needs dropping or keeping about it. The only amendment that changes it is rerun with a corrected argument; or run the action again as a new call. If the Flow does not need it, leave it alone.",
  already_in_flow: "That step is already in the Flow (inResult: true). Every step with inResult true is part of the finished Flow as it stands, so there is nothing to confirm: do not keep it again. Run what the Flow still lacks, or complete.",
  already_out: "That step is already out of the Flow (inResult: false), so dropping it again changes nothing. Leave it, or keep it to put it back.",
  act_on_a_read: "That step only reads -- a listing, a look or another read that changes nothing -- so it does no act: the rest of your change to it was made, but the act was not recorded on it. An act is done by the step that changes something, such as the press: name the act there. To do it to every item a listing kept, add the listing without act, add the press with act, then repeat the press over the listing.",
  act_already_named: "That step already names that act (act beside it in the draft), so naming it again changes nothing. If the acts checklist shows the act done, nothing is left to do for it: go on with the acts and choices the checklist still shows not done. If it still shows the act not done, its todo says why and its step says which step: correct exactly that -- repeat the press over its listing, or rerun a read that names it, since a rerun of a read does not carry the act -- rather than naming the act again.",
  bind_not_a_binding: "bind only lifts values into bindings: every value its input sets has to be a binding form, {\"$input\": <name>, \"test\": <value>} or {\"$row\": <field>}, and parameter names the first one that is not. To change a value to another concrete value, rerun the step with it instead.",
  bind_new_key: "bind lifts a value the step already has into a binding; it never adds one. parameter names a key the step has no value at: name a parameter it already has, as the draft shows it, or rerun the step with the new parameter first.",
  bind_row_outside_loop: "{\"$row\": <field>} is the field of the row a repeat is on, and this step is in no repeat, so it has no row. Put the step in a repeat over the listing first (repeat, with over the listing), or bind the value as {\"$input\": <name>, \"test\": <value>} when it is the same for every row.",
  bind_malformed: "That binding is not one bind can write. {\"$input\": <name>, \"test\": <value>}: name starts with a lowercase letter, then letters and digits, at most 32, never item, and test is a value, not null. {\"$row\": <field>}: field is one of the row's own field names, with no dot or space. Nothing else may sit beside either. {\"$step\": ...}, an earlier step's output, cannot be bound yet.",
  rerun_holds_binding: "A bound step runs only in the Flow: rerun it with a concrete value for every bound parameter, or write it (write true)."
};

const AMENDMENT_FEEDBACK_INSTRUCTION = "The listed amendments changed nothing, for the reason beside each one, and the draft is as it was for them. "
  + "The step numbers an amendment takes are the ones the draft entry shows, and they are renumbered whenever a step moves or is withdrawn. "
  + "Amend a step that exists, do something else, or complete. A decision whose amendments all change nothing counts toward stopping this exploration.";

/** What an amendment that put the draft back exactly as it stood is recorded and shown under. */
const AMENDMENT_UNDONE_CODE = "llm_evidence_loop.draft_amendment_undone";

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
   * `act_already_named` about a done act is told to go on with.
   */
  actsNotDone?: readonly string[] | undefined;
}): JsonObject {
  const refused = input.refusals.map((refusal) => {
    const next = nextStep(refusal, input.steps) ?? actDone(refusal, input.actsNotDone);
    return {
      step: refusal.step,
      reason: refusal.reason,
      // A refused bind names its parameter, in the model's own key names.
      ...(refusal.parameter === undefined ? {} : { parameter: refusal.parameter }),
      ...(refusal.repeated ? { repeated: true } : {}),
      ...(next ? { next } : {})
    };
  });
  const undone = input.sameDraftAsIteration !== undefined;
  const met = [...new Set(refused.map((refusal) => refusal.reason))];
  const reasons: JsonObject = {};
  for (const reason of met) reasons[reason] = REFUSAL_REASONS[reason];
  return {
    ok: false,
    code: refused.length || !undone ? AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENTS_REFUSED_CODE : AMENDMENT_UNDONE_CODE,
    refused,
    applied: input.applied,
    steps: input.steps.length,
    // Only when the model named a step that is not there: the numbers that are.
    ...(met.includes("no_such_step") ? { positions: existingPositions(input.steps) } : {}),
    reasons,
    stepsWithoutProgress: input.stepsWithoutProgress,
    maxStepsWithoutProgress: input.maxStepsWithoutProgress,
    ...(undone ? { sameDraftAsIteration: input.sameDraftAsIteration! } : {}),
    instruction: ((refused.length || !undone ? AMENDMENT_FEEDBACK_INSTRUCTION : "")
      + (refused.some((refusal) => refusal.repeated) ? REPEATED_INSTRUCTION : "")
      + (refused.some((refusal) => refusal.next) ? NEXT_INSTRUCTION : "")
      + (undone ? UNDONE_INSTRUCTION : "")).trim()
  };
}

/**
 * What the feedback reads of a draft step. The position always; from the loop,
 * which passes the draft itself, also whether the step changes something
 * (`effect`), whether that worked, and whether it is in the Flow -- enough to
 * tell a listing from a press. A step given as a position alone gets the
 * general reason and no `next`.
 */
type AutomationStudioDraftAmendmentFeedbackStep = { position: number; effect?: string; effectApplied?: boolean; disposition?: string };

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
  const reads = (step: AutomationStudioDraftAmendmentFeedbackStep | undefined): step is AutomationStudioDraftAmendmentFeedbackStep => step?.effect !== undefined && step.effect !== "mutate";
  if (refusal.reason === "over_not_before") {
    const listing = [at(refusal.over), at(refusal.step)].find(reads);
    return listing ? `Step ${listing.position} is the listing, so the repeat cannot go on it. ${rowAct(listing.position, steps)}` : undefined;
  }
  if (refusal.reason === "changes_nothing") {
    const listing = at(refusal.step);
    if (!reads(listing)) return undefined;
    return `Step ${listing.position} already ran with exactly this argument, so its result stands as shown: do not run it again. If it lists the rows an act is done to and they are the right ones, go on to the act. ${rowAct(listing.position, steps)}`;
  }
  return undefined;
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
  const done = `The acts checklist shows ${refusal.act} done, so nothing is left to do for it: do not name it again.`;
  return actsNotDone.length
    ? `${done} Still not done on the checklist: ${actsNotDone.join(", ")}. Go on with those.`
    : `${done} Nothing on the checklist is still to do: complete when the Flow does what the person asked.`;
}

/** Every position the draft has, ascending. */
function existingPositions(steps: readonly { position: number }[]): number[] {
  return steps.map((step) => step.position).filter((position) => Number.isSafeInteger(position));
}
