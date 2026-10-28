// A failed run whose result check only doubted the rows, and whose repair changed
// nothing, ends on its own words: the saved Flow is unchanged, so "Couldn't fix
// your Flow" would say a working Flow was broken (live run `run-mvskodlp-9966d618`,
// t785: the rows were right, the check's judges alone doubted them).
//
// Core says it in the settling row's sentence (`runtime/activity/wording/run-ending.ts`
// builds it from this phrase), so the headline reads the same words instead of a new
// wire field.

/** The words that close such an ending; shared by the sentence's builder and the headline's reader. */
export const ACTIVITY_DOUBTED_ENDING_CLOSE = "the saved Flow is unchanged";

/** The headline for such an ending. */
export const ACTIVITY_DOUBTED_HEADLINE = "The check doubted the result";

/** Whether `words` (a settling row's label or text) end on the doubted-and-unchanged ending. */
export function endsOnDoubt(...words: ReadonlyArray<string | undefined>): boolean {
  return words.some((text) => typeof text === "string" && text.includes(ACTIVITY_DOUBTED_ENDING_CLOSE));
}
