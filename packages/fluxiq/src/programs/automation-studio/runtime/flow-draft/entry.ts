// The draft as one evidence entry, always shown whole.
//
// The draft is not an evidence record: it is the model's own list of what it
// did, placed beside the evidence the way the budget entry is, so however long
// the exploration runs, the list of what it did is in front of the model when
// it writes the result.
//
// **Nothing here is page content.** Every field is either Core's own
// bookkeeping or the argument the model itself wrote when it asked for the
// action.
//
// Every step is listed, with the argument it ran with, and the guidance is
// told in full -- a look too, as `disposition: look`. A look holds a step
// number like any other step, because a position is an index into the whole
// draft (`./step.ts`), so a draft that hid its looks showed the model numbers
// with gaps it could not see across: live run `run-mup2i28c-6c7fc209` was shown
// steps 2, 3 and 4 -- 1 and 5 were looks -- and its `5 add a2` landed on the
// look after them. The entry is built afresh for every decision from the draft
// as it then stands (`../llm/decision-context/shown.ts`), so listing every step
// is what makes it change after every call, a look included.
// There used to be a ladder here that shrank the entry to a byte
// budget -- packed rows, shorter guidance, arguments over 512 bytes replaced
// by a marker, arguments withheld oldest first, and finally the oldest steps
// counted instead of listed. It is gone (2026-09-30): the only bound on a
// request is the model's context window, enforced loudly before the request
// is sent, and nothing is trimmed to fit (`../llm/context-window.ts`).

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";
import { automationStudioFlowDraftStepIsAction, automationStudioFlowDraftStepIsProposed } from "./step.ts";
import type { AutomationStudioFlowDraftStepRouting } from "./routing.ts";
import { automationStudioFlowDraftStepById } from "./routing.ts";
import { automationStudioFlowDraftReplayOutcomeWord } from "./verify-only.ts";

/** The entry the draft is shown under. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID = "core.flow_draft";

const DRAFT_CODE = "llm_evidence_loop.draft";
const DRAFT_INSTRUCTION = "The Flow you are building, in the order you built it: every step here is something you actually ran, with the argument it ran with. Every step whose inResult is true is a step of the finished Flow, so there is nothing to write down at the end and nothing to confirm. A did_not_work step is already out: only rerun changes it. A step whose disposition is look only looked: it is listed so its number shows, and it is never in the Flow and does no act. Correct the draft with amend_draft: drop a step that should not be there, exploratory for one you ran only to look, reorder to move one, rerun to do one again with a corrected argument. To do one act to every item of a list, run the step listing the items with a where that keeps only those to act on, do the act to one item it kept, then repeat it over the listing step: the Flow does the rest, so never act on the others yourself. A step you want and have not run yet is run, not written. Getting to the page is part of the work: going somewhere, dismissing what covers it, typing a search and pressing it are never exploratory; only a page you opened to read and moved on from is.";

// The same draft where the model authors it (user, 2026-09-30: "IT SHOULD
// ONLY ADD STEPS IN A WAY THAT MAKE AN INTELLIGENT FLOW!"): a step that ran is
// evidence, marked `taken`, and is in the Flow only once the model adds it
// (`./step.ts`). The acts checklist beside it (`acts`) is what "ready" means
// (audit A1, cause 1), so the telling names it.
const AUTHORED_INSTRUCTION = "The Flow you are authoring. Every step you run is listed here as evidence (disposition taken) and is not in the Flow until you add it: add true on the call that runs it, or amend_draft add naming its step. inResult true marks a step of the Flow. Add only what the finished Flow needs, in the order it needs it: getting to the page, dismissing what covers it, and the acts themselves. Never add a look, a failed try, a detour, or a second copy of a step already added. acts lists what the person asked to be done, in their words: say which act a step does with act (a1, a2 ...) when you add it, and done then names that step. To do one act to every item of a list, add the step listing them with a where keeping only those to act on, add the act done to one item, then amend_draft repeat over the listing step. For something only sometimes there, add it and mark it optional: a cookie banner, a sign-up popup or anything else that covers the page may not be there the next time the Flow runs, so its dismissal is optional. reorder moves a step, drop takes one out, rerun does one again with a corrected argument in its place. The Flow is ready only when every act shows done: complete then, not before. A did_not_work step can only be rerun. A step whose disposition is look only looked: it is listed so its number shows, and it can never be added or do an act.";

/**
 * The draft as one entry, or nothing when the draft holds no step a result
 * could be made of and no acts checklist. Every step is listed with its
 * argument, at the number an amendment names it by.
 */
export function automationStudioFlowDraftEntry(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  /** Whether the model authors the draft; absent, the transcript telling (`./step.ts`, `taken`). */
  authored?: boolean | undefined;
  /** The acts checklist, carried whole on every entry. */
  acts?: JsonValue | undefined;
}): { callId: string; toolId: string; value: JsonValue } | undefined {
  // Every step, whether or not it is in the result: an extraction changes
  // nothing on the page and is the whole point of a scraping Flow, so "did it
  // mutate" is not the question. A step the model withdrew stays listed,
  // because the receipt is what makes the draft checkable -- `inResult` on
  // each line says which way it went -- and a look stays listed so every
  // number an amendment can name is one the model was shown (header).
  const listed = input.steps;
  const acts = input.acts;
  // No step yet, and still a checklist: the model is shown what it is to do
  // from the first decision. Looks alone and no checklist are still nothing
  // to show: nothing in them is an edit the model could make.
  if (!listed.some(automationStudioFlowDraftStepIsAction) && acts === undefined) return undefined;
  const value: JsonObject = {
    code: DRAFT_CODE,
    ...(acts === undefined ? {} : { acts }),
    steps: listed.map((step) => stepLine(step, listed)),
    instruction: input.authored ? AUTHORED_INSTRUCTION : DRAFT_INSTRUCTION
  };
  return { callId: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, value };
}

function stepLine(step: AutomationStudioFlowDraftStep, all: readonly AutomationStudioFlowDraftStep[]): JsonObject {
  return {
    step: step.position,
    actionId: step.actionId,
    input: step.input,
    ...(step.resultCode ? { resultCode: step.resultCode } : {}),
    changed: step.effectApplied === undefined ? "unknown" : step.effectApplied ? "yes" : "no",
    disposition: shownDisposition(step),
    inResult: automationStudioFlowDraftStepIsProposed(step),
    // How it answered the last time the draft was run as a Flow. It sits on
    // the step rather than only in the refusal that reported it, because a
    // refusal is one entry a newer refusal supersedes and the draft is the one
    // thing always in front of the model (`./dry-run.ts`). It is deliberately not
    // explained in the instruction above: the word only appears once a replay
    // has happened, and the refusal that put it there explains itself in full.
    // Spending two hundred bytes of every draft entry on a sentence about a
    // check that usually passes would cost the entry steps it has to list.
    // A step that was only checked reads `verified` or `present`, never
    // `replayed` (`./verify-only.ts`): the model must not believe it was done again.
    ...(step.replayed ? { replayed: automationStudioFlowDraftReplayOutcomeWord(step.replayed) } : {}),
    // What the step says about when it runs, in the step numbers the model
    // reads rather than the ids the draft keeps (`./routing.ts`). It is shown
    // back for the same reason the disposition is: an edit the model made and
    // cannot see is one it makes again. Like `replayed`, it is deliberately not
    // explained in the instruction above -- the grammar is in the amendment
    // schema, which every decision that may amend already carries, and a
    // sentence here would be paid for on every request by every build,
    // including the ones whose Flow is a straight line.
    ...(step.routing ? { runs: routingLine(step.routing, all) } : {}),
    ...(step.settings ? { settings: step.settings } : {})
  };
}

/**
 * What the model is told a step's disposition is.
 *
 * A step that did not work is out of the Flow whatever the model calls it, and
 * listing it as `kept` -- which is what it is, since nobody withdrew it -- read
 * as a step still to be dealt with. Every hard live build of 2026-09-28 spent
 * decisions dropping or "keeping" refused presses, and the draft's own
 * instruction said every listed step had worked. Only what is shown changes:
 * the step keeps its disposition, and no amendment but `rerun` touches it
 * (`./amendment.ts`).
 */
function shownDisposition(step: AutomationStudioFlowDraftStep): string {
  if (step.effectApplied === false && (step.effect === "mutate" || automationStudioFlowDraftStepIsAction(step))) return "did_not_work";
  // Not of the kind a Flow is made of: listed only so its number shows, and
  // no amendment puts it in the Flow (`./amendment.ts`).
  return automationStudioFlowDraftStepIsAction(step) ? step.disposition : "look";
}

/** One routing statement in the words and the numbers an amendment took. */
function routingLine(routing: AutomationStudioFlowDraftStepRouting, all: readonly AutomationStudioFlowDraftStep[]): string {
  const at = (id: string): string => {
    const step = automationStudioFlowDraftStepById(all, id);
    return step ? String(step.position) : "a step no longer in the draft";
  };
  if (routing.kind === "optional") return "optional: the Flow carries on when this fails";
  if (routing.kind === "only_if") return `only if step ${at(routing.check)} succeeded`;
  if (routing.kind === "on_failed") return `on failure, step ${at(routing.to)} runs instead`;
  return `repeats through step ${at(routing.through)}, over step ${at(routing.over)}`;
}
