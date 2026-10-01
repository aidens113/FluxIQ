// How a loop ends: the codes it may end on, what it hands back either way, and
// the one way a failed result is built.
//
// A failed loop still returns its trace and its steps. That is deliberate and
// was once not so: a live campaign's largest single defect was a failed call
// that ended a build and left no record of what the build had already done.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting } from "./accounting.ts";
import type { AutomationStudioLlmEvidenceLoopExhaustion } from "./exhaustion.ts";
import type { AutomationStudioLlmEvidenceLoopTrace } from "./trace.ts";
import type { AutomationStudioLlmEvidenceLoopUnreadable } from "../unreadable-reply.ts";
import type { AutomationStudioLlmEvidenceLoopProviderUnavailable } from "../unanswered-calls.ts";

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
  /**
   * No longer produced. It was the ending of a loop whose gathered evidence
   * reached a byte backstop, and no loop is ended on bytes any more
   * (`../context-window.ts`). Kept, like the two above, because the outcome
   * tables callers key by this union still name it, and a stored result may
   * carry it.
   */
  | "llm_evidence_loop.evidence_limit"
  /**
   * The loop ran out of turns: iterations, the run's decision budget, or tool
   * calls. **Nothing about what the model produced is being reported here**, and
   * a result carrying this code always carries `exhaustion` saying which
   * allowance ran out and how far the draft had got (`./exhaustion.ts`).
   */
  | "llm_evidence_loop.iteration_limit"
  | "llm_evidence_loop.cancelled"
  /**
   * The provider's replies kept arriving unreadable: an unbroken run of them,
   * each asked again with a note of what could not be read, reached its limit
   * (`../unreadable-reply.ts`). A result carrying this code always carries
   * `unreadable`, saying how many there were and of which kinds.
   */
  | "llm_evidence_loop.unreadable_replies"
  /**
   * The provider stopped answering: an unbroken run of decision calls that got
   * no answer -- timed out, unreachable, a server error, rate limited --
   * reached its limit (`../unanswered-calls.ts`). Nothing was said to the
   * model about them. A result carrying this code always carries
   * `providerUnavailable`.
   */
  | "llm_evidence_loop.provider_unavailable";

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
    /**
     * Present exactly when the code is `llm_evidence_loop.iteration_limit`:
     * which allowance ran out, and what the draft held when it did.
     *
     * It is the difference between "the loop ran out of turns" and "what the
     * loop produced was wrong", which one live build's diagnostic could not
     * express at all (`./exhaustion.ts`).
     */
    exhaustion?: AutomationStudioLlmEvidenceLoopExhaustion;
    /** Present exactly when the code is `llm_evidence_loop.unreadable_replies`. */
    unreadable?: AutomationStudioLlmEvidenceLoopUnreadable;
    /** Present exactly when the code is `llm_evidence_loop.provider_unavailable`. */
    providerUnavailable?: AutomationStudioLlmEvidenceLoopProviderUnavailable;
  };

/** A loop that ended without a result, with everything it did up to then. */
export function automationStudioLlmEvidenceLoopFailure(
  steps: AutomationStudioFlowDraftStep[],
  code: AutomationStudioLlmEvidenceLoopFailureCode,
  trace: AutomationStudioLlmEvidenceLoopTrace[],
  accounting: AutomationStudioLlmEvidenceLoopAccounting,
  /** What ran out, for the one code that says something ran out. */
  exhaustion?: AutomationStudioLlmEvidenceLoopExhaustion,
  /** How many unreadable replies, for the one code that says they ended it. */
  unreadable?: AutomationStudioLlmEvidenceLoopUnreadable,
  /** How many unanswered calls, for the one code that says the provider stopped answering. */
  providerUnavailable?: AutomationStudioLlmEvidenceLoopProviderUnavailable
): AutomationStudioLlmEvidenceLoopResult {
  return { ok: false, code, trace, steps, accounting, ...(exhaustion ? { exhaustion } : {}), ...(unreadable ? { unreadable } : {}), ...(providerUnavailable ? { providerUnavailable } : {}) };
}
