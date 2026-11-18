/**
 * How a wait on the person ended, on the `ask` row that says so:
 *
 * - `answered`: the person answered (a robot check's Continue, a choice, words);
 * - `allowed`: the person granted a permission ask;
 * - `waited_out`: a check that clears by itself cleared while Core waited;
 * - `declined`: the person refused, or pressed Stop at a robot check;
 * - `timed_out`: nobody answered in time;
 * - `cancelled`: the work stopped before anyone answered -- it was cancelled
 *   or failed while it waited, or the question could no longer be read.
 */
export const CLIENT_GATEWAY_ACTIVITY_RESOLUTIONS = Object.freeze(["waited_out", "answered", "allowed", "declined", "timed_out", "cancelled"] as const);
export type ClientGatewayActivityResolution = (typeof CLIENT_GATEWAY_ACTIVITY_RESOLUTIONS)[number];
