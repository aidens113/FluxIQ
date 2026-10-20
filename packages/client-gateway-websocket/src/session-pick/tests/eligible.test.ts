// The one rule for which client session a host may drive.

import { describe, expect, it } from "vitest";
import type { ClientGatewayCapability, ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import { clientGatewaySessionEligible, type ClientGatewaySessionCriteria } from "../index.ts";

function session(overrides: Partial<ClientGatewaySession> = {}): ClientGatewaySession {
  return {
    sessionId: "session-1",
    clientId: "client-1",
    clientType: "extension",
    name: "Test client",
    status: "ready",
    connectedAt: 1,
    lastSeenAt: 1,
    capabilities: [{ id: "demo.actions", kind: "action", metadata: { domainId: "demo" } }],
    ...overrides
  };
}

const criteria: ClientGatewaySessionCriteria = {
  clientType: "extension",
  serves: (capability: ClientGatewayCapability) => capability.id === "demo.actions" && capability.metadata?.domainId === "demo"
};

describe("clientGatewaySessionEligible", () => {
  it("accepts a ready, idle session of the client type offering a capability it serves", () => {
    expect(clientGatewaySessionEligible(session(), criteria)).toBe(true);
  });

  it("refuses a session that is not ready", () => {
    expect(clientGatewaySessionEligible(session({ status: "pairing_required" }), criteria)).toBe(false);
    expect(clientGatewaySessionEligible(session({ status: "connected" }), criteria)).toBe(false);
  });

  it("refuses a session that has disconnected", () => {
    expect(clientGatewaySessionEligible(session({ disconnectedAt: 5 }), criteria)).toBe(false);
  });

  it("refuses another client type", () => {
    expect(clientGatewaySessionEligible(session({ clientType: "cli" }), criteria)).toBe(false);
  });

  it("refuses a recording session", () => {
    expect(clientGatewaySessionEligible(session({ activeRecordingId: "rec-1" }), criteria)).toBe(false);
    expect(clientGatewaySessionEligible(session({ activeRecordingId: null }), criteria)).toBe(true);
  });

  it("refuses a session offering no capability the host serves", () => {
    expect(clientGatewaySessionEligible(session({ capabilities: [{ id: "demo.actions", kind: "action", metadata: { domainId: "other" } }] }), criteria)).toBe(false);
    expect(clientGatewaySessionEligible(session({ capabilities: [] }), criteria)).toBe(false);
  });

  it("with alsoDeclaring named, requires the session to declare that capability too", () => {
    expect(clientGatewaySessionEligible(session(), { ...criteria, alsoDeclaring: "demo.structure" })).toBe(false);
    const declaring = session({ capabilities: [
      { id: "demo.actions", kind: "action", metadata: { domainId: "demo" } },
      { id: "demo.structure", kind: "action" }
    ] });
    expect(clientGatewaySessionEligible(declaring, { ...criteria, alsoDeclaring: "demo.structure" })).toBe(true);
  });
});
