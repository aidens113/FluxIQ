// The lifecycle events the gateway tap records of its own accord, beside the
// connects, disconnects, approvals and revocations the gateway reports to it.

export const CLIENT_GATEWAY_TRACE_LIFECYCLE_EVENTS = Object.freeze({
  /** A trace first claimed a session: its public view then (`./session-view.ts`), so a replay attaches it as it was (P3 D23). */
  sessionClaimed: "session.claimed"
});
