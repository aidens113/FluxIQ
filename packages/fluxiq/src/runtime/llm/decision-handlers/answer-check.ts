// Whether a look asked again is answered from memory or looked at again, and
// what the loop says when it looked again and found the page as it was.
//
// **What this used to cost.** Before a look was answered from memory, the loop
// asked the caller for a fresh digest of the page and compared it with the one
// the answering call left. The web domain answered every digest with a whole
// page capture of its own, so every answer from memory was a "Looking at the
// page" the person watching saw -- nine of them in `run-munneauy-de8663ed`,
// none of which the model had asked Core to take. An answer from memory now
// costs nothing at all.
//
// **What it does instead.** The first time one request is asked again in the
// same epoch -- the request signature carries the epoch -- and its answering
// call recorded the state it left, the loop runs it for real: the look's own
// single capture, which reports its digest on the result
// (`../evidence-loop/tool-execution.ts`, `stateDigests`). Then:
//
//   - the same digest as the answering call left: a verified repeat. A step
//     without progress, the fresh result replaces the answering one in the
//     evidence, and the note says Core looked again and the page is exactly as
//     before;
//   - a different digest: the page moved by itself -- a list that loaded late,
//     a redirect that landed -- and the call is an ordinary look, and progress.
//
// Every later ask of that request in that epoch is answered from memory, with
// no capture: the model has been shown the page is as it was, and a page that
// never settles cannot turn every ask into a call. A request whose answering
// call recorded no state is answered from memory as it always was.
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID, automationStudioLlmEvidenceAnsweredRequestNote } from "../evidence-loop/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/** What the check decided: answer from memory, or run the request and compare what it leaves with `stateAfter`. */
export type AutomationStudioLlmEvidenceAnswerCheckOutcome =
  | { kind: "answer" }
  | { kind: "verify"; answeredByCallId: string; stateAfter: string };

/** Decides a look asked again, before it is answered. Takes no digest. */
export function automationStudioLlmEvidenceAnswerCheck(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  input: { answeredByCallId: string; requestSignature: string }
): AutomationStudioLlmEvidenceAnswerCheckOutcome {
  const answering = context.draftSteps.find((step) => step.callId === input.answeredByCallId);
  const stateAfter = context.callStates.get(input.answeredByCallId);
  // Only a look is verified: an answered action is a request the loop refuses
  // to repeat, not a description of the page.
  if (!answering || answering.effect !== "observe" || stateAfter === undefined) return { kind: "answer" };
  if (context.reaskedRequests.has(input.requestSignature)) return { kind: "answer" };
  context.reaskedRequests.add(input.requestSignature);
  return { kind: "verify", answeredByCallId: input.answeredByCallId, stateAfter };
}

/**
 * After a verified request ran: `repeat` when it left the page exactly as the
 * answering call did, `moved` when both digests are known and differ, and
 * nothing when the call cannot be compared -- it refused itself, or reported no
 * digest -- and is judged like any other call.
 */
export function automationStudioLlmEvidenceReaskOutcome(verify: { stateAfter: string }, ran: { stateAfter: string | undefined; refused: boolean }): "repeat" | "moved" | undefined {
  if (ran.refused || ran.stateAfter === undefined) return undefined;
  return ran.stateAfter === verify.stateAfter ? "repeat" : "moved";
}

/**
 * A verified repeat, shown: the answering result leaves the evidence, since the
 * fresh one just pushed says the same of the same page, and a note follows it
 * saying Core looked again and found the page exactly as before. The note is
 * dropped rather than ending anything when it will not fit.
 */
export function automationStudioLlmEvidenceShowVerifiedRepeat(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  input: { iteration: number; callId: string; toolId: string; answeredByCallId: string; requestSignature: string }
): void {
  const { evidence, history, noProgress, limits } = context;
  const earlier = evidence.findIndex((entry) => entry.callId === input.answeredByCallId);
  if (earlier >= 0) evidence.splice(earlier, 1);
  const repeat = history.repeats(input.requestSignature);
  const note = automationStudioLlmEvidenceAnsweredRequestNote({
    code: "llm_evidence_loop.looked_again_unchanged", toolId: input.toolId, answeredByCallId: input.callId,
    stepsWithoutProgress: noProgress.steps, maxStepsWithoutProgress: limits.maxStepsWithoutProgress,
    ...(repeat.times ? { timesAsked: repeat.times, askedAt: repeat.iterations } : {}),
    answeredAt: input.iteration,
    ...(context.lastAction ? { lastActionBefore: context.lastAction } : {}),
    pageUnchanged: true
  });
  context.accountEvidence(note);
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID}.${input.iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_REQUEST_CHECK_TOOL_ID, value: note });
}
