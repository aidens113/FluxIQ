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
// Trimming order, when even the reserved room is not enough: repeated field
// names go first through a self-describing row format, then the instruction is
// told shorter because the amendment schema carries its grammar too. Only then
// are arguments withheld, oldest first; a step without its argument still says
// the step happened, and a step not listed at all says nothing. Once the telling
// is as short as it goes, the oldest steps themselves are dropped and counted
// rather than silently absent.
//
// Whatever went, the entry says so. A shrunken draft is still a draft: there is
// no budget at which this gives back nothing for a draft that has steps in it,
// because a model shown no draft does not know it has one, and amends by guess.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";
import { automationStudioFlowDraftStepIsAction, automationStudioFlowDraftStepIsProposed } from "./step.ts";
import type { AutomationStudioFlowDraftStepRouting } from "./routing.ts";
import { automationStudioFlowDraftStepById } from "./routing.ts";

/** The entry the draft is shown under. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID = "core.flow_draft";

const DRAFT_CODE = "llm_evidence_loop.draft";
const DRAFT_INSTRUCTION = "The Flow you are building, in the order you built it: every step here is something you actually ran and that worked, with the argument it ran with. This is the record of what you did, not a tool result, and it is not affected by which results are still shown. Every step whose inResult is true is a step of the finished Flow, whether or not its own result is still in front of you -- so there is nothing to write down at the end. Correct it with an amend_draft decision: drop a step that should not be there, exploratory for one you ran only to look, reorder to move one, rerun to do one again with a corrected argument. A step you want and have not run yet is run, not written. Getting to the page is part of the work, not looking around it: going somewhere, dismissing what covers the page, typing a search and pressing it are steps the Flow cannot start without, and marking them exploratory leaves a Flow that has nowhere to run. Only a step whose effect the Flow does not need -- a page you opened to read and moved on from -- is exploratory.";

// The same instruction told shorter, for when telling it in full would cost the
// entry the steps it exists to list.
//
// The full telling is a fixed thousand bytes that every draft pays for however
// long or short it is, and a draft budget is a few thousand -- so past a couple
// of dozen steps the guidance competes for room with the record it is guidance
// about. The record wins that contest: the amend_draft schema, which every
// decision that may amend already carries, states the grammar again, while the
// list of what the build actually ran is carried by nothing else at all. What no
// telling drops is the two things the model cannot act without: that the list is
// the Flow in order, and that amend_draft is how it is corrected.
const DRAFT_INSTRUCTION_BRIEF = "The Flow you are building, in the order you built it: every step here is something you actually ran and that worked. Every step whose inResult is true is a step of the finished Flow, so there is nothing to write down at the end. Correct it with an amend_draft decision: drop a step that should not be there, exploratory for one you ran only to look, reorder to move one, rerun to do one again with a corrected argument. Getting to the page is part of the work: a step the Flow cannot start without is not exploratory. A step you want and have not run yet is run, not written.";
const DRAFT_INSTRUCTION_MINIMAL = "What you have built, in the order you built it. Every step whose inResult is true is a step of the finished Flow. Correct it with an amend_draft decision.";

/** Longest first: the telling only gets shorter once the room has run out. */
const DRAFT_INSTRUCTIONS = [DRAFT_INSTRUCTION, DRAFT_INSTRUCTION_BRIEF, DRAFT_INSTRUCTION_MINIMAL];

const DRAFT_STEP_ROW_FORMAT = "step_rows_v1";
const DRAFT_STEP_ROW_FIELDS = [
  "step",
  "actionId",
  "input",
  "resultCode",
  "changed",
  "disposition",
  "inResult",
  "replayed",
  "runs",
  "settings"
] as const;

/** What one step's argument may cost before it is left out of the entry. */
const MAX_STEP_INPUT_BYTES = 512;

/** One entry the ladder below offers: which steps, how much of them, told how. */
type DraftEntryShape = {
  steps: readonly AutomationStudioFlowDraftStep[];
  /** How many of the newest steps carry the argument they ran with. */
  withInput: number;
  instruction: string;
};

/**
 * The draft as one entry, or nothing when the draft holds no step a result
 * could be made of.
 *
 * A draft that holds one always comes back. `maxBytes` decides how much of it
 * is shown -- repeated names and guidance, then arguments, then the oldest
 * steps -- and a budget too small for even the least entry gets that entry
 * anyway rather than nothing, because the record is the point of it.
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

  // Keep the established representation byte-for-byte when it can carry the
  // complete draft. Packing is only a recovery from the information loss the
  // old ladder would otherwise introduce.
  const complete = entryValue({ steps: listed, withInput: listed.length, instruction: DRAFT_INSTRUCTION }, 0);
  if (serializedBytes(complete) <= input.maxBytes) return entry(complete);

  // A packed row removes repeated field names, not values. Only use it when
  // every argument can be carried: an argument rejected by the per-step bound
  // needs the existing `inputTooLarge` object line, not a null that could be
  // mistaken for budget trimming.
  const allInputsBounded = listed.every((step) => boundedInput(step.input) !== undefined);
  if (allInputsBounded) {
    for (const attempt of packedTrimmings(listed)) {
      const value = packedEntryValue(attempt, listed.length - attempt.steps.length);
      if (serializedBytes(value) <= input.maxBytes) return entry(value);
    }
  } else {
    for (const attempt of objectTrimmings(listed)) {
      const value = entryValue(attempt, listed.length - attempt.steps.length);
      if (serializedBytes(value) <= input.maxBytes) return entry(value);
    }
  }
  // Not one rung fitted, so `maxBytes` cannot hold a single step and the
  // shortest instruction. The least entry -- the newest step, no bounded
  // argument (or an oversized marker), and the shortest telling -- goes anyway,
  // over budget and saying what it left out.
  //
  // Giving back nothing here is how a long build could be shown no draft at
  // all: the budget bought a thousand bytes of guidance, had nothing left for
  // the steps, and returned the same `undefined` that means "this build has not
  // done anything yet". The caller cannot tell those apart, so it would show
  // the model nothing and the model would amend a Flow it could not read.
  const newest = listed.slice(-1);
  const newestInputRejected = boundedInput(newest[0]!.input) === undefined;
  return entry(entryValue({ steps: newest, withInput: newestInputRejected ? 1 : 0, instruction: DRAFT_INSTRUCTION_MINIMAL }, listed.length - 1));
}

function entry(value: JsonObject): { callId: string; toolId: string; value: JsonValue } {
  return { callId: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, value };
}

/**
 * Object-form fallbacks for a draft that cannot use packed rows. Shorten the
 * telling while every eligible argument and oversized marker remains, then
 * withhold arguments oldest first under the minimal telling. Only after no
 * all-step candidate fits are the oldest steps removed.
 */
function* objectTrimmings(steps: readonly AutomationStudioFlowDraftStep[]): Generator<DraftEntryShape> {
  yield { steps, withInput: steps.length, instruction: DRAFT_INSTRUCTION_BRIEF };
  yield { steps, withInput: steps.length, instruction: DRAFT_INSTRUCTION_MINIMAL };
  for (let withInput = steps.length - 1; withInput >= 0; withInput -= 1) {
    yield { steps, withInput, instruction: DRAFT_INSTRUCTION_MINIMAL };
  }
  for (let dropped = 1; dropped < steps.length; dropped += 1) {
    yield { steps: steps.slice(dropped), withInput: 0, instruction: DRAFT_INSTRUCTION_MINIMAL };
  }
}

/**
 * Lossless-first packing: try every telling with every argument, then use only
 * the minimal telling while giving up oldest arguments. Step removal remains
 * the final trade and keeps the newest contiguous suffix.
 */
function* packedTrimmings(steps: readonly AutomationStudioFlowDraftStep[]): Generator<DraftEntryShape> {
  for (const instruction of DRAFT_INSTRUCTIONS) {
    yield { steps, withInput: steps.length, instruction };
  }
  for (let withInput = steps.length - 1; withInput >= 0; withInput -= 1) {
    yield { steps, withInput, instruction: DRAFT_INSTRUCTION_MINIMAL };
  }
  for (let dropped = 1; dropped < steps.length; dropped += 1) {
    yield { steps: steps.slice(dropped), withInput: 0, instruction: DRAFT_INSTRUCTION_MINIMAL };
  }
}

/**
 * The entry's JSON. `unlisted` is how many older steps are counted rather than
 * shown, and `omitted` names what shrinking cost, so nothing is missing without
 * the entry saying that it is.
 */
function entryValue(shape: DraftEntryShape, unlisted: number): JsonObject {
  const from = shape.steps.length - shape.withInput;
  const left = omitted(shape);
  return {
    code: DRAFT_CODE,
    ...(unlisted > 0 ? { unlisted } : {}),
    ...(left.length ? { omitted: left } : {}),
    steps: shape.steps.map((step, index) => stepLine(step, index >= from, shape.steps)),
    instruction: shape.instruction
  };
}

/** The same draft values with repeated step-field names paid once. */
function packedEntryValue(shape: DraftEntryShape, unlisted: number): JsonObject {
  const from = shape.steps.length - shape.withInput;
  const left = omitted(shape);
  return {
    code: DRAFT_CODE,
    format: DRAFT_STEP_ROW_FORMAT,
    fields: [...DRAFT_STEP_ROW_FIELDS],
    ...(unlisted > 0 ? { unlisted } : {}),
    ...(left.length ? { omitted: left } : {}),
    steps: shape.steps.map((step, index) => stepRow(step, index >= from, shape.steps)),
    instruction: shape.instruction
  };
}

/**
 * What this entry left out to fit, in the model's own terms.
 *
 * A step with no `input` must not read as a step that ran with no argument, and
 * a shortened instruction must not read as the whole of what the draft can be
 * told to do. How many steps are not listed at all is `unlisted` instead, a
 * count rather than a sentence because a reader of the run compares it.
 *
 * Each note is a few words, on the same reasoning that keeps the shortened
 * telling short: this is paid for by every entry that had to shrink, and it is
 * the entries that had to shrink that can least afford a sentence. A hundred
 * bytes of explanation here costs the draft a step it would otherwise list.
 */
function omitted(shape: DraftEntryShape): string[] {
  const without = shape.steps.length - shape.withInput;
  const notes: string[] = [];
  if (without > 0) {
    notes.push(without === shape.steps.length
      ? "the argument each step ran with"
      : `the argument of the ${without} oldest steps`);
  }
  if (shape.instruction !== DRAFT_INSTRUCTION) notes.push("most of the guidance on amending a draft");
  return notes;
}

function stepLine(step: AutomationStudioFlowDraftStep, withInput: boolean, all: readonly AutomationStudioFlowDraftStep[]): JsonObject {
  const argument = withInput ? boundedInput(step.input) : undefined;
  return {
    step: step.position,
    actionId: step.actionId,
    ...(argument ? { input: argument } : {}),
    // The argument was there and was too big to show. Said on the line rather
    // than left blank, so the model reruns the step with a corrected argument
    // instead of concluding that it ran without one.
    ...(withInput && !argument ? { inputTooLarge: true } : {}),
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

/** One self-describing packed row, with optional trailing values only as far as needed. */
function stepRow(step: AutomationStudioFlowDraftStep, withInput: boolean, all: readonly AutomationStudioFlowDraftStep[]): JsonValue[] {
  const values: JsonValue[] = [
    step.position,
    step.actionId,
    withInput ? step.input : null,
    step.resultCode ?? null,
    step.effectApplied === undefined ? "unknown" : step.effectApplied ? "yes" : "no",
    step.disposition,
    automationStudioFlowDraftStepIsProposed(step)
  ];
  const optional: JsonValue[] = [
    step.replayed?.status ?? null,
    step.routing ? routingLine(step.routing, all) : null,
    step.settings ?? null
  ];
  let last = optional.length - 1;
  while (last >= 0 && optional[last] === null) last -= 1;
  return [...values, ...optional.slice(0, last + 1)];
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
