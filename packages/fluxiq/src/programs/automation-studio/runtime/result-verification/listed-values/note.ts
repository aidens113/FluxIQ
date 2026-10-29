// Core's note on advice that lists values the request never says (t785, F3 of
// run `run-mvskodlp-9966d618`), word for word as `../agreement/exclusion-words.ts`
// appends it. Its own module since t790 (run `run-mvswewhy-e4e469d4`), because
// the trial feedback reads the note back to suggest a per-row mark in place of
// the list (`../../service/candidate-trial/row-mark.ts`): one string, so the
// note and its reader can never drift apart.

/** The note appended, in parentheses, to advice that lists values the request does not say. */
export const AUTOMATION_STUDIO_RESULT_LISTED_VALUES_NOTE = "Core's note: this advice lists values the request does not say. These values are what the page shows today; where each row itself shows what makes it one the request asks for, test that instead of listing today's values. This is advice to weigh, not a rule.";
