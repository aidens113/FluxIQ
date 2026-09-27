// What a retried provider call may cost, and every bound that holds it there.
//
// **Why every number here is a ceiling and not a setting.** A rate limit is the
// one fault whose honest answer is "wait", and waiting is the one answer that
// can turn a failed call into a hung run. Two live runs took 167 and 194 seconds
// and made one provider call each; a reader measuring wall clock had nothing to
// attribute the gap to. So the retry loop states what it may add before it adds
// it, and a bound cuts a wait rather than a wait discovering a bound.
//
// The worst case, stated:
//
// - **Per provider call**, `maxCallMs`. The loop starts another attempt only
//   when the wait plus that attempt's own deadline still fit inside it, so the
//   figure is the whole call's ceiling and not a budget the last attempt
//   overruns. With the Lab's 25 000 ms per-attempt deadline that is one retry
//   for a slow fault (25 s + 1 s + 25 s = 51 s, and a second would be 79 s), and
//   the full three attempts for a fast one -- which is the shape that matters,
//   because a 429 arrives in milliseconds.
// - **Per run**, `maxRunAddedMs`, counting every wait and every failed retry
//   attempt across all of the run's calls. Checked the same projected way, so
//   two minutes is the ceiling rather than the point past which one more
//   unbounded attempt starts. A live run takes 300 to 950 seconds; this is what
//   retrying may add to that, in total, however many calls it makes.
//
// A retry never buys another call against the run's call backstop, its token
// budget or its cost ceiling: one question asked of the model is one call, and
// the attempts are how many times Core had to ask it before the provider
// answered. `call.ts` says why at the reservation.
export const AUTOMATION_STUDIO_LLM_PROVIDER_RETRY_LIMITS = Object.freeze({
  /** Provider requests one call may make: the first, and two retries. */
  maxAttempts: 3,
  /**
   * The wait before attempt 2 and attempt 3 when the provider asked for none.
   *
   * A second is what a rate limit usually needs, and the second step is a
   * multiple rather than a repeat so a busy provider gets a widening gap. No
   * jitter: Core runs one loop against one endpoint, so there is no herd to
   * spread, and a random wait would make the bound below unverifiable.
   */
  backoffMs: Object.freeze([1_000, 3_000]),
  /** The most one wait may be, however long a provider's own hint asks for. */
  maxWaitMs: 5_000,
  /** The most wall clock one provider call may take, attempts and waits together. */
  maxCallMs: 60_000,
  /** The most wall clock retrying may add across one whole run. */
  maxRunAddedMs: 120_000,
  /** How many runs the process-wide allowance remembers before evicting the oldest. */
  ledgerRuns: 64
});
