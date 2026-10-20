// Picking the one session a host drives: the requested one only when it is
// eligible, else the only eligible one, else none.

import { describe, expect, it } from "vitest";
import type { ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import { pickClientGatewaySession, type ClientGatewaySessionCriteria } from "../index.ts";

function session(sessionId: string, overrides: Partial<ClientGatewaySession> = {}): ClientGatewaySession {
  return {
    sessionId,
    clientId: `client-${sessionId}`,
    clientType: "extension",
    name: "Test client",
    status: "ready",
    connectedAt: 1,
    lastSeenAt: 1,
    capabilities: [{ id: "demo.actions", kind: "action" }],
    ...overrides
  };
}

const criteria: ClientGatewaySessionCriteria = { clientType: "extension", serves: (capability) => capability.id === "demo.actions" };

describe("pickClientGatewaySession", () => {
  it("picks the only eligible session among others that are not", () => {
    const sessions = [session("a", { status: "pairing_required" }), session("b"), session("c", { activeRecordingId: "rec-1" })];
    expect(pickClientGatewaySession(sessions, criteria)?.sessionId).toBe("b");
  });

  it("picks none when two are eligible, and none when none are", () => {
    expect(pickClientGatewaySession([session("a"), session("b")], criteria)).toBeUndefined();
    expect(pickClientGatewaySession([session("a", { status: "disconnected" })], criteria)).toBeUndefined();
    expect(pickClientGatewaySession([], criteria)).toBeUndefined();
  });

  it("picks the requested session when it is eligible, even among several eligible", () => {
    expect(pickClientGatewaySession([session("a"), session("b")], { ...criteria, requestedSessionId: "b" })?.sessionId).toBe("b");
  });

  it("picks none when the requested session is not eligible or not there, never falling back to another", () => {
    const sessions = [session("a"), session("b", { status: "pairing_required" })];
    expect(pickClientGatewaySession(sessions, { ...criteria, requestedSessionId: "b" })).toBeUndefined();
    expect(pickClientGatewaySession(sessions, { ...criteria, requestedSessionId: "missing" })).toBeUndefined();
  });

  it("applies alsoDeclaring to the pick", () => {
    const sessions = [session("a"), session("b", { capabilities: [{ id: "demo.actions", kind: "action" }, { id: "demo.structure", kind: "action" }] })];
    expect(pickClientGatewaySession(sessions, { ...criteria, alsoDeclaring: "demo.structure" })?.sessionId).toBe("b");
  });
});
