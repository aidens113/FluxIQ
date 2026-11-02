import type { ResultVerification } from "./verification.ts";

/**
 * Whether a verification lets a run keep reporting success.
 *
 * The single reader of a verdict, and the whole of the fail-closed rule: only
 * `answers` passes. `unsure` fails here, and it must, because the failure this
 * module exists to catch is precisely a run that reported success while nobody
 * had checked. A verification that was never performed is not a verdict and
 * never reaches this function.
 */

export function resultVerificationAnswers(verification: ResultVerification): boolean {
  return verification.verdict === "answers";
}
