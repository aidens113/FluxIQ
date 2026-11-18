/**
 * What FluxIQ is doing now. Each value is set only by a real Core event.
 *
 * `paused` is a run held at a step boundary because it was paused, usually
 * because the person took the page (Take over): nothing is dispatched to the
 * page until it is resumed or stopped. Core sends it once when the run holds,
 * with `step` naming the node the run will execute first, and once more as
 * `running` when the run is let go to continue. A held run that is stopped
 * ends through the ordinary final event instead.
 */
export type ClientGatewayActivityPhase =
  | "thinking"
  | "exploring"
  | "building"
  | "running"
  | "paused"
  | "extracting"
  | "verifying"
  | "repairing"
  | "waiting_permission"
  | "done"
  | "failed";
