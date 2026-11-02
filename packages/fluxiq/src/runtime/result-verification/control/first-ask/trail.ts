import type { ResultVerification } from "../../../../flows/executable/verification/index.ts";

/** What a verification knows, once its calls are made, about how its yes was reached (`./index.ts`). */
export type ResultFirstAskTrail = {
  /** True when the verification confirms a first yes with a second call (`confirmAnswer`, the build-test judge). */
  confirmAnswer: boolean;
  /** The outcome the verification records. */
  outcome: ResultVerification;
  /** Each check's own last answer, as the agreement first weighed them. */
  first: ResultVerification;
  second?: ResultVerification | undefined;
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
