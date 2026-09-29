// What the loop says to a model that has started repeating itself, instead of
// stopping.
//
// **Why this exists.** Every no-progress guard in this loop was held to
// `maxIterations`, and on a Lab creation run `maxIterations` is the call budget
// itself, so no guard could fire before the calls ran out
// (`../../loop-limits/evidence-loop.ts` carries the numbers and the run). A
// stall therefore had exactly one outcome available to it -- the loop using its
// last call -- and the only lever anybody reached for was a bigger budget,
// which buys more repetition rather than less. `run-mulum3x7-18ceeb75` spent 22
// of its 34 paid decisions on answers it already held and ended with no Flow,
// with tokens and calls still unspent.
//
// **What it does instead.** A model that is repeating itself is not a model
// that needs to be stopped; it is a model that has not been told it is
// repeating itself and does not know what would count as finishing. So from the
// third step without progress the loop pushes this entry as the newest piece of
// evidence, and pushes it again on every further step, saying four things and
// nothing else:
//
//   1. nothing new has entered the evidence for N steps, and which tools keep
//      answering the same thing;
//   2. what the draft already holds -- the steps that would be proposed if the
//      build finished now;
//   3. what happened the last time it tried to finish, by issue code, which is
//      the one thing standing between the draft it has and a Flow;
//   4. how many steps remain before the loop stops, and that finishing or doing
//      something it has not done are the two ways out.
//
// It is the loop's fourth refusal channel and says the same three things as the
// other three -- what happened, how close the loop is to stopping, what to do
// instead (`./answered-request.ts`) -- with one addition the others cannot
// make: those speak about one decision, and this speaks about the run of them.
//
// **It never ends the loop.** A push that does not fit the evidence budget is
// dropped and the loop goes on; a nudge is not worth an ending. Stopping stays
// with `maxStepsWithoutProgress`, five steps further on.
//
// **The stall is usually a symptom, and the redirection names the cause.** On
// `run-mulum3x7-18ceeb75` the spinning at iterations 13-19 and 21-33 followed
// one fact: at iteration 20 Core refused completion with
// `bootstrap.cannot_answer_instruction`, `recordProducerPresent: false` -- the
// instruction asked for a table and no step of the draft produced one. Every
// repeat after that was the model circling a gap it had been told about once,
// ten decisions earlier, and then never again, because the refusal left the
// evidence window and the loop's own count of refusals-in-a-row reset on the
// next tool call. So the loop keeps the latest completion check's answerability
// and its refusal codes until the model tries to finish again, and every
// redirection leads with what is still missing for the plan to answer the
// instruction. What the model already has is secondary; what it lacks is the
// point.
//
// Codes, identifiers and counts only -- no page text, no model words -- which
// is the same rule every evidence entry Core writes is held to.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopAnswerability } from "./answerability.ts";

/** The evidence entry the loop's no-progress redirection arrives under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_NO_PROGRESS_TOOL_ID = "core.no_progress";

/** The most repeating tools, and the most issue codes, one redirection names. */
const MAX_NAMED = 8;

const ISSUE_CODE = /^[a-z0-9_.:-]{1,100}$/i;

export type AutomationStudioLlmEvidenceStallRedirectInput = {
  stepsWithoutProgress: number;
  maxStepsWithoutProgress: number;
  /** The tools whose latest answers gave the loop nothing it did not hold. */
  repeatingToolIds: readonly string[];
  /** Steps that would be proposed if the build finished now. */
  proposableSteps: number;
  /** Times the model has asked to finish, refused or not. */
  completionAttempts: number;
  /** What refused the latest attempt to finish, kept until the model tries again. */
  lastIssueCodes: readonly string[];
  /** Whether finishing is on the table at all this iteration. */
  canComplete: boolean;
  /** What the latest completion check found the plan could and could not answer, when one ran. */
  answerability?: AutomationStudioLlmEvidenceLoopAnswerability | undefined;
};

/**
 * What the plan still lacks to answer the instruction, by Core's own reading of
 * the latest completion check -- or nothing when the check found no gap or has
 * not run. Only one gap exists in that reading today: the instruction asks for
 * a set of records and no step produces or saves one
 * (`../../flow-bootstrap/answerability/check.ts`).
 */
export function automationStudioLlmEvidenceStillMissing(answerability: AutomationStudioLlmEvidenceLoopAnswerability | undefined): "record_producer" | undefined {
  if (!answerability?.recordsRequested) return undefined;
  return answerability.recordProducerPresent || answerability.recordStorePresent ? undefined : "record_producer";
}

const RECORDS_MISSING = "Your last attempt to finish was refused because the instruction asks for a set of records and no step in your draft produces or saves one"
  + " (stillMissing: record_producer). That is what is missing, and nothing you have already run supplies it: repeating it cannot."
  + " Your next step is to run the node that reads those records -- the list the instruction is about, on the page where it is -- and keep that step in the draft."
  + " Complete only once the draft has it.";

/**
 * The redirection itself: what the model already has, what it is missing, and
 * that the way out is to finish the draft rather than to ask again.
 */
export function automationStudioLlmEvidenceStallRedirect(input: AutomationStudioLlmEvidenceStallRedirectInput): JsonObject {
  const stepsLeft = Math.max(0, input.maxStepsWithoutProgress - input.stepsWithoutProgress);
  const issueCodes = [...new Set(input.lastIssueCodes.filter((code) => ISSUE_CODE.test(code)))].slice(0, MAX_NAMED);
  const stillMissing = automationStudioLlmEvidenceStillMissing(input.answerability);
  return {
    ok: false,
    code: "llm_evidence_loop.no_progress",
    stepsWithoutProgress: input.stepsWithoutProgress,
    maxStepsWithoutProgress: input.maxStepsWithoutProgress,
    stepsLeftBeforeStopping: stepsLeft,
    repeatingToolIds: [...new Set(input.repeatingToolIds.filter((toolId) => ISSUE_CODE.test(toolId)))].slice(0, MAX_NAMED),
    draftStepsSoFar: input.proposableSteps,
    completionAttempts: input.completionAttempts,
    ...(issueCodes.length ? { lastCompletionIssueCodes: issueCodes } : {}),
    ...(stillMissing ? { stillMissing } : {}),
    instruction: instruction(input, stepsLeft, issueCodes.length > 0, stillMissing)
  };
}

function instruction(input: AutomationStudioLlmEvidenceStallRedirectInput, stepsLeft: number, refused: boolean, stillMissing: "record_producer" | undefined): string {
  // What is missing leads, because it is the only sentence here that says what
  // to do next rather than what not to do again.
  const said = stillMissing ? [RECORDS_MISSING] : [];
  said.push(
    `The last ${input.stepsWithoutProgress} steps told you nothing you did not already have.`,
    input.repeatingToolIds.length
      ? `The tools named in repeatingToolIds are answering with what they already answered; asking them again will return the same thing again.`
      : `Repeating a request returns the result you already hold.`,
    input.proposableSteps > 0
      ? `Your draft already holds ${input.proposableSteps} step(s) that would be proposed if you finished now. Read the draft entry and build on it.`
      : `Your draft holds no step that could be proposed yet, so finishing now would produce nothing. The next thing to do is run a step that produces what the instruction asks for.`
  );
  // With a gap named above, "complete now" would contradict it, so neither of
  // these is said.
  if (!stillMissing && refused) {
    said.push(`You have tried to finish ${input.completionAttempts} time(s) and lastCompletionIssueCodes says what refused the last one.`
      + ` That refusal is the only thing between your draft and a finished Flow: correct exactly it.`);
  } else if (!stillMissing && input.completionAttempts === 0 && input.proposableSteps > 0 && input.canComplete) {
    said.push(`You have not tried to finish yet. If the draft answers the instruction, complete now.`);
  }
  const way = stillMissing ? "Do the missing step." : "Do something you have not done, or complete.";
  said.push(stepsLeft > 0
    ? `${way} ${stepsLeft} more step(s) without progress and this exploration stops with no Flow.`
    : `${way} This exploration stops on the next step without progress.`);
  return said.join(" ");
}
