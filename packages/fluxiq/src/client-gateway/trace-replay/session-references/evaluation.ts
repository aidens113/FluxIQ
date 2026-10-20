// Whether a trace's events say which session they belong to, and, for a legacy
// trace captured before the tap gave every event a session reference (P3 C1),
// whether the trace itself shows it held exactly one session. Only then may the
// replay attach that session's reference to its events (`./attached.ts`); a
// trace that cannot be shown single-session is refused, never guessed. Checked,
// each against the trace's own evidence:
//
// - no event names a session reference (a trace where some do and some do not
//   is not legacy, and is refused);
// - the outbound envelopes and lifecycle records name exactly one session id;
// - they and the hellos name at most one client id;
// - no session connects after the trace's first session-bound event (a
//   reconnect or a second session would);
// - nothing is sent or received after the session disconnected.
//
// Session and client ids are compared here, never returned.

import type { ClientGatewayTraceEvent } from "../../trace/index.ts";
import { CLIENT_GATEWAY_TRACE_SESSION_BOUND_KINDS } from "./bound-kinds.ts";
import type { ClientGatewayTraceSessionReferences } from "../types.ts";


const CHECKS: readonly string[] = Object.freeze([
  "no event names a session reference",
  "the outbound envelopes and lifecycle records name exactly one session id",
  "the outbound envelopes, lifecycle records and hellos name at most one client id",
  "no session connects after the trace's first session-bound event",
  "nothing is sent or received after the session disconnected"
]);

type Evidence = {
  referenced: number;
  unreferenced: number;
  sessionIds: Set<string>;
  clientIds: Set<string>;
  lateConnect: boolean;
  afterDisconnect: boolean;
};

export function evaluateClientGatewayTraceSessionReferences(events: readonly ClientGatewayTraceEvent[]): ClientGatewayTraceSessionReferences {
  const evidence = gather(events);
  if (evidence.unreferenced === 0) return Object.freeze({ status: "recorded" });
  const reason = refusal(evidence);
  if (reason !== undefined) return Object.freeze({ status: "refused", reason });
  return Object.freeze({ status: "single_session", checks: CHECKS });
}

function refusal(evidence: Evidence): string | undefined {
  if (evidence.referenced > 0) return "some of its events name their session and others do not";
  if (evidence.sessionIds.size === 0) return "no outbound envelope or lifecycle record names a session id";
  if (evidence.sessionIds.size > 1) return "its outbound envelopes and lifecycle records name more than one session id";
  if (evidence.clientIds.size > 1) return "its events name more than one client id";
  if (evidence.lateConnect) return "a session connects after the trace's first session-bound event";
  if (evidence.afterDisconnect) return "events are sent or received after the session disconnected";
  return undefined;
}

function gather(events: readonly ClientGatewayTraceEvent[]): Evidence {
  const evidence: Evidence = { referenced: 0, unreferenced: 0, sessionIds: new Set(), clientIds: new Set(), lateConnect: false, afterDisconnect: false };
  let bound = 0;
  let disconnected = false;
  for (const event of events) {
    if (!CLIENT_GATEWAY_TRACE_SESSION_BOUND_KINDS.has(event.kind)) continue;
    if (event.session === undefined) evidence.unreferenced += 1;
    else evidence.referenced += 1;
    const lifecycle = event.kind === "lifecycle" ? event.messageType : null;
    if (lifecycle === "session.connected" && bound > 0) evidence.lateConnect = true;
    // A disposition may still settle an input received before the disconnect.
    if (disconnected && event.kind !== "disposition") evidence.afterDisconnect = true;
    if (lifecycle === "session.disconnected") disconnected = true;
    bound += 1;
    note(evidence, event);
  }
  return evidence;
}

/** The session and client ids an outbound envelope, a lifecycle record or a hello names. */
function note(evidence: Evidence, event: ClientGatewayTraceEvent): void {
  const value = event.payload.encoding === "json" ? event.payload.value : null;
  if (!isRecord(value)) return;
  if (event.kind === "outbound" || event.kind === "lifecycle") {
    if (typeof value.sessionId === "string") evidence.sessionIds.add(value.sessionId);
    if (typeof value.clientId === "string") evidence.clientIds.add(value.clientId);
    return;
  }
  const hello = event.kind === "inbound" && event.messageType === "client.hello" ? value.payload : null;
  if (isRecord(hello) && typeof hello.clientId === "string") evidence.clientIds.add(hello.clientId);
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
