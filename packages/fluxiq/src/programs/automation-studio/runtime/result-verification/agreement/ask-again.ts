import type { AutomationStudioResultVerification } from "../contracts/index.ts";

/** How a verification reads a first answer: whether a `yes` is confirmed too. */
export type AutomationStudioResultVerificationAskAgainOptions = { confirmAnswer?: boolean | undefined };

/**
 * Whether a first verdict is asked once more: the model answered, and did not
 * answer `yes` -- or did, and the verification confirms answers. A reply that
 * carried no verdict and a call that never came back are not asked again.
 */
export function automationStudioResultVerificationAskAgain(first: AutomationStudioResultVerification, options: AutomationStudioResultVerificationAskAgainOptions = {}): boolean {
  if (first.exclusionEvidenceMissing) return true;
  return first.basis === "model" && (first.verdict !== "answers" || options.confirmAnswer === true);
}
