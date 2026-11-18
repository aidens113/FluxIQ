/**
 * Why a run step was skipped rather than run, on the `step` row that says so:
 *
 * - `already_done`: the run already completed the step's lasting act for the
 *   same row, so it was not done again (the executor's completed-act ledger);
 * - `already_in_state`: the step's control already showed the state it asks
 *   for, so it was not pressed (no failure, and not a lasting act this run did);
 * - `optional_absent`: a sometimes-present step whose target was not shown;
 * - `state_routed`: the page was elsewhere, so state routing passed the step
 *   over and the run went on at the step the page is at.
 *
 * Additive: a client that does not know a reason reads the row as a plain step.
 */
export const CLIENT_GATEWAY_ACTIVITY_SKIP_REASONS = Object.freeze(["already_done", "already_in_state", "optional_absent", "state_routed"] as const);
export type ClientGatewayActivitySkipReason = (typeof CLIENT_GATEWAY_ACTIVITY_SKIP_REASONS)[number];
