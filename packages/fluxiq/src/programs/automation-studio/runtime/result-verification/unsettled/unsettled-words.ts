/**
 * The closing sentence of a verification two checks did not settle
 * (`../agreement.ts`), as each unit of work reads it.
 *
 * A run is not failed on such checks, and its result card says so (`run`). A
 * build cannot finish on them: its test has to be judged to do what was asked.
 * There the run's sentence sat on the judge's card directly above an ending
 * saying the build was not finished (t193 1003, D10), so a build's card says
 * what a split means there instead (`build`, `../check-activity.ts`). The
 * recorded reason keeps the run's sentence; only the card a build shows swaps it.
 */
export const AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS = Object.freeze({
  model_disagreed: Object.freeze({
    run: "Neither answer counts for more than the other, so the result is not confirmed, and the run is not marked as failed for it.",
    build: "Since they disagree, the build cannot finish on this test."
  }),
  model_unconfirmed: Object.freeze({
    run: "That does not show the run went wrong, so the result is not confirmed, and the run is not marked as failed for it.",
    build: "Since neither confirmed it, the build cannot finish on this test."
  })
} as const);
