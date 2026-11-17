/**
 * What an action ended as, once Core has read it. `unknown` is an act that may
 * have landed with its answer missing; a missing answer is never a failure that
 * did nothing.
 */
export type ClientGatewayActionResultStatus = "succeeded" | "failed" | "timed_out" | "cancelled" | "unknown";
