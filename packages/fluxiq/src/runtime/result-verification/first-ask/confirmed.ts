import type { AutomationStudioResultVerification } from "../contracts/index.ts";

/** What a verification knows, once its calls are made, about how its yes was reached (`./index.ts`). */
export type AutomationStudioResultFirstAskTrail = {
  /** True when the verification confirms a first yes with a second call (`confirmAnswer`, the build-test judge). */
  confirmAnswer: boolean;
  /** The outcome the verification records. */
  outcome: AutomationStudioResultVerification;
  /** Each check's own last answer, as the agreement first weighed them. */
  first: AutomationStudioResultVerification;
  second?: AutomationStudioResultVerification | undefined;
  /** True when any ask of one check gave a verdict word other than an earlier ask of that same check gave (`./model-said.ts`). */
  verdictChanged: boolean;
  /** The calls asked again with a recheck after the two checks: a refuted no, a contradicted unsure, a split's no, a blamed narrowing. */
  reasks: number;
  /**
   * What the second check asked (t691, `../agreement/ask-again.ts`):
   * `converse`, the converse question a confirming check asks of a first yes;
   * `same`, the first check's question repeated with the same evidence, which
   * confirms nothing. Absent from a caller that does not say, read as before
   * (`./index.ts`).
   */
  secondAsked?: "converse" | "same" | undefined;
};

/**
 * Whether the outcome's yes is first-ask confirmed (`./index.ts`): a
 * confirming verification's yes, both checks answering yes, the second asked
 * the converse question rather than the same one repeated, neither check's
 * verdict changed by asking it again, and no call re-asked after the two.
 */
export function automationStudioResultFirstAskConfirmed(trail: AutomationStudioResultFirstAskTrail): boolean {
  const { outcome, first, second } = trail;
  if (!trail.confirmAnswer || !second || trail.verdictChanged || trail.reasks > 0) return false;
  // An identical repeat at temperature 0 is one opinion counted twice (t691).
  if (trail.secondAsked === "same") return false;
  if (outcome.basis !== "model" || outcome.verdict !== "answers") return false;
  return [first, second].every((check) => check.basis === "model" && check.verdict === "answers");
}
