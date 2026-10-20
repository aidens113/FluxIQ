import type { AutomationStudioLlmEvidenceCandidateReceipt } from "./receipt.ts";

/**
 * What a note says of a receipt that cannot be tested as it stands, in place of
 * telling the model to test it (t741, `./receipt.ts`); undefined when it can.
 *
 * Social `run-mvgoawg4-ed85dd5a` 0166-0167: two notes recommended testing a
 * revision whose trial had answered `execution_failed` and which refused
 * submissions had since cleared; the test was refused as stale. A trial that
 * failed on record needs a changed submission; a receipt only cleared needs
 * submitting again before it can be tested.
 */
export function automationStudioLlmEvidenceUntestableReceiptWords(candidate: AutomationStudioLlmEvidenceCandidateReceipt, tools: { submit: string; test: string }): string | undefined {
  if (!candidate.lastTrial && !candidate.stale) return undefined;
  const receipt = `The latest accepted candidate has receipt ${JSON.stringify({ revision: candidate.revision, digest: candidate.digest })}.`;
  const cleared = candidate.stale ? ` A refused submission has since cleared it, so ${tools.test} would refuse it as stale.` : "";
  if (candidate.lastTrial) {
    return `${receipt} Its trial already answered ${candidate.lastTrial}.${cleared} Do not test it again: a changed submission is needed. Correct the Flow for what that trial's feedback names, submit the whole candidate with ${tools.submit}, then test the revision and digest it returns. Complete only after yes for that exact receipt.`;
  }
  return `${receipt}${cleared} Do not test it as it stands: submit the whole candidate again with ${tools.submit}, then test the revision and digest it returns. Complete only after yes for that exact receipt.`;
}
