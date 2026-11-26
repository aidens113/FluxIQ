// How a loop ends: the codes it may end on, what it hands back either way, and
// the one way a failed result is built.
//
// A failed loop still returns its trace and its steps. That is deliberate and
// was once not so: a live campaign's largest single defect was a failed call
// that ended a build and left no record of what the build had already done.

import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-authoring/draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting } from "./accounting.ts";
import type { AutomationStudioLlmEvidenceLoopConfigurationIssue } from "../configuration-issue/index.ts";
import type { AutomationStudioLlmEvidenceLoopExhaustion } from "./exhaustion.ts";
import type { AutomationStudioLlmEvidenceLoopTrace } from "./trace.ts";
import type { AutomationStudioLlmEvidenceLoopUnreadable } from "../../models/failures/index.ts";
import type { AutomationStudioLlmEvidenceLoopProviderUnavailable } from "../../models/failures/index.ts";

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
  /** A repeat guard stopped a loop with no `loopSignal` (refused repeats or looks in a row), or nothing was left to offer: the loop kept repeating itself. Never a count of steps without progress (t1049). */
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
   * The loop's budget ran out: the purse refused a decision, or the tokens or
   * the clock left none. No count of turns or tool calls ends a loop (t1056).
   * **Nothing about what the model produced is being reported here**, and a
   * result carrying this code always carries `exhaustion` saying which bound
   * ran out and how far the draft had got (`./exhaustion.ts`).
   */
  | "llm_evidence_loop.iteration_limit"
  | "llm_evidence_loop.cancelled"
  /**
   * No longer produced (t1056). It was the ending of a loop whose replies kept
   * arriving unreadable until a count of them in a row was reached; no count
   * ends a loop now, and the same unreadable reply again is a repeat loop
   * detection steers (`./unreadable-reply.ts`). Kept, like `evidence_limit`,
   * because the outcome tables callers key by this union still name it
   * (`../../adaptation/recovery/exploration-outcome.ts`).
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
    /**
     * Present exactly when the code is `llm_evidence_loop.invalid_configuration`:
     * the check that refused the configuration, its figures and a sentence
     * (`../configuration-issue/`, t584).
     */
    configuration?: AutomationStudioLlmEvidenceLoopConfigurationIssue;
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
  providerUnavailable?: AutomationStudioLlmEvidenceLoopProviderUnavailable,
  /** Which check refused the configuration, for the one code that says one did. */
  configuration?: AutomationStudioLlmEvidenceLoopConfigurationIssue
): AutomationStudioLlmEvidenceLoopResult {
  return { ok: false, code, trace, steps, accounting, ...(exhaustion ? { exhaustion } : {}), ...(unreadable ? { unreadable } : {}), ...(providerUnavailable ? { providerUnavailable } : {}), ...(configuration ? { configuration } : {}) };
}
