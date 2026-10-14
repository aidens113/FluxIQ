import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";

/**
 * How the supervisor's own tools answer: `refused` for a call that did
 * nothing, with its code, the instruction and what it found, and `answered`
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
      // A refusal the model clears by doing something else first, so the identical call after it is never answered from memory.
      ...(options.retry ? { resultReason: "retry_allowed" } : {})
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
