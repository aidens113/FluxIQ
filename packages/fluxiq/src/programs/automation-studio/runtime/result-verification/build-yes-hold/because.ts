// Why a playback's double no was or was not held to its build's yes (t664).
//
// **Why.** A8 frozen pair 7 candidate towels `run-mvahlxuu-760d9e28`: the
// playback stored the build trial's very rows and both calls said no, so by its
// rule the hold (`./held-double-no.ts`) should have set the nos aside; it did
// not, and nothing on the run, its record or the log said which precondition
// failed. Every double no a run's result check reaches now carries one of these
// codes, in the order the hold reads its preconditions, on the run's record
// (`../run-outcome.ts`, `resultVerification.buildYesHold`) and in one
// build-trace line. A code, never a sentence: nothing of the page or the rows.
//
// - `no_build_trial`: the saved Flow names no judged build trial, or the run is
//   that trial itself.
// - `revision_mismatch`: the run did not execute exactly the graph versions the
//   trial judged, or did not run the whole Flow.
// - `trial_not_confirmed`: the trial was not a yes its first two judge calls
//   reached: another verdict, one call, or a yes reached by asking calls again
//   (more than two).
// - `request_differs`: the trial was judged against another request.
// - `rows_differ`: the run did not store the trial's very rows.
// - `nos_not_weighed`: the double no carries no weighing of each call's no by
//   Core's record, so no no can be shown to be refuted.
// - `no_stands_whole`: Core's record contradicts no part of at least one no.
// - `held`: the double no was set aside, unverified.

/** Every reason, in the order the hold reads its preconditions (header). */
export const AUTOMATION_STUDIO_RESULT_BUILD_YES_HOLD_BECAUSE = [
  "no_build_trial",
  "revision_mismatch",
  "trial_not_confirmed",
  "request_differs",
  "rows_differ",
  "nos_not_weighed",
  "no_stands_whole",
  "held"
] as const;

/** Why the hold did or did not set a double no aside (header). */
export type AutomationStudioResultBuildYesHoldBecause = typeof AUTOMATION_STUDIO_RESULT_BUILD_YES_HOLD_BECAUSE[number];

/** What a double no's record says of the hold: whether it fired, and why. */
export type AutomationStudioResultBuildYesHoldRecord = { held: boolean; because: AutomationStudioResultBuildYesHoldBecause };
