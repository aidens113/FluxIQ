/**
 * How long past a command's own `timeoutMs` FluxIQ still waits for its target's
 * answer, before reporting that the target never answered.
 *
 * `timeoutMs` is the time the target is given to do the work, and a client that
 * honours it reports its own timeout, with its own failure record, when that
 * time runs out. That report still has to be produced and carried back, and a
 * client may spend time outside its budget first: the web extension settles its
 * tab for 1,000-1,250 ms before an action starts, measured end to end at
 * 1,007-1,011 ms. Waiting only `timeoutMs` would therefore always give up first
 * and discard the answer that says what happened. 3,000 ms covers that settle
 * more than twice, plus the round trip.
 *
 * Both deadlines that wait on a command use it: `RuntimeService` for every
 * adapter and transport target, and the client gateway's pending command when a
 * timeout is sent. An in-process adapter's work is bounded by the timeout
 * anyway, so the margin only delays a hung target's failure. A gateway command
 * sent with no timeout keeps `commandTimeoutMs`.
 */
export const COMMAND_ANSWER_MARGIN_MS = 3_000;
