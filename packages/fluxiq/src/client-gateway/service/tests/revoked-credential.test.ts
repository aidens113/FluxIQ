import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage, type ClientGatewayServerMessage, type ClientGatewayTrustedClient, type ClientGatewayTrustedClientStore } from "../../index.ts";

// A client whose trust a person revoked learns it at once (`server.revoked`,
// then `server.disconnect` for a client that predates the notice, then its
// socket closes), and every later hello with its credential is told
// again and closed: no pairing request is raised for it, so a revoked browser
// asks to pair again only when its person does. A trust that ended otherwise,
// or a credential that expired or is unknown, still pairs again, and the
// pairing request says why the credential was not accepted. Every credential is a dummy.

const DAY = 24 * 60 * 60_000;
const SECOND = 1_000;
const CLIENT_ID = "extension.revoked-notice";

function clientMessage<TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): Extract<ClientGatewayClientMessage, { type: TType }> {
  return { id: `message.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1, payload } as Extract<ClientGatewayClientMessage, { type: TType }>;
}

class MemoryStore implements ClientGatewayTrustedClientStore {
  clients: ClientGatewayTrustedClient[] = [];

  async load(): Promise<ClientGatewayTrustedClient[]> {
    return this.clients.map((client) => ({ ...client }));
  }

  async save(clients: ClientGatewayTrustedClient[]): Promise<void> {
    this.clients = clients.map((client) => ({ ...client }));
  }
}

function harness(store = new MemoryStore(), ttlMs = 30 * DAY) {
  const clock = { now: 1_000_000 };
  let minted = 0;
  const closed: string[] = [];
  const gateway = new ClientGatewayService({ now: () => clock.now, trustedClientStore: store, trustedClientTtlMs: ttlMs, createToken: () => `dummy-credential-${(minted += 1)}` });
  return { gateway, clock, store, closed };
}

type Harness = ReturnType<typeof harness>;

function connect(made: Harness): string {
  const socket = { send: async () => undefined, close: (_code?: number, reason?: string) => { made.closed.push(reason ?? ""); } };
  return made.gateway.connect({ socket }).sessionId;
}

async function pair(made: Harness): Promise<{ sessionId: string; token: string; trustedClientId: string }> {
  const sessionId = connect(made);
  await made.gateway.receive(sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome" }));
  const pairingCode = made.gateway.snapshot().pairings.find((pairing) => pairing.requestedBySessionId === sessionId)?.pairingCode ?? "";
  await made.gateway.approvePairing(pairingCode, { approvedByUserId: "user.web" });
  const ready = made.gateway.outbound(sessionId).filter((message) => message.type === "server.session_ready").at(-1);
  const trustedClientId = made.gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.trustedClientId ?? "";
  return { sessionId, token: (ready?.payload as { token: string }).token, trustedClientId };
}

async function hello(made: Harness, token: string): Promise<{ sessionId: string; status: string | undefined; sent: ClientGatewayServerMessage[] }> {
  const sessionId = connect(made);
  await made.gateway.receive(sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome", token }));
  return {
    sessionId,
    status: made.gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.status,
    sent: [...made.gateway.outbound(sessionId)]
  };
}

function pendingPairingsFor(made: Harness, sessionId: string): number {
  return made.gateway.snapshot().pairings.filter((pairing) => pairing.requestedBySessionId === sessionId && !pairing.consumedAt).length;
}

function payloadOf(sent: ClientGatewayServerMessage[], type: ClientGatewayServerMessage["type"]): Record<string, unknown> | undefined {
  return sent.find((message) => message.type === type)?.payload as Record<string, unknown> | undefined;
}

describe("a client a person revoked", () => {
  it("is told at once on its live socket, which then closes, and the trust records what it was told", async () => {
    const made = harness();
    const { sessionId, trustedClientId } = await pair(made);
    expect(await made.gateway.revokeTrustedClient(trustedClientId)).toBe(true);
    const types = made.gateway.outbound(sessionId).map((message) => message.type);
    // The notice, then `server.disconnect` for a client that predates it, so that one stops reconnecting too.
    expect(types.slice(-2)).toEqual(["server.revoked", "server.disconnect"]);
    expect(payloadOf(made.gateway.outbound(sessionId), "server.revoked")).toMatchObject({ reason: "revoked_by_user", message: expect.stringContaining("revoked") });
    expect(made.gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.status).toBe("disconnected");
    expect(made.closed).toEqual(["client trust revoked"]);
    expect(made.gateway.snapshot().trustedClients[0]).toMatchObject({ status: "revoked", revokedFor: "revoked_by_user" });
  });

  it("is told again and closed when it says hello with the revoked credential, and no pairing request is raised", async () => {
    const made = harness();
    const { token, trustedClientId } = await pair(made);
    await made.gateway.revokeTrustedClient(trustedClientId, "forgotten from the Security screen");
    made.clock.now += SECOND;
    const again = await hello(made, token);
    expect(again.sent.map((message) => message.type)).toEqual(["server.revoked", "server.disconnect"]);
    expect(payloadOf(again.sent, "server.revoked")?.reason).toBe("revoked_by_user");
    expect(again.status).toBe("disconnected");
    expect(pendingPairingsFor(made, again.sessionId)).toBe(0);
    expect(made.gateway.snapshot().auditLog.some((entry) => entry.type === "session.credential_revoked")).toBe(true);
    expect(JSON.stringify(made.gateway.snapshot().auditLog)).not.toContain(token);
  });

  it("is still told after a Core restart", async () => {
    const store = new MemoryStore();
    const first = harness(store);
    const { token, trustedClientId } = await pair(first);
    await first.gateway.revokeTrustedClient(trustedClientId);
    const restarted = harness(store);
    const again = await hello(restarted, token);
    expect(again.sent.map((message) => message.type)).toEqual(["server.revoked", "server.disconnect"]);
    expect(pendingPairingsFor(restarted, again.sessionId)).toBe(0);
  });

  it("is told the protocol's reason when the revoke names one", async () => {
    const made = harness();
    const { sessionId, trustedClientId } = await pair(made);
    await made.gateway.revokeTrustedClient(trustedClientId, "account_disabled");
    expect(payloadOf(made.gateway.outbound(sessionId), "server.revoked")?.reason).toBe("account_disabled");
  });

  it("is told even when the reason's text sounds like the client's own: only an explicit null keeps it quiet", async () => {
    const told = harness();
    const first = await pair(told);
    await told.gateway.revokeTrustedClient(first.trustedClientId, "The client revoked its own credential.");
    expect(payloadOf(told.gateway.outbound(first.sessionId), "server.revoked")?.reason).toBe("revoked_by_user");

    const quiet = harness();
    const second = await pair(quiet);
    await quiet.gateway.revokeTrustedClient(second.trustedClientId, "The client revoked its own credential.", null);
    const types = quiet.gateway.outbound(second.sessionId).map((message) => message.type);
    expect(types.at(-1)).toBe("server.disconnect");
    expect(types).not.toContain("server.revoked");
    expect(quiet.gateway.snapshot().trustedClients[0]).not.toHaveProperty("revokedFor");
    // Its credential later pairs again instead of being told it was revoked.
    const again = await hello(quiet, second.token);
    expect(payloadOf(again.sent, "server.pairing_required")).toMatchObject({ credential: "refused" });
  });

  it("pairs again when its person connects without the credential", async () => {
    const made = harness();
    const { trustedClientId } = await pair(made);
    await made.gateway.revokeTrustedClient(trustedClientId);
    const fresh = connect(made);
    await made.gateway.receive(fresh, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome" }));
    const pairing = payloadOf(made.gateway.outbound(fresh), "server.pairing_required");
    expect(pairing).toBeDefined();
    expect(pairing).not.toHaveProperty("credential");
    expect(pendingPairingsFor(made, fresh)).toBe(1);
  });
});

describe("a credential that is not accepted for any other reason pairs again and says why", () => {
  it("a trust the client forgot itself is not told it was revoked: refused", async () => {
    const made = harness();
    const { token } = await pair(made);
    expect(await made.gateway.access.forgetByCredential(token)).toBe(true);
    expect(made.gateway.snapshot().trustedClients[0]).not.toHaveProperty("revokedFor");
    const again = await hello(made, token);
    expect(again.status).toBe("pairing_required");
    expect(payloadOf(again.sent, "server.pairing_required")).toMatchObject({ credential: "refused" });
    expect(again.sent.map((message) => message.type)).not.toContain("server.revoked");
  });

  it("an expired credential: expired", async () => {
    const made = harness(new MemoryStore(), DAY);
    const { sessionId, token } = await pair(made);
    made.gateway.disconnect(sessionId, "socket closed");
    made.clock.now += 2 * DAY;
    const again = await hello(made, token);
    expect(again.status).toBe("pairing_required");
    expect(payloadOf(again.sent, "server.pairing_required")).toMatchObject({ credential: "expired", reason: expect.stringContaining("expired") });
  });

  it("a credential nobody issued: refused", async () => {
    const made = harness();
    const again = await hello(made, "dummy-credential-never-issued");
    expect(payloadOf(again.sent, "server.pairing_required")).toMatchObject({ credential: "refused" });
  });

  it("a reused credential pairs again, so a person decides, while the live holder is told why its trust ended", async () => {
    const made = harness();
    const { sessionId, token: retired } = await pair(made);
    made.gateway.disconnect(sessionId, "socket closed");
    const live = await hello(made, retired);
    await made.gateway.receive(live.sessionId, clientMessage("client.credential_received", {}));
    made.clock.now += SECOND;
    const returning = await hello(made, retired);
    expect(returning.status).toBe("pairing_required");
    expect(payloadOf(returning.sent, "server.pairing_required")).toMatchObject({ credential: "refused" });
    expect(payloadOf(made.gateway.outbound(live.sessionId), "server.revoked")?.reason).toBe("credential_reused");
    expect(made.gateway.snapshot().sessions.find((session) => session.sessionId === live.sessionId)?.status).toBe("disconnected");
  });
});
