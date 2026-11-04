// Why a round that ended on each loop failure code starts again. Closed over
// every code: a code added to the loop and not named here is a compile error,
// so no new ending can slip in as a way for a task to stop.
//
// Words are Core's own and generic: never page text, never a model's words.

import type { AutomationStudioLlmEvidenceLoopFailureCode } from "../../llm/evidence-loop/index.ts";

export const AUTOMATION_STUDIO_ANSWER_FIRST_LOOP_FAILURE_REASONS = Object.freeze({
  "llm_evidence_loop.invalid_configuration": "the round could not be set up as asked",
  "llm_evidence_loop.invalid_decision": "the model's decisions could not be used",
  "llm_evidence_loop.unknown_tool": "the model asked for a tool that does not exist",
  "llm_evidence_loop.duplicate_call": "a call was repeated",
  "llm_evidence_loop.duplicate_tool_request": "a request was repeated",
  "llm_evidence_loop.repeat_without_progress": "the round kept repeating itself",
  "llm_evidence_loop.tool_failed": "a tool failed",
  "llm_evidence_loop.evidence_limit": "the round gathered all the evidence it may hold",
  "llm_evidence_loop.iteration_limit": "the round ran out of turns",
  "llm_evidence_loop.cancelled": "the round was cancelled without a Stop from the person",
  "llm_evidence_loop.unreadable_replies": "the model's replies kept arriving unreadable",
  "llm_evidence_loop.provider_unavailable": "the model service stopped answering"
} as const satisfies Record<AutomationStudioLlmEvidenceLoopFailureCode, string>);
