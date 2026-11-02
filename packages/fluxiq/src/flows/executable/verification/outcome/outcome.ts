import type { ResultVerificationSkipped } from "./skipped.ts";
import type { ResultVerification } from "./verification.ts";

/** What a finished run's verification produced: a verdict, or a stated reason there is none. */

export type ResultVerificationOutcome =
  | (ResultVerification & { performed: true })
  | ResultVerificationSkipped;
