// How much of each pattern it takes to act, measured over the saved step logs
// (`docs/working/answer-first-plan/reports/loop-detection.md` has the table).

/** Runs of one call on one page, with only free text changed, each bringing nothing, that make a near repeat. */
export const AUTOMATION_STUDIO_LLM_LOOP_NEAR_REPEAT_AT = 2;

/** Runs of one call that each succeeded, with the same result and no new row between them, that are a success again (t969: `core.run_flow` seven times in run-mwoi785f-ebe09067, each ending normally). */
export const AUTOMATION_STUDIO_LLM_LOOP_SAME_SUCCESS_AT = 3;

/**
 * Replays of the Flow's own steps, from any step, that neither changed the result nor reached its end for the
 * first time since it last changed, with no completion tried between, that make a replay again (t973:
 * `core.run_flow` thirteen times from steps 29, 33, 34 and 38 in run-mworaue7-5a56f19a, never completing). As
 * many as a success again takes: it is the same failure with the starting step varied.
 */
export const AUTOMATION_STUDIO_LLM_LOOP_SAME_REPLAY_AT = AUTOMATION_STUDIO_LLM_LOOP_SAME_SUCCESS_AT;

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

/**
 * Completions refused in a row over the same evidence that call for a fresh round. Low, because
 * nothing refuses one before it is paid for: each is a whole context, about $0.14 on a long run
 * (`run-mw37vz9n-a77a02c2`). Only the path that can act on it reads these.
 */
export const AUTOMATION_STUDIO_LLM_LOOP_REFUSED_COMPLETIONS_BEFORE_CHANGE = 2;
