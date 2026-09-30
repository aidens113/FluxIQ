// A call that threw or returned what is not a result: recorded and shown to
// the model under its own call id when failures are observed.
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmDecisionContextSignature } from "../decision-context/index.ts";
import {
  automationStudioLlmEvidenceCallRecord as callRecord,
  automationStudioLlmEvidenceLoopFailure as failure,
  type AutomationStudioLlmEvidenceLoopTrace,
  type AutomationStudioLlmEvidenceTool
} from "../evidence-loop/index.ts";
import type { AutomationStudioLlmUsageSummary } from "../harness.ts";
import { automationStudioLlmEvidenceToolFailure, type AutomationStudioLlmEvidenceToolFailureCode } from "../tool-failure.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext, AutomationStudioLlmEvidenceDecisionNext } from "./types.ts";

/** Answers one failed call: the loop ends, or asks again with the failure shown. */
export function automationStudioLlmEvidenceHandleFailedCall(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  callId: string,
  tool: AutomationStudioLlmEvidenceTool,
  code: AutomationStudioLlmEvidenceToolFailureCode,
  value: JsonObject,
  usage?: AutomationStudioLlmUsageSummary,
  stateBefore?: string,
  /** The request as the repeat policy keys it, for a call the model decided; absent for the loop's own first look. */
  requestSignature?: string
): Exclude<AutomationStudioLlmEvidenceDecisionNext, { kind: "rerun" }> {
  const { input, limits, trace, accounting, draftSteps, noProgress, counters } = context;
  const end = (endCode: Parameters<typeof failure>[1]): { kind: "end"; result: ReturnType<typeof failure> } => ({ kind: "end", result: failure(draftSteps, endCode, trace, accounting) });
  // A failed action is part of the record: a live campaign's largest single
  // defect was a failed call that ended a build and left no trace of itself.
  // `effectApplied: false` is what says it did not happen. Saying it is not
  // an action at all would take it off the draft the model is shown, and an
  // action that was attempted and failed is part of the record of what was done.
  const record = callRecord(tool, value);
  const draftChanged = context.draftRecord({ iteration, callId, ...record, effectApplied: false, resultCode: code, ...(stateBefore ? { stateBefore, stateAfter: stateBefore } : {}) });
  // The loop's own first look is not a decision of the model's, failed or not.
  context.history.record(iteration, iteration === 0
    ? { kind: "look", callId, toolId: tool.toolId, resultCode: code, refused: true }
    : { kind: "call_failed", signature: requestSignature ?? automationStudioLlmDecisionContextSignature({ kind: "tool_call", toolId: tool.toolId, input: value }), callId, toolId: tool.toolId, ...(record.actionId !== tool.toolId ? { actionId: record.actionId } : {}), code });
  if (input.signal?.aborted) return end("llm_evidence_loop.cancelled");
  if (!context.observeToolFailures) return end("llm_evidence_loop.tool_failed");
  accounting.toolCalls += 1;
  counters.failedToolCalls += 1;
  noProgress.stepped(tool.toolId);
  if (tool.effect === "mutate") { counters.mutationEpoch += 1; counters.attemptEpoch += 1; context.lastAction = { callId, iteration }; }
  const step: AutomationStudioLlmEvidenceLoopTrace = { iteration, decision: "tool_call", callId, toolId: tool.toolId, resultCode: code, ...(usage ? { usage } : {}) };
  if (noProgress.reached()) {
    context.recordRow(step, { draftChanged });
    return end("llm_evidence_loop.tool_failed");
  }
  const failureRecord = automationStudioLlmEvidenceToolFailure({ code, toolId: tool.toolId, stepsWithoutProgress: noProgress.steps, maxStepsWithoutProgress: limits.maxStepsWithoutProgress });
  const recordBytes = context.reserveEvidence(failureRecord);
  context.recordRow(recordBytes === undefined ? step : { ...step, evidenceBytes: recordBytes }, { draftChanged });
  if (recordBytes === undefined) return end("llm_evidence_loop.evidence_limit");
  context.evidence.push({ callId, toolId: tool.toolId, value: failureRecord });
  noProgress.redirect(iteration);
  return { kind: "continue" };
}
