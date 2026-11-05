// How much of each pattern it takes to act, measured over the saved step logs
// (`docs/working/answer-first-plan/reports/loop-detection.md` has the table).

/** Runs of one call on one page, with only free text changed, each bringing nothing, that make a near repeat. */
export const AUTOMATION_STUDIO_LLM_LOOP_NEAR_REPEAT_AT = 2;

/** The longest repeating block a cycle is looked for at: A B A B up to A B C D A B C D. */
export const AUTOMATION_STUDIO_LLM_LOOP_MAX_CYCLE_PERIOD = 4;

/** One call alone is a cycle only from this many in a row across pages (a toggle); on one page it is a near repeat. */
export const AUTOMATION_STUDIO_LLM_LOOP_SINGLE_CYCLE_AT = 3;

/** Calls in a row with no new page state, row, landed act or draft change that make a window of no progress. */
export const AUTOMATION_STUDIO_LLM_LOOP_NO_PROGRESS_WINDOW = 12;

/** Landings of one stated-lasting act on one target, with no new row identity between, that are the same act again. */
export const AUTOMATION_STUDIO_LLM_LOOP_SAME_ACT_AT = 2;

/** Refusals, or further findings after them, in one incident before the ladder's next step: as many as refused repeats in a row end a round. */
export const AUTOMATION_STUDIO_LLM_LOOP_REFUSALS_BEFORE_CHANGE = 3;

/** Fresh approaches that may loop too before the work stops and asks the person. */
export const AUTOMATION_STUDIO_LLM_LOOP_APPROACHES_BEFORE_ASKING = 2;

/**
 * Completions refused in a row over the same evidence that call for a fresh round. Low, because
 * nothing refuses one before it is paid for: each is a whole context, about $0.14 on a long run
 * (`run-mw37vz9n-a77a02c2`). Only the path that can act on it reads these.
 */
export const AUTOMATION_STUDIO_LLM_LOOP_REFUSED_COMPLETIONS_BEFORE_CHANGE = 2;

/** And that stop the work to ask the person, whatever approaches it has had. */
export const AUTOMATION_STUDIO_LLM_LOOP_REFUSED_COMPLETIONS_BEFORE_ASKING = 3;
