// A legacy single-session trace's events as the replay reads them (P3): each
// event that belongs to a session, and names none, given the reference the tap
// gives the first session a trace meets, `session-1` -- the reference the
// replay's own tap gives the one session it stands up. Applied only where
// `./evaluation.ts` showed the trace held one session, and declared in the
// parity report as a normalization. The stored trace is never changed.

import type { ClientGatewayTraceEvent } from "../../trace/index.ts";
import { CLIENT_GATEWAY_TRACE_SESSION_BOUND_KINDS } from "./bound-kinds.ts";

const ONLY_SESSION = "session-1";

export function clientGatewayTraceEventsWithOnlySession(events: readonly ClientGatewayTraceEvent[]): ClientGatewayTraceEvent[] {
  return events.map((event) => (event.session === undefined && CLIENT_GATEWAY_TRACE_SESSION_BOUND_KINDS.has(event.kind) ? Object.freeze({ ...event, session: ONLY_SESSION }) : event));
}
