import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage, type ClientGatewayTrustedClient, type ClientGatewayTrustedClientStore } from "../../index.ts";
import type { ClientGatewayCredentialCustody } from "../credential-custody.ts";

// A browser in regular use never pairs again, and a rotated credential that never
// arrives does not strand it. Every credential here is a dummy.

const DAY = 24 * 60 * 60_000;
const CLIENT_ID = "extension.lifetime";

function clientMessage<TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): Extract<ClientGatewayClientMessage, { type: TType }> {
  return { id: `message.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1, payload } as Extract<ClientGatewayClientMessage, { type: TType }>;
}

class MemoryStore implements ClientGatewayTrustedClientStore {
  clients: ClientGatewayTrustedClient[] = [];
  failing = false;

  async load(): Promise<ClientGatewayTrustedClient[]> {
    return this.clients.map((client) => ({ ...client }));
  }

  async save(clients: ClientGatewayTrustedClient[]): Promise<void> {
    if (this.failing) throw new Error("dummy store refused the write");
    this.clients = clients.map((client) => ({ ...client }));
  }
}

function harness(store = new MemoryStore()) {
  const clock = { now: 1_000_000 };
  let minted = 0;
  const gateway = new ClientGatewayService({ now: () => clock.now, trustedClientStore: store, createToken: () => `dummy-credential-${(minted += 1)}` });
  return { gateway, clock, store };
}

function sentToken(gateway: ClientGatewayService, sessionId: string): string {
  const ready = gateway.outbound(sessionId).filter((message) => message.type === "server.session_ready").at(-1);
  return (ready?.payload as { token: string }).token;
}

async function pair(gateway: ClientGatewayService): Promise<{ sessionId: string; token: string }> {
  const session = gateway.connect();
  await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome" }));
  const pairingCode = gateway.snapshot().pairings.find((pairing) => pairing.requestedBySessionId === session.sessionId)?.pairingCode ?? "";
  await gateway.approvePairing(pairingCode, { approvedByUserId: "user.web" });
  return { sessionId: session.sessionId, token: sentToken(gateway, session.sessionId) };
}

/** A hello with this credential: what the session came to, and the credential it was sent, if any. */
async function hello(gateway: ClientGatewayService, token: string): Promise<{ sessionId: string; status: string | undefined; sent: string | undefined }> {
  const session = gateway.connect();
  await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome", token }));
  const status = gateway.snapshot().sessions.find((entry) => entry.sessionId === session.sessionId)?.status;
  return { sessionId: session.sessionId, status, sent: status === "ready" ? sentToken(gateway, session.sessionId) : undefined };
}

describe("a credential's life slides with its use", () => {
  it("lasts 60 days from the start", async () => {
    const { gateway, clock } = harness();
    await pair(gateway);
    expect(gateway.snapshot().trustedClients[0]?.expiresAt).toBe(clock.now + 60 * DAY);
  });

  it("is renewed by each reconnect, so a browser that comes back every 59 days never pairs again", async () => {
    const { gateway, clock } = harness();
    let { sessionId, token } = await pair(gateway);
    for (let round = 0; round < 10; round += 1) {
      gateway.disconnect(sessionId, "socket closed");
      clock.now += 59 * DAY;
      const next = await hello(gateway, token);
      expect(next.status).toBe("ready");
      sessionId = next.sessionId;
      token = next.sent ?? "";
      await gateway.receive(sessionId, clientMessage("client.credential_received", {}));
    }
    expect(gateway.snapshot().trustedClients).toHaveLength(1);
  });

  it("is renewed by a request's use too, on a socket that stays open for months, written at most once a day", async () => {
    const { gateway, clock, store } = harness();
    const { token } = await pair(gateway);
    const saves = () => JSON.stringify(store.clients);
    clock.now += 1_000;
    await gateway.authorizeToken(token);
    const unchanged = saves();
    clock.now += 1_000;
    await gateway.authorizeToken(token);
    expect(saves()).toBe(unchanged);
    for (let day = 0; day < 200; day += 1) {
      clock.now += DAY;
      await expect(gateway.authorizeToken(token)).resolves.not.toBeNull();
    }
    expect(store.clients[0]?.expiresAt).toBe(clock.now + 60 * DAY);
  });

  it("ends 60 days after its last use", async () => {
    const { gateway, clock } = harness();
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    clock.now += 60 * DAY;
    expect((await hello(gateway, token)).status).toBe("pairing_required");
  });

  it("is not stretched by the credential before the current one, which only a lost reply leaves valid", async () => {
    const { gateway, clock } = harness();
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    const second = await hello(gateway, token);
    const expiry = gateway.snapshot().trustedClients[0]?.expiresAt;
    clock.now += 3 * DAY;
    await expect(gateway.authorizeToken(token)).resolves.not.toBeNull();
    expect(gateway.snapshot().trustedClients[0]?.expiresAt).toBe(expiry);
    expect(second.status).toBe("ready");
  });
});

describe("a rotated credential that never arrives", () => {
  it("does not strand the browser: its old one still connects", async () => {
    const { gateway } = harness();
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    const lost = await hello(gateway, token);
    expect(lost.sent).not.toBe(token);
    // The socket dropped as the reply was sent, so the browser still holds the old one.
    gateway.disconnect(lost.sessionId, "socket closed");
    const again = await hello(gateway, token);
    expect(again.status).toBe("ready");
    expect(gateway.snapshot().trustedClients).toHaveLength(1);
  });

  it("survives a Core restart while unconfirmed", async () => {
    const store = new MemoryStore();
    const { gateway } = harness(store);
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    await hello(gateway, token);
    const { gateway: restarted } = harness(store);
    expect((await hello(restarted, token)).status).toBe("ready");
  });

  it("makes the lost reply useless: a credential nobody received is refused once replaced", async () => {
    const { gateway } = harness();
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    const lost = await hello(gateway, token);
    gateway.disconnect(lost.sessionId, "socket closed");
    await hello(gateway, token);
    expect((await hello(gateway, lost.sent ?? "")).status).toBe("pairing_required");
  });

  it("is bounded: the old one ends 14 days after the first rotation, however often it is presented", async () => {
    const { gateway, clock } = harness();
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    const rotatedAt = clock.now;
    const first = await hello(gateway, token);
    gateway.disconnect(first.sessionId, "socket closed");
    clock.now = rotatedAt + 13 * DAY;
    const second = await hello(gateway, token);
    expect(second.status).toBe("ready");
    gateway.disconnect(second.sessionId, "socket closed");
    clock.now = rotatedAt + 14 * DAY;
    expect((await hello(gateway, token)).status).toBe("pairing_required");
  });

  it("says nothing of the digests in what the panel reads", async () => {
    const { gateway } = harness();
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    await hello(gateway, token);
    const shown = gateway.snapshot().trustedClients[0] as unknown as Record<string, unknown>;
    expect(shown).not.toHaveProperty("tokenHash");
    expect(shown).not.toHaveProperty("previousTokenHash");
  });

  it("puts everything back when the store refuses the rotation, and the old credential still works", async () => {
    const { gateway, store } = harness();
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    store.failing = true;
    const session = gateway.connect();
    await expect(gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome", token }))).rejects.toThrow();
    store.failing = false;
    expect((await hello(gateway, token)).status).toBe("ready");
  });
});

describe("replaying an old credential once the new one is confirmed", () => {
  async function rotated() {
    const made = harness();
    const { sessionId, token } = await pair(made.gateway);
    made.gateway.disconnect(sessionId, "socket closed");
    const next = await hello(made.gateway, token);
    return { ...made, old: token, next: next.sent ?? "", sessionId: next.sessionId };
  }

  it("is refused after the client says it stored the new one", async () => {
    const { gateway, old, sessionId } = await rotated();
    await gateway.receive(sessionId, clientMessage("client.credential_received", {}));
    await expect(gateway.authorizeToken(old)).resolves.toBeNull();
    expect((await hello(gateway, old)).status).toBe("pairing_required");
  });

  it("is refused after the new one is used on a request", async () => {
    const { gateway, old, next } = await rotated();
    await expect(gateway.authorizeToken(next)).resolves.not.toBeNull();
    await expect(gateway.authorizeToken(old)).resolves.toBeNull();
  });

  it("is refused after the new one reconnects", async () => {
    const { gateway, old, next, sessionId } = await rotated();
    gateway.disconnect(sessionId, "socket closed");
    expect((await hello(gateway, next)).status).toBe("ready");
    await gateway.authorizeToken(next);
    await expect(gateway.authorizeToken(old)).resolves.toBeNull();
  });

  it("stays refused across a Core restart", async () => {
    const store = new MemoryStore();
    const { gateway } = harness(store);
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    const next = await hello(gateway, token);
    await gateway.receive(next.sessionId, clientMessage("client.credential_received", {}));
    const { gateway: restarted } = harness(store);
    expect((await hello(restarted, token)).status).toBe("pairing_required");
  });

  it("is ignored from a session that is not paired", async () => {
    const { gateway, old } = await rotated();
    const stranger = gateway.connect();
    await gateway.receive(stranger.sessionId, clientMessage("client.hello", { clientId: "extension.stranger", clientType: "extension", name: "Other" }));
    await gateway.receive(stranger.sessionId, clientMessage("client.credential_received", {}));
    await expect(gateway.authorizeToken(old)).resolves.not.toBeNull();
  });
});

describe("what credential custody hears of it", () => {
  it("hears a confirmation by the client's word and by use, each naming the credential that is now in use", async () => {
    const heard: Array<{ credentialDigest: string }> = [];
    const custody: ClientGatewayCredentialCustody = {
      issued: async () => undefined,
      rotating: async () => undefined,
      presented: async () => undefined,
      released: () => undefined,
      forgotten: async () => undefined,
      confirmed: async ({ credentialDigest }) => {
        heard.push({ credentialDigest });
      }
    };
    const clock = { now: 1_000_000 };
    let minted = 0;
    const gateway = new ClientGatewayService({ now: () => clock.now, credentialCustody: custody, createToken: () => `dummy-credential-${(minted += 1)}` });
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    const second = await hello(gateway, token);
    heard.length = 0;
    await gateway.receive(second.sessionId, clientMessage("client.credential_received", {}));
    expect(heard).toEqual([{ credentialDigest: createHash("sha256").update(second.sent ?? "", "utf8").digest("hex") }]);
    // Said twice, it has nothing more to confirm.
    await gateway.receive(second.sessionId, clientMessage("client.credential_received", {}));
    expect(heard).toHaveLength(1);

    gateway.disconnect(second.sessionId, "socket closed");
    const third = await hello(gateway, second.sent ?? "");
    heard.length = 0;
    await gateway.authorizeToken(third.sent ?? "");
    expect(heard).toEqual([{ credentialDigest: createHash("sha256").update(third.sent ?? "", "utf8").digest("hex") }]);
  });
});
