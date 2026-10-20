// The closed vocabularies of the client gateway trace manifest and events
// (trace-offline-trials-plan, P1; source plan sections 3.3 and 5). A trace is
// what Core received from clients during one live episode, captured inside
// the client gateway. Each list is frozen and complete: a new kind, reason or
// code is a deliberate edit here, never a string a caller invents.

/** The build activity the episode was in. */
export const CLIENT_GATEWAY_TRACE_ACTIVITIES = Object.freeze(["exploration", "test", "execution"] as const);

/**
 * What an event is. `inbound`: a client message as Core received it.
 * `outbound`: a message Core sent. `lifecycle`: connect, disconnect, pairing.
 * `disposition`: what Core did with an inbound message. `synthesized`: an
 * outcome Core produced itself (a timeout, a close). `control`: an input that
 * arrived outside the socket. `artifact`: captured content arriving.
 */
export const CLIENT_GATEWAY_TRACE_EVENT_KINDS = Object.freeze([
  "inbound",
  "outbound",
  "lifecycle",
  "disposition",
  "synthesized",
  "control",
  "artifact"
] as const);

/** Why a trace was closed. */
export const CLIENT_GATEWAY_TRACE_TERMINATION_REASONS = Object.freeze([
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "disconnected",
  "recorder_failed"
] as const);

/** Why a payload field was withheld. A redaction is a declared fidelity limitation. */
export const CLIENT_GATEWAY_TRACE_REDACTION_REASONS = Object.freeze(["credential", "secret", "personal_data"] as const);

/** How a trace that is not live was produced. */
export const CLIENT_GATEWAY_TRACE_DERIVATIONS = Object.freeze(["replay", "reingest"] as const);
