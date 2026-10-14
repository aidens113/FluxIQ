// A leaf beside the run cost ceiling, so the run budget and a Flow's settings
// (t583) read one backstop without a module cycle.

/**
 * The most provider calls one run may make when nobody says otherwise.
 *
 * A runaway backstop, not a working limit. What bounds a run is its estimated
 * cost ceiling, its token budget, the recovery's wall clock, and the
 * exploration's no-progress guard; a run that is still getting somewhere and
 * still has money, tokens and time is meant to keep going. This number exists
 * for the case none of those catch -- a loop that makes free, instant, ever
 * different calls forever -- and it is set where a working loop never meets it.
 *
 * It is deliberately not a per-mode constant. A host or a setting that
 * wants to allow fewer calls says so through `maxCallsPerRun`; nothing here
 * infers a count from what kind of run it is.
 */
export const AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP = 250;
