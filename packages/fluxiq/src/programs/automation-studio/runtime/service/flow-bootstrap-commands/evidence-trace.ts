import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopTrace } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import { requiredBootstrapCommandId } from "./field-readings.ts";

// The evidence loop trace an audit event records: validated first, then
// counted, so a malformed trace never reaches a reader as accounting.
//
// What a step *did* is part of the record, not decoration. `effectApplied` and
// `resultCode` were dropped here, so a proposed build -- the one anybody wants
// to study -- was stored as a list of iterations naming a tool each, with no
// way to tell a call that changed the page from one that only looked, or a
// refusal from a success. Only a refused build kept them, through a different
// path. They are validated like every other field rather than copied: the
// result code comes from a domain, so it is held to the same bound as an id.

export function sanitizeEvidenceLoopTrace(trace: AutomationStudioLlmEvidenceLoopTrace[]): AutomationStudioLlmEvidenceLoopTrace[] {
  if (!Array.isArray(trace) || trace.length > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations + 1) throw new Error("Flow Bootstrap evidence trace is invalid.");
  return trace.map((item) => {
    if (!Number.isInteger(item.iteration) || item.iteration < 0 || item.iteration > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations || !["tool_call", "complete", "unusable", "amend_draft"].includes(item.decision)) throw new Error("Flow Bootstrap evidence trace is invalid.");
    const clean: AutomationStudioLlmEvidenceLoopTrace = { iteration: item.iteration, decision: item.decision };
    if (item.callId !== undefined) clean.callId = requiredBootstrapCommandId(item.callId, "evidence call");
    if (item.toolId !== undefined) clean.toolId = requiredBootstrapCommandId(item.toolId, "evidence tool");
    if (item.evidenceBytes !== undefined) {
      if (!Number.isSafeInteger(item.evidenceBytes) || item.evidenceBytes < 0 || item.evidenceBytes > 1_048_576) throw new Error("Flow Bootstrap evidence byte count is invalid.");
      clean.evidenceBytes = item.evidenceBytes;
    }
    if (item.effectApplied !== undefined) {
      if (typeof item.effectApplied !== "boolean") throw new Error("Flow Bootstrap evidence effect flag is invalid.");
      clean.effectApplied = item.effectApplied;
    }
    if (item.resultCode !== undefined) clean.resultCode = requiredBootstrapCommandId(item.resultCode, "evidence result code");
    if (item.usage) clean.usage = { ...item.usage };
    return clean;
  });
}
export function evidenceTraceAuditDetail(trace: AutomationStudioLlmEvidenceLoopTrace[]): JsonObject {
  const clean = sanitizeEvidenceLoopTrace(trace);
  const providerDecisions = clean.filter((item) => item.iteration > 0);
  return {
    evidenceGuided: true,
    // Retained for compatibility with existing audit readers. This is the
    // total trace length and can include the deterministic iteration-0
    // observation, so it must not be interpreted as provider-call accounting.
    iterationCount: clean.length,
    traceStepCount: clean.length,
    providerCallCount: providerDecisions.length,
    decisionCount: providerDecisions.length,
    toolCallCount: clean.filter((item) => item.decision === "tool_call").length,
    evidenceBytes: clean.reduce((sum, item) => sum + (item.evidenceBytes ?? 0), 0),
    toolIds: [...new Set(clean.flatMap((item) => item.toolId ? [item.toolId] : []))].sort()
  };
}
