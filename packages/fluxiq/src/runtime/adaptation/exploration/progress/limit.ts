/**
 * Consecutive steps that may fail to advance before the exploration is stopped.
 *
 * Three, not one: a single barren step is ordinary -- an observation that finds
 * the thing absent is a finding -- and a refusal is meant to be feedback the
 * model acts on. Three in a row is a loop that has stopped responding to what
 * it is being told.
 */
export const AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS = 3;
