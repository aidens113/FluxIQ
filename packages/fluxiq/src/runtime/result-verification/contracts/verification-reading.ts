import type { AutomationStudioResultVerification } from "./verification.ts";

/**
 * Whether a verification lets a run keep reporting success.
 *
 * The single reader of a verdict, and the whole of the fail-closed rule: only
 * `answers` passes. `unsure` fails here, and it must, because the failure this
 * module exists to catch is precisely a run that reported success while nobody
 * had checked. A verification that was never performed is not a verdict and
 * never reaches this function.
 */
export function automationStudioResultVerificationAnswers(verification: AutomationStudioResultVerification): boolean {
  return verification.verdict === "answers";
}

/**
 * Whether a verification fails the run it judged.
 *
 * Every verdict but `answers` does, fail-closed, with one exception: a result
 * the model was asked about twice, with the same evidence, without either
 * saying `yes` twice or `no` twice (`model_disagreed`, `model_unconfirmed`).
 * Both `no` and `unknown` were measured to flip on identical rows at
 * temperature 0 (2026-09-18, 2026-09-21), and failing a run whose every step
 * succeeded on an answer the model does not repeat is the false failure this
 * exception exists to stop. Such a result is recorded `unverified`, never
 * `confirmed`.
 */
export function automationStudioResultVerificationFailsRun(verification: AutomationStudioResultVerification): boolean {
  if (automationStudioResultVerificationAnswers(verification)) return false;
  return verification.basis !== "model_disagreed" && verification.basis !== "model_unconfirmed";
}
