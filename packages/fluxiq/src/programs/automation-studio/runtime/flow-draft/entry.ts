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
// told in full. There used to be a ladder here that shrank the entry to a byte
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

/** The entry the draft is shown under. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID = "core.flow_draft";

const DRAFT_CODE = "llm_evidence_loop.draft";
const DRAFT_INSTRUCTION = "The Flow you are building, in the order you built it: every step here is something you actually ran, with the argument it ran with. Every step whose inResult is true is a step of the finished Flow, so there is nothing to write down at the end and nothing to confirm. A did_not_work step is already out: only rerun changes it. Correct the draft with amend_draft: drop a step that should not be there, exploratory for one you ran only to look, reorder to move one, rerun to do one again with a corrected argument. To do one act to every item of a list, run the step listing the items with a where that keeps only those to act on, do the act to one item it kept, then repeat it over the listing step: the Flow does the rest, so never act on the others yourself. A step you want and have not run yet is run, not written. Getting to the page is part of the work: going somewhere, dismissing what covers it, typing a search and pressing it are never exploratory; only a page you opened to read and moved on from is.";

/**
 * The draft as one entry, or nothing when the draft holds no step a result
 * could be made of. Every step is listed with its argument.
 */
export function automationStudioFlowDraftEntry(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
}): { callId: string; toolId: string; value: JsonValue } | undefined {
  // Every step that could be in the result, whether or not it is: an
  // extraction changes nothing on the page and is the whole point of a
  // scraping Flow, so "did it mutate" is not the question. A step the model
  // withdrew stays listed, because the receipt is what makes the draft
  // checkable -- `inResult` on each line says which way it went.
  const listed = input.steps.filter(automationStudioFlowDraftStepIsAction);
  if (!listed.length) return undefined;
  const value: JsonObject = {
    code: DRAFT_CODE,
    steps: listed.map((step) => stepLine(step, listed)),
    instruction: DRAFT_INSTRUCTION
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
    ...(step.replayed ? { replayed: step.replayed.status } : {}),
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
  return step.effectApplied === false ? "did_not_work" : step.disposition;
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
