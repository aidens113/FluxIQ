// How a loop ends: the codes it may end on, what it hands back either way, and
// the one way a failed result is built.
//
// A failed loop still returns its trace and its steps. That is deliberate and
// was once not so: a live campaign's largest single defect was a failed call
// that ended a build and left no record of what the build had already done.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting } from "./accounting.ts";
import type { AutomationStudioLlmEvidenceLoopTrace } from "./trace.ts";

export type AutomationStudioLlmEvidenceLoopFailureCode =
  | "llm_evidence_loop.invalid_configuration"
  | "llm_evidence_loop.invalid_decision"
  | "llm_evidence_loop.unknown_tool"
  // These two are no longer produced. A reused call id is replaced with one the
  // loop assigns, and a repeated request is answered, a run of them ending the
  // loop as `repeat_without_progress`. Kept because the outcome tables callers
  // key by this union still name them, and a stored result may carry them.
  | "llm_evidence_loop.duplicate_call"
  | "llm_evidence_loop.duplicate_tool_request"
  /** The no-progress guard tripped: the loop kept repeating itself. */
  | "llm_evidence_loop.repeat_without_progress"
  | "llm_evidence_loop.tool_failed"
  /** What was gathered in total reached the far backstop, `maxEvidenceBytes`. */
  | "llm_evidence_loop.evidence_limit"
  | "llm_evidence_loop.iteration_limit"
  | "llm_evidence_loop.cancelled";

export type AutomationStudioLlmEvidenceLoopResult =
  | {
    ok: true;
    result: JsonObject;
    trace: AutomationStudioLlmEvidenceLoopTrace[];
    /** Every action the loop took, in order, with the argument it was given. */
    steps: AutomationStudioFlowDraftStep[];
    accounting: AutomationStudioLlmEvidenceLoopAccounting;
  }
  | {
    ok: false;
    code: AutomationStudioLlmEvidenceLoopFailureCode;
    trace: AutomationStudioLlmEvidenceLoopTrace[];
    /** The same, for a loop that ended without a result: a failed build still did things. */
    steps: AutomationStudioFlowDraftStep[];
    accounting: AutomationStudioLlmEvidenceLoopAccounting;
  };

/** A loop that ended without a result, with everything it did up to then. */
export function automationStudioLlmEvidenceLoopFailure(
  steps: AutomationStudioFlowDraftStep[],
  code: AutomationStudioLlmEvidenceLoopFailureCode,
  trace: AutomationStudioLlmEvidenceLoopTrace[],
  accounting: AutomationStudioLlmEvidenceLoopAccounting
): AutomationStudioLlmEvidenceLoopResult {
  return { ok: false, code, trace, steps, accounting };
}
