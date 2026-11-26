// A request the loop answers itself: the tool is not run, and a note naming
// the result that already answers it follows. That result stays where it is:
// every evidence entry is shown to the model, in call order
// (`../context-window.ts`).
//
// The note says what the request repeats (`../evidence-loop/answered-request.ts`):
// how often it has been asked, when it was answered, the newest action before
// it, and whether Core has just seen the page unchanged. The second time one
// request is answered from the same result, the redirect is given at once
// rather than when the no-progress count reaches it: by then the model has been
// told twice. Nothing here ends the loop (t1049): a request asked again and
// again is steered, and a repeat is loop detection's to decide.
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID,
  automationStudioLlmEvidenceAnsweredRequestNote,
  automationStudioLlmEvidenceLatestCandidateReceipt,
  type AutomationStudioLlmEvidenceAnsweredRequestCode,
  type AutomationStudioLlmEvidenceLoopDecision,
  type AutomationStudioLlmEvidenceLoopTrace
} from "../evidence-loop/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext, AutomationStudioLlmEvidenceDecisionNext } from "./types.ts";

/**
 * Answers one tool call from what the loop already holds, and asks again. It takes no digest (`./answer-check.ts`), and an answer given
 * withdraws nothing (page-diff D4: there is no look to withdraw).
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
  const { draftSteps, noProgress, evidence, history } = context;
  noProgress.answeredFromEvidence(answeredByCallId, decision.toolId);
  context.loops.answered(decision.toolId, decision.input, context.contextOf(decision.toolId), context.repeats.state());
  // The node the answering call ran: the same request, so the same node.
  const actionId = draftSteps.find((candidate) => candidate.callId === answeredByCallId)?.actionId;
  const signature = requestSignature;
  const repeat = history.record(iteration, { kind: "answered", signature, toolId: decision.toolId, ...(actionId !== undefined && actionId !== decision.toolId ? { actionId } : {}), code, answeredByCallId });
  const step: AutomationStudioLlmEvidenceLoopTrace = { iteration, decision: "tool_call", toolId: decision.toolId, resultCode: code, ...(decision.usage ? { usage: decision.usage } : {}) };
  const records = history.records();
  const answering = records.find((record) => (record.decision.kind === "call" || record.decision.kind === "look") && record.decision.callId === answeredByCallId);
  const note = automationStudioLlmEvidenceAnsweredRequestNote({
    code, toolId: decision.toolId, answeredByCallId, stepsWithoutProgress: noProgress.steps,
    ...(context.input.discoveryOnly ? { discoveryOnly: true, candidate: automationStudioLlmEvidenceLatestCandidateReceipt(evidence, context.input.finishingTools?.submit), finishing: context.input.finishingTools } : {}),
    ...(repeat ? { timesAsked: repeat.times, askedAt: repeat.iterations } : {}),
    ...(answering ? { answeredAt: answering.iteration } : {}),
    ...(context.lastAction ? { lastActionBefore: context.lastAction } : {})
  });
  const answeredTool = context.toolsById.get(decision.toolId);
  const draftChanged = context.draftRecord({ iteration, actionId: decision.toolId, input: decision.input, effect: answeredTool?.effect ?? "observe", effectApplied: false, proposes: false, resultCode: code });
  const noteBytes = context.accountEvidence(note);
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID, value: note });
  context.recordRow({ ...step, evidenceBytes: noteBytes }, { draftChanged });
  // After the note, so the redirection is the newest thing the model reads;
  // at once from the second answer out of the same result.
  const answeredAgain = records.filter((record) => record.decision.kind === "answered" && record.decision.signature === signature && record.decision.answeredByCallId === answeredByCallId).length;
  noProgress.redirect(iteration, answeredAgain >= 2);
  return { kind: "continue" };
}
