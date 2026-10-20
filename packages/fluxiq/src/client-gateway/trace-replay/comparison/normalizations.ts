// The fields a replay's capture is not compared on, each with the reason it
// cannot carry anything Core derived (traces and offline trials, P3; source
// plan 3.3: nothing is normalized away unless it is shown to be transport or
// capture bookkeeping). `always` apply to every replay; the others only when
// the replay used them, and the report lists exactly those.

import type { ClientGatewayTraceParityNormalization } from "../types.ts";

export const CLIENT_GATEWAY_TRACE_PARITY_NORMALIZATIONS = Object.freeze({
  always: Object.freeze([
    Object.freeze({
      field: "eventId, sequence",
      reason: "assigned by the capturing recorder; events are aligned by delivery point instead (input order, causation, command id, session reference) and their relative order is compared"
    }),
    Object.freeze({ field: "time.logicalMs, time.observedAt", reason: "when the recorder observed the event; the replay feeds inputs without waiting between them" }),
    Object.freeze({ field: "provenance.origin", reason: "a replay's capture is derived by construction (T24)" }),
    Object.freeze({ field: "artifactIds", reason: "assigned by the capturing recorder from its sequence; each artifact's digest, type and size are compared through the two manifests" })
  ] satisfies readonly ClientGatewayTraceParityNormalization[]),
  sessionIds: Object.freeze({
    field: "session ids in payloads",
    reason: "minted when a session is set up (`sessions.ts`), outside any trace; the replay's are translated one to one into the recorded ones through the trace's session references, so a message to the wrong session still diverges"
  } satisfies ClientGatewayTraceParityNormalization),
  onlySession: Object.freeze({
    field: "session reference of a legacy single-session trace",
    reason: "the trace was captured before the tap gave every event its session's reference, and its own events show it held one session (the report's sessionReferences.checks); the replay read every inbound, outbound, disposition, lifecycle and artifact event as belonging to that session, session-1, the reference the replay's tap gives it. The stored trace is not changed, and a trace that cannot be shown to hold one session is refused as a capture gap instead"
  } satisfies ClientGatewayTraceParityNormalization),
  claimedView: Object.freeze({
    field: "session.claimed lifecycle events",
    reason: "the public view of a session a trace took when it first claimed it (D23): state set up before the trace, which the replay attaches the session with instead of pairing it; the replay's own claim event is still compared with the recorded one, and so is every delivery that depends on it"
  } satisfies ClientGatewayTraceParityNormalization),
  standIn: Object.freeze({
    field: "payload of an inbound message that did not parse",
    reason: "its text is withheld at capture (D18) and Core reads nothing from it but the failure; the replay feeds a stand-in that fails to parse the same way, and the disposition Core recorded for it is still compared"
  } satisfies ClientGatewayTraceParityNormalization)
});
