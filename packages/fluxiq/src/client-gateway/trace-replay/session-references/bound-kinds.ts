// The event kinds the gateway tap marks with a session reference (P3):
// inbound, outbound, disposition, lifecycle and artifact. Synthesized and
// control events belong to no session.

export const CLIENT_GATEWAY_TRACE_SESSION_BOUND_KINDS: ReadonlySet<string> = new Set(["inbound", "outbound", "disposition", "lifecycle", "artifact"]);
