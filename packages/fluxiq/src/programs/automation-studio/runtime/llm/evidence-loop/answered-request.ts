// A request the loop answers from what it already holds, and what the model is
// told about it.
//
// The tool is not run. The result that already answers the request is moved to
// the end of the evidence, where the model's window always reaches, and this
// note follows it naming the entry to read. It is one of the loop's three
// refusal channels -- beside a refused completion
// (`./completion-check.ts`) and a refused amendment
// (`../draft-amendment-feedback.ts`) -- and all three say the same three
// things: what happened, how close the loop is to stopping, and what to do
// instead.

import type { JsonObject } from "../../../../../core/index.ts";

/** The evidence entry the loop's answer to a repeated request arrives under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID = "core.request_check";

/** What a request the loop answered itself, rather than running, is recorded as. */
const ANSWERED_REQUEST = {
  "llm_evidence_loop.already_answered": "This exact request was already answered, so it was not run again. Its result is the entry named by answeredByCallId, just before this one: use it, choose a different tool or input, or complete.",
  "llm_evidence_loop.already_observed": "This observation was already made, so it was not run again. Its latest result is the entry named by answeredByCallId, just before this one: use it, change something first, or complete.",
  // The wrap-up (`../loop-budget.ts`) offers no tools, and a call it was not
  // offered used to run anyway: the check was against the tools the loop could
  // run, not the ones it had offered. answeredByCallId is the tool's latest
  // call where there is one, and empty where there is none.
  "llm_evidence_loop.not_offered": "The build is in its last decisions, which offer no tools, so this call was not run. Complete from your draft, or amend it and complete."
} as const;

export type AutomationStudioLlmEvidenceAnsweredRequestCode = keyof typeof ANSWERED_REQUEST;

/**
 * What a repeat is, beside which request it was: the loop's own bookkeeping,
 * and never a page's words.
 *
 * The note used to carry the tool id and the call that answered it, and with
 * one tool for every node the tool id is always `core.run_node`: run 6 of
 * 2026-09-28 re-asked one look eleven times and was told each time only that
 * a `core.run_node` request had been answered. So the note says how often this
 * request has been asked and when (`timesAsked`, `askedAt`, from the decision
 * history), when it was answered (`answeredAt`), the newest action that ran
 * before this ask (`lastActionBefore`), and -- when Core took a fresh digest of
 * the page and it matched the one taken after the answering call --
 * `pageUnchanged`.
 */
export type AutomationStudioLlmEvidenceAnsweredRequestRepeat = {
  timesAsked?: number;
  askedAt?: readonly number[];
  answeredAt?: number;
  lastActionBefore?: { callId: string; iteration: number };
  pageUnchanged?: true;
};

/** The note that follows the moved result: which request, which entry answers
 * it, how often it has been asked, and how close the no-progress guard is to
 * stopping the loop. */
export function automationStudioLlmEvidenceAnsweredRequestNote(input: {
  code: AutomationStudioLlmEvidenceAnsweredRequestCode;
  toolId: string;
  answeredByCallId: string;
  stepsWithoutProgress: number;
  maxStepsWithoutProgress: number;
} & AutomationStudioLlmEvidenceAnsweredRequestRepeat): JsonObject {
  const { timesAsked, askedAt, answeredAt, lastActionBefore, pageUnchanged } = input;
  return {
    ok: false,
    code: input.code,
    toolId: input.toolId,
    answeredByCallId: input.answeredByCallId,
    ...(timesAsked !== undefined ? { timesAsked } : {}),
    ...(askedAt ? { askedAt: [...askedAt] } : {}),
    ...(answeredAt !== undefined ? { answeredAt } : {}),
    ...(lastActionBefore ? { lastActionBefore: { ...lastActionBefore } } : {}),
    ...(pageUnchanged ? { pageUnchanged } : {}),
    stepsWithoutProgress: input.stepsWithoutProgress,
    maxStepsWithoutProgress: input.maxStepsWithoutProgress,
    instruction: instruction(input)
  };
}

/**
 * The instruction, said of this repeat. An answer from memory is only ever
 * given when no action has run since the answering call -- a look is keyed on
 * what has happened (`../repeat-policy.ts`) -- or, for a tool that acts, when
 * no action has changed anything; the note says which, and from the second ask
 * on it says which ask this is and that the answer will not change until an
 * action runs.
 */
function instruction(input: { code: AutomationStudioLlmEvidenceAnsweredRequestCode; answeredAt?: number; lastActionBefore?: { iteration: number }; timesAsked?: number; pageUnchanged?: true }): string {
  if (input.code === "llm_evidence_loop.not_offered") return ANSWERED_REQUEST[input.code];
  const noActionSince = input.answeredAt !== undefined && (!input.lastActionBefore || input.lastActionBefore.iteration <= input.answeredAt);
  const since = noActionSince
    ? `It was answered at iteration ${input.answeredAt} and no action has run since.`
    : "No action has changed anything since it was answered.";
  const checked = input.pageUnchanged ? " Core checked the page just now: it is unchanged." : "";
  const again = input.timesAsked !== undefined && input.timesAsked >= 2
    ? ` This is the ${ordinal(input.timesAsked)} time you have asked it (askedAt); it will get this same answer until an action runs.`
    : "";
  return `${since}${checked} ${ANSWERED_REQUEST[input.code]}${again}`;
}

function ordinal(count: number): string {
  const tens = count % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : count % 10 === 1 ? "st" : count % 10 === 2 ? "nd" : count % 10 === 3 ? "rd" : "th";
  return `${count}${suffix}`;
}
