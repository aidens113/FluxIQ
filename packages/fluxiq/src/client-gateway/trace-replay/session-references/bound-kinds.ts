// The event kinds the gateway tap marks with a session reference (P3):
// inbound, outbound, disposition, lifecycle and artifact. Synthesized and
// control events belong to no session. A kind alone does not decide it: an
// event of these kinds on a stream the tap does not write belongs to no session
// either (`./session-bound.ts`).

export const CLIENT_GATEWAY_TRACE_SESSION_BOUND_KINDS: ReadonlySet<string> = new Set(["inbound", "outbound", "disposition", "lifecycle", "artifact"]);
