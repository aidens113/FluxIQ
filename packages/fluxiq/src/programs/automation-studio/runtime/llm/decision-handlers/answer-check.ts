// Whether a look the loop is about to answer from memory still describes the
// page, checked before the answer is given.
//
// The answered note used to say "nothing has changed since", which Core had not
// checked: a look is answered from memory while no action has run since it, and
// a page can move with no action -- a list that loads late, a banner that
// arrives, a redirect that lands. When the caller can digest its state and the
// answering call recorded the state it left, one fresh digest settles it:
//
//   - the same digest: the answer stands, and the note says the page was seen
//     unchanged;
//   - a different digest: the page moved by itself, so the request is run
//     instead of answered -- at most once per request signature, which carries
//     its epoch, so a page that never settles cannot turn every ask into a call;
//   - no digest to compare, or a request already run again once: answered as
//     before, `unverified`;
//   - a digest that throws: answered as before too, as `digest_failed`. The
//     answer from memory is what the loop gave before this check existed, and
//     a page Core cannot read now is no reason to run a look it already holds.
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/** What the check found: run the request instead, or answer it -- saying the page is unchanged only when it was seen so. */
export type AutomationStudioLlmEvidenceAnswerCheckOutcome = "run" | "unchanged" | "unverified" | "digest_failed";

/** Checks a look before it is answered from memory. */
export async function automationStudioLlmEvidenceAnswerCheck(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  input: { iteration: number; toolId: string; answeredByCallId: string; requestSignature: string }
): Promise<AutomationStudioLlmEvidenceAnswerCheckOutcome> {
  const capture = context.input.captureStateDigest;
  const answering = context.draftSteps.find((step) => step.callId === input.answeredByCallId);
  // Only a look is verified: an answered action is a request the loop refuses
  // to repeat, not a description of the page.
  if (!capture || !answering || answering.effect !== "observe" || answering.stateAfter === undefined) return "unverified";
  let fresh: string | undefined;
  try {
    // A call id of the loop's own, so the digest is never paired with a step's.
    fresh = await capture({ callId: `core.answer_check.${input.iteration}`, toolId: input.toolId, ...(context.input.signal ? { signal: context.input.signal } : {}) });
  } catch {
    return "digest_failed";
  }
  if (fresh === undefined) return "unverified";
  if (fresh === answering.stateAfter) return "unchanged";
  if (context.pageMovedReruns.has(input.requestSignature)) return "unverified";
  context.pageMovedReruns.add(input.requestSignature);
  return "run";
}
