import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowBootstrapEvidenceSteps } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceLoopTrace } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import { requiredBootstrapCommandId } from "./field-readings.ts";

// The evidence loop trace an audit event records: validated first, then
// counted, so a malformed trace never reaches a reader as accounting.
//
// What the trace keeps is also what a *proposed* build can ever say about
// itself. The adaptation stores the sanitized trace and the created audit
// event carries the detail built from it, and both used to drop the two
// members that make a decision legible -- the code it came to and whether its
// effect was applied -- so a successful build published counts and a sorted
// list of tool ids and nothing a reader could compare against a refused
// build's decisions. Both are kept now, and the detail carries the same steps
// the refusal path publishes.

/** The shape a result code must have to be kept: no whitespace, so no sentence. */
const EVIDENCE_RESULT_CODE = /^[a-z0-9_.:-]{1,100}$/i;

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
    // Bounded by shape rather than by an allow-list: the codes come from the
    // loop, from a domain's refusal and from validation, and a closed list
    // here would silently drop a new one. A value that is not code-shaped is
    // left behind rather than failing the build, because it is a reader's
    // detail and not the build's result.
    if (item.resultCode !== undefined && typeof item.resultCode === "string" && EVIDENCE_RESULT_CODE.test(item.resultCode)) clean.resultCode = item.resultCode;
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
    toolIds: [...new Set(clean.flatMap((item) => item.toolId ? [item.toolId] : []))].sort(),
    // Every decision in order, the same three fields a refused build's
    // diagnostic carries. `toolIds` above is a sorted set and says nothing
    // about sequence, so it can never show what the build did, only what it
    // used.
    steps: automationStudioFlowBootstrapEvidenceSteps(clean)
  };
}
