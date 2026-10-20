// P3 D23: when a trace first claims a session, the tap records the session's
// public view -- client type, name, version, capabilities, metadata -- read
// field by field, so a token, a pairing code or a socket on the session record
// never reaches the trace. Each trace records its own claim once; a tap that
// cannot read session records records none, as before.

import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayServerMessage } from "../../../index.ts";
import { ofKind, openTrace, traceScope } from "../../../tests/trace-tap-support.ts";
import { ClientGatewayTraceTap } from "../index.ts";

const SESSION_ID = "session.claim.1";
const PAIRING_CODE = "PAIRCODE-NEVER-RECORDED";
const BEARER = "bearer-never-recorded";

/** A session record as the gateway holds it: its public fields and the ones that must never reach a trace. */
const RECORD = {
  sessionId: SESSION_ID,
  clientId: "client.claim",
  clientType: "extension" as const,
  name: "Example client",
  version: "1.2.3",
  status: "ready" as const,
  connectedAt: 1,
  lastSeenAt: 2,
  trustedClientId: "trusted.claim",
  capabilities: [{ id: "example.reconcile", kind: "action" as const, metadata: { answersReconcile: true } }],
  metadata: { domainId: "example.domain" },
  pendingPairingCode: PAIRING_CODE,
  token: BEARER,
  socket: { send: () => undefined },
  outbound: []
};

function ping(id: string): ClientGatewayServerMessage {
  return { id, type: "server.ping", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1, sessionId: SESSION_ID, clientId: RECORD.clientId, payload: { nonce: id } };
}

describe("the session view a trace records when it first claims a session", () => {
  it("is recorded once, before the message that claimed it, with the public fields only", async () => {
    const scope = traceScope();
    const trace = openTrace("trace.claim.view");
    const tap = new ClientGatewayTraceTap({ source: scope.source, clientIdOf: () => RECORD.clientId, sessionViewOf: (sessionId) => (sessionId === SESSION_ID ? RECORD : undefined) });

    scope.within(trace.recorder, () => tap.outboundMessage(SESSION_ID, ping("m-1")));
    scope.within(trace.recorder, () => tap.outboundMessage(SESSION_ID, ping("m-2")));

    const events = await trace.events();
    expect(events.map((event) => `${event.kind}:${event.messageType ?? ""}`)).toEqual(["lifecycle:session.claimed", "outbound:server.ping", "outbound:server.ping"]);
    const claimed = ofKind(events, "lifecycle", "session.claimed")[0];
    expect(claimed?.session).toBe("session-1");
    expect(claimed?.payloadSchema).toEqual({ name: "client-gateway.trace.lifecycle", version: "1" });
    expect(claimed?.payload).toEqual({
      encoding: "json",
      value: {
        event: "session.claimed",
        sessionId: SESSION_ID,
        clientId: "client.claim",
        view: {
          clientType: "extension",
          name: "Example client",
          version: "1.2.3",
          capabilities: [{ id: "example.reconcile", kind: "action", metadata: { answersReconcile: true } }],
          metadata: { domainId: "example.domain" }
        }
      }
    });
    const written = JSON.stringify(events);
    expect(written).not.toContain(PAIRING_CODE);
    expect(written).not.toContain(BEARER);
    expect(written).not.toContain("trusted.claim");
  });

  it("is recorded by each trace that claims the session, under that trace's own reference", async () => {
    const scope = traceScope();
    const first = openTrace("trace.claim.first");
    const second = openTrace("trace.claim.second");
    const tap = new ClientGatewayTraceTap({ source: scope.source, clientIdOf: () => RECORD.clientId, sessionViewOf: () => RECORD });

    scope.within(first.recorder, () => tap.outboundMessage(SESSION_ID, ping("m-1")));
    scope.within(second.recorder, () => tap.outboundMessage(SESSION_ID, ping("m-2")));

    expect(ofKind(await first.events(), "lifecycle", "session.claimed").map((event) => event.session)).toEqual(["session-1"]);
    expect(ofKind(await second.events(), "lifecycle", "session.claimed").map((event) => event.session)).toEqual(["session-1"]);
  });

  it("is not recorded when the tap cannot read session records, or the record is gone", async () => {
    const scope = traceScope();
    const without = openTrace("trace.claim.without");
    const gone = openTrace("trace.claim.gone");
    const blind = new ClientGatewayTraceTap({ source: scope.source, clientIdOf: () => RECORD.clientId });
    const missing = new ClientGatewayTraceTap({ source: scope.source, clientIdOf: () => RECORD.clientId, sessionViewOf: () => undefined });

    scope.within(without.recorder, () => blind.outboundMessage(SESSION_ID, ping("m-1")));
    scope.within(gone.recorder, () => missing.outboundMessage(SESSION_ID, ping("m-2")));

    expect((await without.events()).map((event) => event.kind)).toEqual(["outbound"]);
    expect((await gone.events()).map((event) => event.kind)).toEqual(["outbound"]);
  });
});
