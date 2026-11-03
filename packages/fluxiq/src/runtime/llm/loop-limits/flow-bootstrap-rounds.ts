// How many live rounds one Flow Bootstrap may run in all: the exploration,
// then each repair or each exploring-again of an empty draft
// (`../flow-bootstrap/unfinished-build/phases.ts`).
//
// It lives here, beside the one round's limits, because a build's published
// record now covers every round it ran (t214): the reader of a stored failure
// (`../flow-bootstrap/generation-failure/diagnostic-parse.ts`) bounds a
// build's decisions, tool calls and trace rows at one round's ceiling times
// this, and must read the number without importing the lifecycle that runs
// the rounds.

/**
 * Live rounds one build may run in all, the exploration included: the far
 * backstop under the budgets, which bind first in any build that pays for its
 * decisions. Reaching it is reported as the budget it is.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS = 6;
