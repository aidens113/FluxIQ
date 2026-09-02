import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayClientMessage, type ClientGatewayTrustedClient } from "./contracts.ts";
import { ClientGatewayService, type ClientGatewayTrustedClientStore } from "./service.ts";

describe("ClientGatewayService", () => {
  it("returns bounded stable summary pages without exposing full snapshots", async () => {
    const gateway = new ClientGatewayService();
    for (let index = 0; index < 125; index += 1) {
      const session = gateway.connect();
      await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: `client-${String(index).padStart(4, "0")}`, clientType: "extension", name: `Client ${String(index).padStart(4, "0")}` }));
    }
    const first = gateway.listSummaryItems({ kind: "sessions", limit: 50 });
    const second = gateway.listSummaryItems({ kind: "sessions", limit: 50, afterId: first.lastId });
    const third = gateway.listSummaryItems({ kind: "sessions", limit: 50, afterId: second.lastId });
    expect(first).toMatchObject({ total: 125, limit: 50, hasMore: true });
    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(50);
    expect(third).toMatchObject({ items: expect.any(Array), hasMore: false });
    expect(third.items).toHaveLength(25);
    expect(new Set([...first.items, ...second.items, ...third.items].map((item) => "sessionId" in item ? item.sessionId : "")).size).toBe(125);
    expect(gateway.listSummaryItems({ kind: "sessions", search: "client 0124", limit: 10 })).toMatchObject({ total: 1, items: [expect.objectContaining({ clientId: "client-0124" })] });
    expect(gateway.summary()).toMatchObject({ counts: { sessions: 125, pairings: 125, trustedClients: 0 } });
  });

  it("pairs a websocket-capable client and queues session messages", async () => {
    const gateway = new ClientGatewayService();
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", {
      clientId: "extension.local",
      clientType: "extension",
      name: "Local recorder",
      capabilities: [{ id: "sample.record", kind: "recording", actionTypes: ["sample.action"] }]
    }));
    expect(gateway.snapshot().sessions[0]?.status).toBe("pairing_required");

    const pairing = gateway.snapshot().pairings[0];
    await gateway.approvePairing(pairing?.pairingCode ?? "", { approvedByUserId: "user.test" });

    const readySession = gateway.snapshot().sessions[0];
    expect(readySession?.status).toBe("ready");
    expect(gateway.outbound(session.sessionId).some((message) => message.type === "server.session_ready")).toBe(true);
  });

  it("creates a pending pairing request when an unpaired client says hello", async () => {
    const gateway = new ClientGatewayService();
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", {
      clientId: "extension.request",
      clientType: "extension",
      name: "Extension Connect Button"
    }));

    const snapshot = gateway.snapshot();
    const pairing = snapshot.pairings[0];
    expect(pairing).toMatchObject({
      requestedBySessionId: session.sessionId,
      requestedByClientId: "extension.request",
      requestedByClientName: "Extension Connect Button"
    });
    expect(pairing?.pairingCode).toMatch(/^\d{6}$/);
    expect(gateway.outbound(session.sessionId).find((message) => message.type === "server.pairing_required")?.payload.referenceCode).toBe(pairing?.referenceCode);
  });

  it("approves pending pairing requests from the web panel", async () => {
    const gateway = new ClientGatewayService();
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", {
      clientId: "extension.approve",
      clientType: "extension",
      name: "Approve Test"
    }));
    const pairingCode = gateway.snapshot().pairings[0]?.pairingCode ?? "";

    const approved = await gateway.approvePairing(pairingCode, { approvedByUserId: "user.approver" });

    expect(approved?.status).toBe("ready");
    expect(gateway.outbound(session.sessionId).some((message) => message.type === "server.session_ready")).toBe(true);
  });

  it("dismisses pending pairing requests", async () => {
    const gateway = new ClientGatewayService();
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", {
      clientId: "extension.dismiss",
      clientType: "extension",
      name: "Dismiss Test"
    }));
    const pairingCode = gateway.snapshot().pairings[0]?.pairingCode;

    expect(pairingCode).toBeTruthy();
    expect(gateway.dismissPairing(pairingCode ?? "")).toBe(true);
    expect(gateway.snapshot().pairings).toHaveLength(0);
  });

  it("authorizes active paired session tokens", async () => {
    const gateway = new ClientGatewayService();
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", {
      clientId: "extension.authorized",
      clientType: "extension",
      name: "Authorized Test"
    }));
    const pairingCode = gateway.snapshot().pairings[0]?.pairingCode ?? "";
    await gateway.approvePairing(pairingCode, { approvedByUserId: "user.authorizer" });
    const readyMessage = [...gateway.outbound(session.sessionId)].reverse().find((message) => message.type === "server.session_ready");
    const token = readyMessage?.type === "server.session_ready" ? readyMessage.payload.token : undefined;

    expect((await gateway.authorizeToken(token))?.clientId).toBe("extension.authorized");
    expect(await gateway.authorizeToken("missing-token")).toBeNull();
  });

  it("correlates execute_action commands with client action results", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1000 });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "worker.1", clientType: "worker", name: "Worker" }));
    const pairing = gateway.snapshot().pairings[0];
    await gateway.approvePairing(pairing?.pairingCode ?? "", { approvedByUserId: "user.worker" });

    const response = gateway.executeAction(session.sessionId, { actionType: "click", parameters: { selector: "#save" } });
    await gateway.receive(session.sessionId, clientMessage("client.action_result", {
      commandId: response.commandId,
      status: "succeeded",
      message: "clicked"
    }));

    await expect(response.result).resolves.toMatchObject({ commandId: response.commandId, status: "succeeded" });
  });

  it("reconnects across transient sessions and rotates one-use credentials", async () => {
    const tokens = ["pair-token", "rotated-token"];
    const gateway = new ClientGatewayService({ createToken: () => tokens.shift() ?? "unexpected-token" });
    const first = await pairClient(gateway, "extension.reconnect", "user.alpha");
    gateway.disconnect(first.sessionId);

    const second = gateway.connect();
    await gateway.receive(second.sessionId, clientMessage("client.hello", {
      clientId: "extension.reconnect",
      clientType: "extension",
      token: first.token
    }));

    const rotated = readyToken(gateway, second.sessionId);
    expect(rotated).toBe("rotated-token");
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === second.sessionId)).toMatchObject({
      status: "ready",
      operatorUserId: "user.alpha",
      trustedClientId: first.trustedClientId
    });
    expect(await gateway.authorizeToken(first.token)).toBeNull();
    expect((await gateway.authorizeToken(rotated))?.sessionId).toBe(second.sessionId);
  });

  it("restores trusted clients after restart without persisting raw credentials", async () => {
    const store = new MemoryTrustedClientStore();
    const firstGateway = new ClientGatewayService({ trustedClientStore: store, createToken: () => "restart-token" });
    const paired = await pairClient(firstGateway, "extension.restart", "user.restart");
    firstGateway.disconnect(paired.sessionId);

    expect(JSON.stringify(store.clients)).not.toContain("restart-token");
    const restartedGateway = new ClientGatewayService({ trustedClientStore: store, createToken: () => "restart-rotated" });
    const reconnected = restartedGateway.connect();
    await restartedGateway.receive(reconnected.sessionId, clientMessage("client.hello", {
      clientId: "extension.restart",
      clientType: "extension",
      token: paired.token
    }));

    expect(readyToken(restartedGateway, reconnected.sessionId)).toBe("restart-rotated");
    expect(restartedGateway.snapshot().trustedClients[0]).toMatchObject({ approvedByUserId: "user.restart", status: "active" });
    expect(restartedGateway.snapshot().trustedClients[0]).not.toHaveProperty("tokenHash");
  });

  it("requires pairing for expired, revoked, and client-mismatched credentials", async () => {
    let now = 1_000;
    const tokens = ["expiry-token", "mismatch-token", "revoked-token"];
    const gateway = new ClientGatewayService({ now: () => now, trustedClientTtlMs: 100, createToken: () => tokens.shift() ?? "unused" });
    const expired = await pairClient(gateway, "extension.expired", "user.expired");
    gateway.disconnect(expired.sessionId);
    now = 1_101;
    const expiredReconnect = gateway.connect();
    await gateway.receive(expiredReconnect.sessionId, clientMessage("client.hello", { clientId: "extension.expired", clientType: "extension", token: expired.token }));
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === expiredReconnect.sessionId)?.status).toBe("pairing_required");

    now = 2_000;
    const mismatch = await pairClient(gateway, "extension.original", "user.original");
    gateway.disconnect(mismatch.sessionId);
    const mismatchedReconnect = gateway.connect();
    await gateway.receive(mismatchedReconnect.sessionId, clientMessage("client.hello", { clientId: "extension.impostor", clientType: "extension", token: mismatch.token }));
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === mismatchedReconnect.sessionId)?.status).toBe("pairing_required");

    const revoked = await pairClient(gateway, "extension.revoked", "user.revoker");
    expect(await gateway.revokeTrustedClient(revoked.trustedClientId, "test revocation")).toBe(true);
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === revoked.sessionId)?.status).toBe("disconnected");
    const revokedReconnect = gateway.connect();
    await gateway.receive(revokedReconnect.sessionId, clientMessage("client.hello", { clientId: "extension.revoked", clientType: "extension", token: revoked.token }));
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === revokedReconnect.sessionId)?.status).toBe("pairing_required");
  });
});

async function pairClient(gateway: ClientGatewayService, clientId: string, approvedByUserId: string) {
  const session = gateway.connect();
  await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId, clientType: "extension", name: clientId }));
  await gateway.approvePairing(gateway.snapshot().pairings.find((pairing) => pairing.requestedBySessionId === session.sessionId)?.pairingCode ?? "", { approvedByUserId });
  return {
    sessionId: session.sessionId,
    token: readyToken(gateway, session.sessionId),
    trustedClientId: gateway.snapshot().sessions.find((item) => item.sessionId === session.sessionId)?.trustedClientId ?? ""
  };
}

function readyToken(gateway: ClientGatewayService, sessionId: string): string {
  const message = [...gateway.outbound(sessionId)].reverse().find((item) => item.type === "server.session_ready");
  if (!message || message.type !== "server.session_ready") throw new Error("Expected a ready token.");
  return message.payload.token;
}

class MemoryTrustedClientStore implements ClientGatewayTrustedClientStore {
  clients: ClientGatewayTrustedClient[] = [];

  async load(): Promise<ClientGatewayTrustedClient[]> {
    return structuredClone(this.clients);
  }

  async save(clients: ClientGatewayTrustedClient[]): Promise<void> {
    this.clients = structuredClone(clients);
  }
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
