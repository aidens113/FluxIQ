/**
 * What kind of recovery a `step` row's `recovery` reports (state-aware
 * recovery plan, C11):
 *
 * - `handler`: a lifecycle handler ran (On Start, On Before, On Retry, On Fail,
 *   On Before Next);
 * - `entry`: a frame began at an alternative entry rather than its Start node;
 * - `route`: the run moved to a checkpoint, or state routing moved it to the
 *   node the page is at;
 * - `alternative`: a known alternative path or recovery Subflow was tried;
 * - `interference`: the client closed a layer the page put over itself (a
 *   notice, a promotion, a consent banner) by its dismiss control while the
 *   step ran. Its `subject` is Core's own words by layer kind, never the
 *   control's words or other page text;
 * - `reacquire`: a step whose target came from an earlier step (a read list's
 *   row, another node's answer) lost it when the page changed, so that earlier
 *   step was re-run and the same item found again by its identity (`succeeded`),
 *   or found gone (`failed`), t786. Its `subject` is Core's own words, naming
 *   the source step by its authored label at most, never page text.
 *
 * Additive: a client that does not know a kind reads the row as a plain step.
 */
export const CLIENT_GATEWAY_ACTIVITY_RECOVERY_KINDS = Object.freeze(["handler", "entry", "route", "alternative", "interference", "reacquire"] as const);
export type ClientGatewayActivityRecoveryKind = (typeof CLIENT_GATEWAY_ACTIVITY_RECOVERY_KINDS)[number];
