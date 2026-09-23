// The draft as one evidence entry, and why it is never chosen by the window.
//
// The window that decides what a decision is shown keeps the newest result of
// each tool first and then fills the remaining bytes newest first. That is the
// right rule for results -- an older page superseded by a newer one is worth
// less than the newer one -- and it is the wrong rule for a record of what was
// done, because every action of one kind arrives under one tool id and the rule
// keeps exactly one of them. A build that pressed five controls kept the fifth.
//
// So the draft is not an evidence record and does not compete for the window's
// bytes. The loop reserves room for this entry, asks the window for what is
// left, and places this beside it -- the same way the budget entry is placed --
// so however long the exploration runs, the list of what it did is in front of
// the model when it writes the result.
//
// **Nothing here is page content.** Every field is either Core's own
// bookkeeping or the argument the model itself wrote when it asked for the
// action. A result the window evicted is not smuggled back in by this entry;
// what comes back is the model's own record of having acted.
//
// Trimming order, when even the reserved room is not enough: arguments go
// first, oldest first, because a step without its argument still says the step
// happened, and a step that is not listed at all says nothing. Only once every
// argument is gone are the oldest steps themselves dropped, and they are
// counted rather than silently absent.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";
import { automationStudioFlowDraftStepIsAction, automationStudioFlowDraftStepIsProposed } from "./step.ts";
import type { AutomationStudioFlowDraftStepRouting } from "./routing.ts";
import { automationStudioFlowDraftStepById } from "./routing.ts";

/** The entry the draft is shown under. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID = "core.flow_draft";

const DRAFT_CODE = "llm_evidence_loop.draft";
const DRAFT_INSTRUCTION = "The Flow you are building, in the order you built it: every step here is something you actually ran and that worked, with the argument it ran with. This is the record of what you did, not a tool result, and it is not affected by which results are still shown. Every step whose inResult is true is a step of the finished Flow, whether or not its own result is still in front of you -- so there is nothing to write down at the end. Correct it with an amend_draft decision: drop a step that should not be there, exploratory for one you ran only to look, reorder to move one, rerun to do one again with a corrected argument. A step you want and have not run yet is run, not written.";

/** What one step's argument may cost before it is left out of the entry. */
const MAX_STEP_INPUT_BYTES = 512;

/**
 * The draft as one entry, or nothing when the draft is empty or `maxBytes`
 * cannot even carry the entry with no steps in it.
 */
export function automationStudioFlowDraftEntry(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  maxBytes: number;
}): { callId: string; toolId: string; value: JsonValue } | undefined {
  // Every step that could be in the result, whether or not it is: an
  // extraction changes nothing on the page and is the whole point of a
  // scraping Flow, so "did it mutate" is not the question. A step the model
  // withdrew stays listed, because the receipt is what makes the draft
  // checkable -- `inResult` on each line says which way it went.
  const listed = input.steps.filter(automationStudioFlowDraftStepIsAction);
  if (!listed.length) return undefined;
  for (const attempt of trimmings(listed)) {
    const value = entryValue(attempt.steps, attempt.withInput, listed.length - attempt.steps.length);
    if (serializedBytes(value) <= input.maxBytes) {
      return { callId: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, value };
    }
  }
  return undefined;
}

/**
 * Each smaller entry to try, largest first: every step with its argument, then
 * one fewer argument at a time oldest first, then one fewer step at a time.
 */
function* trimmings(steps: readonly AutomationStudioFlowDraftStep[]): Generator<{ steps: readonly AutomationStudioFlowDraftStep[]; withInput: number }> {
  for (let withInput = steps.length; withInput >= 0; withInput -= 1) yield { steps, withInput };
  for (let dropped = 1; dropped < steps.length; dropped += 1) yield { steps: steps.slice(dropped), withInput: 0 };
}

/**
 * The entry's JSON. `withInput` is how many of the newest steps carry their
 * argument; `unlisted` how many older steps are counted rather than shown.
 */
function entryValue(steps: readonly AutomationStudioFlowDraftStep[], withInput: number, unlisted: number): JsonObject {
  const from = steps.length - withInput;
  return {
    code: DRAFT_CODE,
    ...(unlisted > 0 ? { unlisted } : {}),
    steps: steps.map((step, index) => stepLine(step, index >= from, steps)),
    instruction: DRAFT_INSTRUCTION
  };
}

function stepLine(step: AutomationStudioFlowDraftStep, withInput: boolean, all: readonly AutomationStudioFlowDraftStep[]): JsonObject {
  const argument = withInput ? boundedInput(step.input) : undefined;
  return {
    step: step.position,
    actionId: step.actionId,
    ...(argument ? { input: argument } : {}),
    ...(step.resultCode ? { resultCode: step.resultCode } : {}),
    changed: step.effectApplied === undefined ? "unknown" : step.effectApplied ? "yes" : "no",
    disposition: step.disposition,
    inResult: automationStudioFlowDraftStepIsProposed(step),
    // How it answered the last time the draft was run as a Flow. It sits on
    // the step rather than only in the refusal that reported it, because a
    // refusal is one entry the window may evict and the draft is the one thing
    // always in front of the model (`./dry-run.ts`). It is deliberately not
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

/** The argument when it is small enough to carry, and nothing when it is not. */
function boundedInput(value: JsonObject): JsonObject | undefined {
  return serializedBytes(value) <= MAX_STEP_INPUT_BYTES ? value : undefined;
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
