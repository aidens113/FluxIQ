import { describe, expect, it } from "vitest";
import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  ClientGatewayService,
  type ClientGatewayAuditEntry,
  type ClientGatewayClientMessage,
  type ClientGatewayEvent,
  type ClientGatewayPeer
} from "../index.ts";

// t802 W2b (hosted lane A): the gateway service learns where a connection came
// from, caps pending pairings, bounds ended sessions and its audit, and hands
// security events to a listener. With default options a local install behaves
// exactly as before.
const REMOTE: ClientGatewayPeer = { address: "203.0.113.45", prefix: "203.0.113.0/24", source: "forwarded" };
const LOOPBACK: ClientGatewayPeer = { address: "127.0.0.1", prefix: "127.0.0.0/8", source: "peer" };

describe("ClientGatewayService peer", () => {
  it("keeps the peer off every public surface and audits its prefix only", async () => {
    const gateway = new ClientGatewayService();
    const events: ClientGatewayEvent[] = [];
    gateway.onEvent((event) => {
      events.push(event);
    });
    const session = gateway.connect({ peer: REMOTE });
    await hello(gateway, session.sessionId, "extension.remote");

    expect(session).not.toHaveProperty("peer");
    const snapshot = gateway.snapshot();
    const connected = snapshot.auditLog.find((entry) => entry.type === "session.connected");
    expect(connected?.metadata).toMatchObject({ clientAddressPrefix: "203.0.113.0/24" });
    expect(snapshot.auditLog.find((entry) => entry.type === "pairing.created")?.metadata).toMatchObject({ clientAddressPrefix: "203.0.113.0/24" });
    // The full address appears nowhere a caller can read: snapshot, summaries, events, outbound.
    const surfaces = JSON.stringify([snapshot, gateway.listSummaryItems({ kind: "sessions" }), events, gateway.outbound(session.sessionId)]);
    expect(surfaces).not.toContain("203.0.113.45");
    expect(surfaces).toContain("203.0.113.0/24");
  });

  it("audits a session connected without a peer exactly as before", () => {
    const gateway = new ClientGatewayService();
    const session = gateway.connect();
    const connected = gateway.snapshot().auditLog.find((entry) => entry.type === "session.connected");
    expect(connected?.metadata).toEqual({ sessionId: session.sessionId, clientId: session.clientId });
  });
});

describe("ClientGatewayService pending-pairing caps", () => {
  it("refuses a hello over the per-address cap with a clear server.error, audits it and tells the security listener", async () => {
    const gateway = new ClientGatewayService();
    const heard: ClientGatewayAuditEntry[] = [];
    gateway.onSecurityEvent((entry) => {
      heard.push(entry);
    });
    gateway.setPairingLimits({ perAddress: 2, total: 1000 });
    for (const clientId of ["extension.a", "extension.b"]) {
      const session = gateway.connect({ peer: REMOTE });
      await hello(gateway, session.sessionId, clientId);
      expect(gateway.outbound(session.sessionId).map((message) => message.type)).toContain("server.pairing_required");
    }

    const refused = gateway.connect({ peer: REMOTE });
    await hello(gateway, refused.sessionId, "extension.c");

    const sent = gateway.outbound(refused.sessionId);
    expect(sent.map((message) => message.type)).toEqual(["server.error", "server.disconnect"]);
    expect(sent[0]).toMatchObject({ type: "server.error", payload: { code: "pairing.capacity_reached", message: expect.stringMatching(/too many pairing requests/i) } });
    const snapshot = gateway.snapshot();
    expect(snapshot.sessions.find((session) => session.sessionId === refused.sessionId)?.status).toBe("disconnected");
    expect(snapshot.pairings).toHaveLength(2);
    const audit = snapshot.auditLog.find((entry) => entry.type === "pairing.refused_capacity");
    expect(audit?.metadata).toMatchObject({ sessionId: refused.sessionId, scope: "per_address", clientAddressPrefix: "203.0.113.0/24" });
    expect(heard.map((entry) => entry.type)).toContain("pairing.refused_capacity");
    expect(JSON.stringify(heard)).not.toContain("203.0.113.45");

    // Another address is not held back by this one.
    const other = gateway.connect({ peer: { address: "198.51.100.7", prefix: "198.51.100.0/24", source: "peer" } });
    await hello(gateway, other.sessionId, "extension.d");
    expect(gateway.outbound(other.sessionId).map((message) => message.type)).toContain("server.pairing_required");
  });

  it("refuses an operator-created challenge over the total cap with the capacity code", () => {
    const gateway = new ClientGatewayService({ pairingLimits: { total: 1 } });
    gateway.createPairing({ projectId: "project.one" });
    expect(() => gateway.createPairing({ projectId: "project.two" })).toThrow(expect.objectContaining({ code: "pairing.capacity_reached", scope: "total" }));
  });

  it("never refuses a local client with default options", async () => {
    const gateway = new ClientGatewayService();
    for (let index = 0; index < 60; index += 1) {
      const session = gateway.connect({ peer: LOOPBACK });
      await hello(gateway, session.sessionId, `extension.local.${index}`);
      expect(gateway.outbound(session.sessionId).map((message) => message.type)).toEqual(["server.pairing_required"]);
    }
    expect(gateway.snapshot().auditLog.some((entry) => entry.type === "pairing.refused_capacity")).toBe(false);
  });

  it("refuses invalid runtime limits and keeps the ones it had", async () => {
    const gateway = new ClientGatewayService();
    expect(() => gateway.setPairingLimits({ perAddress: -1, total: 10 })).toThrow(/pairing_limits_invalid/);
    const session = gateway.connect({ peer: LOOPBACK });
    await hello(gateway, session.sessionId, "extension.local");
    expect(gateway.outbound(session.sessionId).map((message) => message.type)).toEqual(["server.pairing_required"]);
  });
});

describe("ClientGatewayService ended-session pruning", () => {
  it("bounds ended sessions and still refuses a command to a pruned session's id as disconnected", async () => {
    const gateway = new ClientGatewayService({ endedSessionLimit: 2 });
    const first = await pairClient(gateway, "extension.first");
    gateway.disconnect(first, "socket closed");
    expect(() => gateway.executeAction(first, { actionType: "sample.action" })).toThrow("Client session is disconnected.");

    for (let index = 0; index < 4; index += 1) {
      const session = gateway.connect();
      gateway.disconnect(session.sessionId, "socket closed");
    }
    const live = await pairClient(gateway, "extension.live");

    const sessions = gateway.snapshot().sessions;
    expect(sessions.filter((session) => session.status === "disconnected")).toHaveLength(2);
    expect(sessions.some((session) => session.sessionId === first)).toBe(false);
    expect(() => gateway.executeAction(first, { actionType: "sample.action" })).toThrow("Client session is disconnected.");
    await expect(gateway.startRecording(first, { recordingId: "recording.one" })).rejects.toThrow("Client session is disconnected.");
    expect(gateway.disconnect(first)).toBeNull();
    expect(gateway.outbound(first)).toEqual([]);
    // The live session is untouched and still takes commands.
    expect(() => gateway.markActiveRecording(live, { recordingId: "recording.live" })).not.toThrow();
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === live)).toMatchObject({ status: "ready", activeRecordingId: "recording.live" });
  });

  it("keeps a reconnecting client's history within the bound by default", async () => {
    const gateway = new ClientGatewayService();
    for (let index = 0; index < 1_005; index += 1) gateway.disconnect(gateway.connect().sessionId, "socket closed");
    expect(gateway.snapshot().sessions).toHaveLength(1_000);
  });
});

describe("ClientGatewayService security events", () => {
  it("records transport refusals into the audit and to listeners without a full address, until unsubscribed", () => {
    const gateway = new ClientGatewayService();
    const heard: ClientGatewayAuditEntry[] = [];
    const unsubscribe = gateway.onSecurityEvent((entry) => {
      heard.push(entry);
    });

    gateway.recordTransportEvent("transport.origin_refused", "Origin not allowed.", { origin: "https://evil.test", peer: REMOTE, remoteAddress: "203.0.113.45" });
    gateway.recordTransportEvent("transport.rate_limited", "Too many messages.", { sessionId: "session.x", clientAddress: "203.0.113.45" });
    unsubscribe();
    gateway.recordTransportEvent("transport.frame_too_large", "Frame too large.");

    expect(heard.map((entry) => entry.type)).toEqual(["transport.origin_refused", "transport.rate_limited"]);
    expect(heard[0]?.metadata).toEqual({ origin: "https://evil.test", clientAddressPrefix: "203.0.113.0/24" });
    expect(heard[1]).toMatchObject({ sessionId: "session.x", metadata: { sessionId: "session.x" } });
    const audit = gateway.snapshot().auditLog.map((entry) => entry.type);
    expect(audit).toEqual(expect.arrayContaining(["transport.origin_refused", "transport.rate_limited", "transport.frame_too_large"]));
    expect(JSON.stringify(gateway.snapshot())).not.toContain("203.0.113.45");
    expect(() => gateway.recordTransportEvent("", "no type")).toThrow(/transport_event_type_required/);
  });

  it("delivers pairing approval, dismissal, withdrawal, revocation and replacement", async () => {
    const tokens = ["pair-token", "rotated-token", "third-token"];
    const gateway = new ClientGatewayService({ createToken: () => tokens.shift() ?? "spare-token" });
    const heard: string[] = [];
    const heardEntries: ClientGatewayAuditEntry[] = [];
    gateway.onSecurityEvent((entry) => {
      heard.push(entry.type);
      heardEntries.push(entry);
    });

    const first = await pairClient(gateway, "extension.trusted");
    const token = readyToken(gateway, first);
    const second = gateway.connect({ peer: REMOTE }).sessionId;
    await gateway.receive(second, clientMessage("client.hello", { clientId: "extension.trusted", clientType: "extension", name: "extension.trusted", token }));

    const dismissed = gateway.connect();
    await hello(gateway, dismissed.sessionId, "extension.dismissed");
    gateway.dismissPairing(pendingCode(gateway, dismissed.sessionId));

    const withdrawn = gateway.connect();
    await hello(gateway, withdrawn.sessionId, "extension.withdrawn");
    gateway.disconnect(withdrawn.sessionId, "socket closed");

    const trustedClientId = gateway.snapshot().sessions.find((session) => session.sessionId === second)?.trustedClientId ?? "";
    await gateway.revokeTrustedClient(trustedClientId);

    expect(heard).toEqual(expect.arrayContaining(["session.paired", "session.replaced", "pairing.dismissed", "pairing.withdrawn", "trust.revoked"]));
    const replaced = gateway.snapshot().auditLog.find((entry) => entry.type === "session.replaced");
    expect(replaced?.metadata).toMatchObject({ sessionId: first, replacedBySessionId: second, clientAddressPrefix: "203.0.113.0/24" });
    // Ordinary operational entries are not security events.
    expect(heard).not.toContain("session.connected");
    expect(heard).not.toContain("pairing.created");
    // Listeners persist what they hear, so a pairing code never reaches them; the ring still has it.
    expect(heardEntries.some((entry) => entry.metadata?.pairingCode !== undefined)).toBe(false);
    expect(heardEntries.find((entry) => entry.type === "pairing.withdrawn")?.metadata).toMatchObject({ sessionId: withdrawn.sessionId, reason: "socket closed" });
    expect(gateway.snapshot().auditLog.find((entry) => entry.type === "pairing.withdrawn")?.metadata?.pairingCode).toEqual(expect.any(String));
  });

  it("bounds the audit with `auditLimit`", () => {
    const gateway = new ClientGatewayService({ auditLimit: 5 });
    for (let index = 0; index < 20; index += 1) gateway.recordAuditEvent({ type: "test.entry", message: `entry ${index}` });
    expect(gateway.snapshot().auditLog.map((entry) => entry.message)).toEqual(["entry 15", "entry 16", "entry 17", "entry 18", "entry 19"]);
  });
});

async function hello(gateway: ClientGatewayService, sessionId: string, clientId: string): Promise<void> {
  await gateway.receive(sessionId, clientMessage("client.hello", { clientId, clientType: "extension", name: clientId }));
}

function pendingCode(gateway: ClientGatewayService, sessionId: string): string {
  return gateway.snapshot().pairings.find((pairing) => pairing.requestedBySessionId === sessionId)?.pairingCode ?? "";
}

async function pairClient(gateway: ClientGatewayService, clientId: string): Promise<string> {
  const session = gateway.connect();
  await hello(gateway, session.sessionId, clientId);
  await gateway.approvePairing(pendingCode(gateway, session.sessionId), { approvedByUserId: "user.test" });
  return session.sessionId;
}

function readyToken(gateway: ClientGatewayService, sessionId: string): string {
  const message = [...gateway.outbound(sessionId)].reverse().find((item) => item.type === "server.session_ready");
  if (!message || message.type !== "server.session_ready") throw new Error("Expected a ready token.");
  return message.payload.token;
}

function clientMessage<TType extends ClientGatewayClientMessage["type"]>(
  type: TType,
  payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]
): Extract<ClientGatewayClientMessage, { type: TType }> {
  return {
    id: `message.${Math.random().toString(36).slice(2)}`,
    type,
    protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
    timestamp: Date.now(),
    payload
  } as Extract<ClientGatewayClientMessage, { type: TType }>;
}
