import type { EvidenceLoopFailureCode } from "../../../agents/loop/index.ts";
import type { AutomationStudioExplorationOutcome } from "./contract.ts";

/**
 * Each evidence-loop failure code's outcome.
 *
 * The split that matters is three ways now, not two: the loop's own size limits
 * are `budget_exhausted`, its repeat detection is `no_progress` -- a loop that
 * asked twice for one thing did not run out of anything -- and everything
 * meaning the loop could not be driven correctly is `failed`. `cancelled` is here for completeness only -- the
 * runner aborts the loop itself whenever a limit fires, so it knows the real
 * reason and never falls through to this row.
 */
export const AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_LOOP_FAILURE: Readonly<Record<EvidenceLoopFailureCode, AutomationStudioExplorationOutcome>> = Object.freeze({
  "llm_evidence_loop.invalid_configuration": "failed",
  "llm_evidence_loop.invalid_decision": "failed",
  "llm_evidence_loop.unknown_tool": "failed",
  "llm_evidence_loop.duplicate_call": "failed",
  "llm_evidence_loop.duplicate_tool_request": "no_progress",
  "llm_evidence_loop.repeat_without_progress": "no_progress",
  "llm_evidence_loop.tool_failed": "failed",
  "llm_evidence_loop.evidence_limit": "budget_exhausted",
  "llm_evidence_loop.iteration_limit": "budget_exhausted",
  "llm_evidence_loop.cancelled": "cancelled",
  "llm_evidence_loop.unreadable_replies": "failed",
  "llm_evidence_loop.provider_unavailable": "failed"
});
