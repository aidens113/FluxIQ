/**
 * What one run says about a part version, in the terms trust is read from: the
 * verdict (a judged run's, or a part run's mapped to one), whether the run asked
 * a model anything, and when it finished. Only `confirmed` and `refuted` count;
 * `unverified` and `no_result` prove nothing either way.
 */
export type AutomationStudioPartTrustEvidence = {
  result: "confirmed" | "refuted" | "unverified" | "no_result";
  zeroModel: boolean;
  atMs: number;
};
