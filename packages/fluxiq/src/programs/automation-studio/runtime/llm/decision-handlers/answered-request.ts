// A request the loop answers itself: the tool is not run, the result that
// already answers it is moved to the end of the evidence, where the model's
// window always reaches, and a note naming it follows.
//
// The note says what the request repeats (`../evidence-loop/answered-request.ts`):
// how often it has been asked, when it was answered, the newest action before
// it, and whether Core has just seen the page unchanged. The second time one
// request is answered from the same result, the redirect is given at once
// rather than when the no-progress count reaches it: by then the model has been
// told twice, and a third ask is the loop the count exists to stop.
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID,
  automationStudioLlmEvidenceAnsweredRequestNote,
  automationStudioLlmEvidenceLoopFailure as failure,
  type AutomationStudioLlmEvidenceAnsweredRequestCode,
  type AutomationStudioLlmEvidenceLoopDecision,
  type AutomationStudioLlmEvidenceLoopTrace
} from "../evidence-loop/index.ts";
import { automationStudioLlmEvidenceAskedAgain } from "./look-withdrawal.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext, AutomationStudioLlmEvidenceDecisionNext } from "./types.ts";

/**
 * Answers one tool call from what the loop already holds: the loop ends, or
 * asks again. It takes no digest (`./answer-check.ts`), and an answer given
 * right after a redirect withdraws looks (`./look-withdrawal.ts`).
 */
export function automationStudioLlmEvidenceHandleAnsweredRequest(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  decision: Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }>,
  code: AutomationStudioLlmEvidenceAnsweredRequestCode,
  answeredByCallId: string,
  /** The request as the repeat policy keys it (`../repeat-policy.ts`): the same one the answering call was recorded under. */
  requestSignature: string
): Exclude<AutomationStudioLlmEvidenceDecisionNext, { kind: "rerun" }> {
  const { limits, trace, accounting, draftSteps, noProgress, evidence, history } = context;
  const end = (endCode: Parameters<typeof failure>[1]): { kind: "end"; result: ReturnType<typeof failure> } => ({ kind: "end", result: failure(draftSteps, endCode, trace, accounting) });
  noProgress.answeredFromEvidence(answeredByCallId, decision.toolId);
  // The node the answering call ran: the same request, so the same node.
  const actionId = draftSteps.find((candidate) => candidate.callId === answeredByCallId)?.actionId;
  const signature = requestSignature;
  const repeat = history.record(iteration, { kind: "answered", signature, toolId: decision.toolId, ...(actionId !== undefined && actionId !== decision.toolId ? { actionId } : {}), code, answeredByCallId });
  const step: AutomationStudioLlmEvidenceLoopTrace = { iteration, decision: "tool_call", toolId: decision.toolId, resultCode: code, ...(decision.usage ? { usage: decision.usage } : {}) };
  if (noProgress.reached()) {
    context.recordRow({ ...step, resultCode: "llm_evidence_loop.rejected.repeat_without_progress" });
    return end("llm_evidence_loop.repeat_without_progress");
  }
  const records = history.records();
  const answering = records.find((record) => (record.decision.kind === "call" || record.decision.kind === "look") && record.decision.callId === answeredByCallId);
  const note = automationStudioLlmEvidenceAnsweredRequestNote({
    code, toolId: decision.toolId, answeredByCallId, stepsWithoutProgress: noProgress.steps, maxStepsWithoutProgress: limits.maxStepsWithoutProgress,
    ...(repeat ? { timesAsked: repeat.times, askedAt: repeat.iterations } : {}),
    ...(answering ? { answeredAt: answering.iteration } : {}),
    ...(context.lastAction ? { lastActionBefore: context.lastAction } : {})
  });
  const answeredTool = context.toolsById.get(decision.toolId);
  const draftChanged = context.draftRecord({ iteration, actionId: decision.toolId, input: decision.input, effect: answeredTool?.effect ?? "observe", effectApplied: false, proposes: false, resultCode: code });
  const noteBytes = context.reserveEvidence(note);
  if (noteBytes === undefined) {
    context.recordRow(step, { draftChanged });
    return end("llm_evidence_loop.evidence_limit");
  }
  const earlier = evidence.findIndex((entry) => entry.callId === answeredByCallId);
  if (earlier >= 0) evidence.push(...evidence.splice(earlier, 1));
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID, value: note });
  context.recordRow({ ...step, evidenceBytes: noteBytes }, { draftChanged });
  // After the note, so the redirection is the newest thing the model reads;
  // at once from the second answer out of the same result.
  const answeredAgain = records.filter((record) => record.decision.kind === "answered" && record.decision.signature === signature && record.decision.answeredByCallId === answeredByCallId).length;
  // Asked again straight after a redirect: looking is withdrawn until an action runs.
  automationStudioLlmEvidenceAskedAgain(context, iteration);
  noProgress.redirect(iteration, answeredAgain >= 2);
  return { kind: "continue" };
}
