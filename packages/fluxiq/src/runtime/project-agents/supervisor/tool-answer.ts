import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";

/**
 * How the supervisor's own tools answer: `refused` for a call that did
 * nothing, with its code, the instruction and what it found, `uncertain` for
 * one that failed after it may have acted, and `answered`
 * for one that did its work. `acted` says the work may have moved the target
 * (builders ran), so the loop does not take an earlier look as still current.
 */
export const automationStudioProjectSupervisorToolAnswer = Object.freeze({
  refused(code: string, instruction: string, detail: JsonObject = {}, options: { retry?: boolean } = {}): AutomationStudioLlmEvidenceToolExecutionResult {
    return {
      kind: "llm_evidence_tool_execution",
      evidence: { ok: false, code, instruction, ...detail },
      effectApplied: false,
      targetsUnchanged: true,
      resultCode: code,
      // A refusal the model clears by doing something else first: a diagnostic for the step log, which grants nothing. The identical call runs once a fact the loop reads changed (`./request-keys/`; a named precondition in `../../llm/repeat-guard/outcomes.ts`).
      ...(options.retry ? { resultReason: "retry_allowed" } : {})
    };
  },

  /**
   * For a call that failed after it may have acted (t849): it claims neither nothing applied nor an unchanged target, and says
   * so as a typed fact, `ambiguous` and not retryable (`@fluxiq/contracts/automation`). The repeat guard records it as any
   * refusal and nothing exempts it (`../../llm/repeat-guard/retry-later.ts` wants a retryable, unacted failure that applied nothing).
   */
  uncertain(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceToolExecutionResult {
    return {
      kind: "llm_evidence_tool_execution",
      evidence: { ok: false, code, instruction, ...detail },
      effectApplied: true,
      targetsUnchanged: false,
      resultCode: code,
      failure: { stage: "execution", category: "ambiguous_or_unknown", effect: "ambiguous", code, retryable: false }
    };
  },

  answered(evidence: JsonObject, options: { acted?: boolean; code?: string } = {}): AutomationStudioLlmEvidenceToolExecutionResult {
    return {
      kind: "llm_evidence_tool_execution",
      evidence,
      effectApplied: options.acted === true,
      targetsUnchanged: options.acted !== true,
      ...(options.code ? { resultCode: options.code } : {})
    };
  }
});
