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
  "llm_evidence_loop.already_answered": "This exact request was already answered and nothing has changed since, so it was not run again. Its result is the evidence entry named by answeredByCallId, placed just before this one. Use it, or choose a different tool or input, or complete.",
  "llm_evidence_loop.already_observed": "This observation was already made and no action has changed anything since, so it was not run again. Its latest result is the evidence entry named by answeredByCallId, placed just before this one. Use it, change something first, or complete.",
  // The wrap-up (`../loop-budget.ts`) offers no tools, and a call it was not
  // offered used to run anyway: the check was against the tools the loop could
  // run, not the ones it had offered. answeredByCallId is the tool's latest
  // call where there is one, and empty where there is none.
  "llm_evidence_loop.not_offered": "The build is in its last decisions, which offer no tools, so this call was not run. Complete from your draft, or amend it and complete."
} as const;

export type AutomationStudioLlmEvidenceAnsweredRequestCode = keyof typeof ANSWERED_REQUEST;

/** The note that follows the moved result: which request, which entry answers
 * it, and how close the no-progress guard is to stopping the loop. */
export function automationStudioLlmEvidenceAnsweredRequestNote(input: {
  code: AutomationStudioLlmEvidenceAnsweredRequestCode;
  toolId: string;
  answeredByCallId: string;
  stepsWithoutProgress: number;
  maxStepsWithoutProgress: number;
}): JsonObject {
  return {
    ok: false,
    code: input.code,
    toolId: input.toolId,
    answeredByCallId: input.answeredByCallId,
    stepsWithoutProgress: input.stepsWithoutProgress,
    maxStepsWithoutProgress: input.maxStepsWithoutProgress,
    instruction: ANSWERED_REQUEST[input.code]
  };
}
