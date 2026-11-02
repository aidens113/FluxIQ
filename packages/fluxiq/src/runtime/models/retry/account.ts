// What a retried provider call did, attempt by attempt.
//
// **The record is the point, not a by-product.** The loop this describes absorbs
// a fault the person never sees, and an absorbed fault that leaves no trace is
// indistinguishable from a call that simply took longer. Two live runs were read
// for a day as the provider rejecting our request because the one fact that
// would have settled it -- what the provider answered -- was computed and
// discarded. A wait is the same kind of fact: a run that survived three rate
// limits has to be able to say so, or the next person measuring its wall clock
// finds an unexplained gap and guesses.
//
// Only failed attempts are listed. The attempt that answered is the call's own
// result and is accounted for everywhere a call already was -- its usage, its
// cost, its line on the run's receipt.

/** One provider request that failed, and what followed it. */
export type AutomationStudioLlmProviderRetryAttempt = {
  /** Which attempt this was, counting the first as 1. */
  attempt: number;
  /** The failure's own code, as `normalizedAutomationStudioLlmProviderFailure` named it. */
  code: string;
  /** The status the provider answered with, when it answered one. */
  status?: number;
  /** Whether the adapter called this fault temporary. The loop trusts this and derives nothing. */
  retryable: boolean;
  /** How long the attempt itself took. */
  elapsedMs: number;
  /** How long the loop waited after it. `0` when nothing followed. */
  waitedMs: number;
  /** Where the wait came from. Absent when nothing followed. */
  waitSource?: "backoff" | "provider_hint";
};

/**
 * Why the loop stopped asking.
 *
 * `answered` is the ordinary end. `not_retryable` is the adapter's verdict --
 * a 400, an authentication failure, a malformed request of our own making --
 * and is the *correct* end for those: retrying one spends the run's money to be
 * told the same thing. The three bounds are the ones `limits.ts` states.
 */
export type AutomationStudioLlmProviderRetryStop =
  | "answered"
  | "not_retryable"
  | "attempts_exhausted"
  | "call_deadline"
  | "run_allowance"
  | "cancelled";

/** The whole account of one provider call's attempts. */
export type AutomationStudioLlmProviderRetryAccount = {
  /** Every attempt that failed, oldest first. Empty when the first one answered. */
  attempts: readonly AutomationStudioLlmProviderRetryAttempt[];
  /** Provider requests made beyond the first. */
  retries: number;
  /** Every wait added together. */
  waitedMs: number;
  /**
   * The wall clock the retrying added: the waits, plus the attempts after the
   * first. What a caller subtracts to compare this call against an unretried
   * one, and what the run's allowance is charged.
   */
  addedMs: number;
  stop: AutomationStudioLlmProviderRetryStop;
};
