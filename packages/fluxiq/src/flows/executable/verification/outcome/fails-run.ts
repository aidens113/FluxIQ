import { resultVerificationAnswers } from "./answers.ts";
import type { ResultVerification } from "./verification.ts";

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

export function resultVerificationFailsRun(verification: ResultVerification): boolean {
  if (resultVerificationAnswers(verification)) return false;
  return verification.basis !== "model_disagreed" && verification.basis !== "model_unconfirmed";
}
