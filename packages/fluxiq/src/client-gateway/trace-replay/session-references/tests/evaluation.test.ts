// P3 H: whether a trace's events name their session, and when they do not,
// whether the trace's own evidence shows it held one session. Each rule that
// refuses a legacy trace is exercised on its own, and attaching the session
// touches only the events that belong to one.

import { describe, expect, it } from "vitest";
import type { ClientGatewayTraceEvent, ClientGatewayTraceEventKind, ClientGatewayTraceJsonValue } from "../../../index.ts";
import { clientGatewayTraceEventsWithOnlySession, evaluateClientGatewayTraceSessionReferences } from "../index.ts";

let sequence = 0;

function event(kind: ClientGatewayTraceEventKind, messageType: string | null, value: ClientGatewayTraceJsonValue, session?: string): ClientGatewayTraceEvent {
  sequence += 1;
  return {
    traceId: "trace.evaluation",
    eventId: `event.${sequence}`,
    stream: "gateway",
    sequence,
    source: { id: null, sequence: null },
    time: { logicalMs: sequence, observedAt: new Date(sequence).toISOString(), sourceTimestamp: null },
    kind,
    messageType,
    correlation: { commandId: null, recordingId: null, causationEventId: null, owner: null, observationRevision: null, baseRevision: null },
    payloadSchema: null,
    payload: { encoding: "json", value },
    artifactIds: [],
    referencedDigests: [],
    redactions: [],
    provenance: { episodeId: "run.evaluation", origin: "live" },
    ...(session === undefined ? {} : { session })
  };
}

const sent = (sessionId: string, clientId = "client.one"): ClientGatewayTraceEvent => event("outbound", "server.execute_action", { type: "server.execute_action", sessionId, clientId });
const received = (): ClientGatewayTraceEvent => event("inbound", "client.state_update", { type: "client.state_update" });
const lifecycle = (name: string, sessionId: string): ClientGatewayTraceEvent => event("lifecycle", name, { event: name, sessionId, clientId: "client.one" });
const settled = (): ClientGatewayTraceEvent => event("disposition", "client.state_update", { disposition: "settled", error: null });

function refusal(events: readonly ClientGatewayTraceEvent[]): string | undefined {
  const references = evaluateClientGatewayTraceSessionReferences(events);
  return references.status === "refused" ? references.reason : undefined;
}

describe("a trace's session references", () => {
  it("are recorded when every session-bound event names its session, or none belongs to one", () => {
    expect(evaluateClientGatewayTraceSessionReferences([event("outbound", "server.ping", { sessionId: "s.1" }, "session-1"), event("synthesized", null, {}), event("control", null, {})])).toEqual({ status: "recorded" });
    expect(evaluateClientGatewayTraceSessionReferences([event("control", null, {})])).toEqual({ status: "recorded" });
  });

  it("show one session when nothing names a reference and the envelopes and records name one session and one client", () => {
    const references = evaluateClientGatewayTraceSessionReferences([lifecycle("session.connected", "s.1"), sent("s.1"), received(), settled(), sent("s.1"), lifecycle("session.disconnected", "s.1"), settled()]);
    expect(references.status).toBe("single_session");
    expect(references.status === "single_session" ? references.checks : []).toHaveLength(5);
  });

  it("refuse a trace whose events only partly name their session", () => {
    expect(refusal([sent("s.1"), event("inbound", "client.state_update", {}, "session-1"), received()])).toBe("some of its events name their session and others do not");
  });

  it("refuse a trace that names no session id", () => {
    expect(refusal([received(), settled()])).toBe("no outbound envelope or lifecycle record names a session id");
  });

  it("refuse a trace that names two session ids", () => {
    expect(refusal([sent("s.1"), received(), sent("s.2")])).toBe("its outbound envelopes and lifecycle records name more than one session id");
  });

  it("refuse a trace that names two client ids", () => {
    expect(refusal([sent("s.1", "client.one"), sent("s.1", "client.two")])).toBe("its events name more than one client id");
  });

  it("refuse a trace in which a session connects after its first session-bound event", () => {
    expect(refusal([sent("s.1"), lifecycle("session.connected", "s.1"), received()])).toBe("a session connects after the trace's first session-bound event");
  });

  it("refuse a trace that goes on after the session disconnected, but not for a disposition settling an earlier input", () => {
    expect(refusal([sent("s.1"), received(), lifecycle("session.disconnected", "s.1"), received()])).toBe("events are sent or received after the session disconnected");
    expect(refusal([sent("s.1"), received(), lifecycle("session.disconnected", "s.1"), settled()])).toBeUndefined();
  });

  it("are attached as session-1 to the events that belong to a session, and to no other", () => {
    const events = [sent("s.1"), received(), event("synthesized", null, {}), event("control", null, {})];
    expect(clientGatewayTraceEventsWithOnlySession(events).map((item) => item.session)).toEqual(["session-1", "session-1", undefined, undefined]);
    expect(events.every((item) => item.session === undefined)).toBe(true);
  });
});
