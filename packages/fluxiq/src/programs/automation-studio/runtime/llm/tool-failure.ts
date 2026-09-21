// A tool call that was made and did not come back with a result.
//
// An evidence loop runs the tool the model chose and hands it what came back.
// Until 2026-09-21 a call that threw, or returned something that was not a
// result, ended the whole loop as `llm_evidence_loop.tool_failed`, and the
// trace kept no record of it. Flow creation on the realistic sites built for
// the Week 2 exit then died within a few calls. Measured live on one of them,
// the model's first press landed while a promotion stood over the page, the
// client refused the click, and the build ended there; another site's page
// outgrew what was left of the evidence budget. A person meets both and deals
// with them, and the model could have too, had it been told.
//
// A loop configured for it now records the call and tells the model, then asks
// again. What the model is told is closed: the tool, one of two codes, and how
// close the loop is to stopping. Never the error's text, which is the domain's
// own words and may quote the page. A domain that knows why its tool failed --
// a covered control, a page that moved -- says so by returning a refusal with a
// code of its own instead of throwing, and that is an ordinary result.

import type { JsonObject } from "../../../../core/index.ts";

/** The call threw, or it returned something that is not a tool result. */
export type AutomationStudioLlmEvidenceToolFailureCode = "llm_evidence_loop.tool_failed" | "llm_evidence_loop.tool_result_invalid";

const TOOL_FAILURE_INSTRUCTION = "This call failed and returned no evidence, so nothing it would have shown is known. "
  + "If it was an action, the page may have changed: look again before relying on earlier evidence. "
  + "Choose a different tool or input, or complete from the evidence you have. Failures count toward stopping this exploration.";

/**
 * What the model reads in place of a failed call's result, under that call's
 * own id: codes and counts only, bounded to well under a kilobyte.
 */
export function automationStudioLlmEvidenceToolFailure(input: {
  code: AutomationStudioLlmEvidenceToolFailureCode;
  toolId: string;
  stepsWithoutProgress: number;
  maxStepsWithoutProgress: number;
}): JsonObject {
  return {
    ok: false,
    code: input.code,
    toolId: input.toolId,
    stepsWithoutProgress: input.stepsWithoutProgress,
    maxStepsWithoutProgress: input.maxStepsWithoutProgress,
    instruction: TOOL_FAILURE_INSTRUCTION
  };
}
