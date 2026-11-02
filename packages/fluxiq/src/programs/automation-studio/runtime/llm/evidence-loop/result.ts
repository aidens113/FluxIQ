import type { EvidenceLoopFailureCode } from "../../../../../runtime/agents/loop/index.ts";
// How a loop ends: the codes it may end on, what it hands back either way, and
// the one way a failed result is built.
//
// A failed loop still returns its trace and its steps. That is deliberate and
// was once not so: a live campaign's largest single defect was a failed call
// that ended a build and left no record of what the build had already done.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting } from "./accounting.ts";
import type { AutomationStudioLlmEvidenceLoopConfigurationIssue } from "../configuration-issue/index.ts";
import type { AutomationStudioLlmEvidenceLoopExhaustion } from "./exhaustion.ts";
import type { AutomationStudioLlmEvidenceLoopTrace } from "./trace.ts";
import type { AutomationStudioLlmEvidenceLoopUnreadable } from "../unreadable-reply.ts";
import type { AutomationStudioLlmEvidenceLoopProviderUnavailable } from "../unanswered-calls.ts";

export type AutomationStudioLlmEvidenceLoopFailureCode = EvidenceLoopFailureCode;

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
