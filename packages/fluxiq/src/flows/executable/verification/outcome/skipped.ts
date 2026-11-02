/**
 * Why a run was not verified at all.
 *
 * This is not a verdict and must never be read as one. A run that produces no
 * records has no result to judge, and a deployment with no model configured
 * cannot ask for a judgement -- neither is the model saying "it looks fine".
 * Recording the reason is what keeps the two apart on a run's record.
 */

export type ResultVerificationSkipped = {
  schemaVersion: "automation-studio.result-verification.v1";
  performed: false;
  code: string;
  reason: string;
  /** The error's own name, when the verification threw before a verdict. Never in `reason`. */
  failureCode?: string;
};
