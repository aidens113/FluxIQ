import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage, type ClientGatewayTrustedClient, type ClientGatewayTrustedClientStore } from "../../index.ts";
import type { ClientGatewayCredentialCustody } from "../credential-custody.ts";

// A credential that has been replaced and confirmed has no honest reason to come back.
// Whoever presents one, the trust ends: the thief is out, and the real browser pairs again.
// A credential still in the lost-reply window is not reuse. Every credential is a dummy.

const DAY = 24 * 60 * 60_000;
const MINUTE = 60_000;
const SECOND = 1_000;
const CLIENT_ID = "extension.reuse";

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

function listening(): { custody: ClientGatewayCredentialCustody; heard: string[]; hold: { rotating?: Promise<void>; presented?: Promise<void> } } {
  const heard: string[] = [];
  const hold: { rotating?: Promise<void>; presented?: Promise<void> } = {};
  return {
    heard,
    hold,
    custody: {
      issued: async () => { heard.push("issued"); },
      confirmed: async () => { heard.push("confirmed"); },
      rotating: async () => {
        heard.push("rotating");
        await hold.rotating;
      },
      presented: async () => {
        heard.push("presented");
        await hold.presented;
      },
      released: () => { heard.push("released"); },
      forgotten: async () => { heard.push("forgotten"); }
    }
  };
}

function harness(store = new MemoryStore()) {
  const clock = { now: 1_000_000 };
  let minted = 0;
  const listener = listening();
  const gateway = new ClientGatewayService({ now: () => clock.now, trustedClientStore: store, createToken: () => `dummy-credential-${(minted += 1)}`, credentialCustody: listener.custody });
  return { gateway, clock, store, heard: listener.heard, hold: listener.hold };
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

async function hello(gateway: ClientGatewayService, token: string): Promise<{ sessionId: string; status: string | undefined; sent: string | undefined }> {
  const session = gateway.connect();
  await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome", token }));
  const status = gateway.snapshot().sessions.find((entry) => entry.sessionId === session.sessionId)?.status;
  const ready = gateway.outbound(session.sessionId).filter((message) => message.type === "server.session_ready").at(-1);
  return { sessionId: session.sessionId, status, sent: (ready?.payload as { token?: string } | undefined)?.token };
}

/** A paired client whose first credential has been replaced and the replacement confirmed. */
async function rotatedAndConfirmed(store?: MemoryStore) {
  const made = harness(store);
  const { sessionId, token } = await pair(made.gateway);
  made.gateway.disconnect(sessionId, "socket closed");
  const next = await hello(made.gateway, token);
  await made.gateway.receive(next.sessionId, clientMessage("client.credential_received", {}));
  return { ...made, retired: token, current: next.sent ?? "", sessionId: next.sessionId };
}

function trust(gateway: ClientGatewayService): { status?: string; trustedClientId?: string } | undefined {
  return gateway.snapshot().trustedClients.find((client) => client.clientId === CLIENT_ID);
}

describe("a retired credential presented", () => {
  it("on a hello ends the trust, so the current credential stops working too, and audits it by client", async () => {
    const { gateway, clock, retired, current, heard } = await rotatedAndConfirmed();
    const trustedClientId = trust(gateway)?.trustedClientId;
    clock.now += SECOND;
    expect((await hello(gateway, retired)).status).toBe("pairing_required");
    expect(trust(gateway)?.status).toBe("revoked");
    await expect(gateway.authorizeToken(current)).resolves.toBeNull();
    expect((await hello(gateway, current)).status).toBe("pairing_required");
    expect(heard).toContain("forgotten");
    const entry = gateway.snapshot().auditLog.find((candidate) => candidate.type === "credential.reuse_detected");
    expect(entry?.metadata).toMatchObject({ trustedClientId });
    const written = JSON.stringify(gateway.snapshot().auditLog);
    expect(written).not.toContain(retired);
    expect(written).not.toContain(current);
  });

  it("on a request's bearer ends the trust the same way", async () => {
    const { gateway, clock, retired, current } = await rotatedAndConfirmed();
    clock.now += 3 * MINUTE;
    await expect(gateway.authorizeToken(retired)).resolves.toBeNull();
    expect(trust(gateway)?.status).toBe("revoked");
    await expect(gateway.authorizeToken(current)).resolves.toBeNull();
  });

  it("is still recognised after a Core restart", async () => {
    const store = new MemoryStore();
    const { clock, retired } = await rotatedAndConfirmed(store);
    const { gateway: restarted, clock: restartedClock } = harness(store);
    restartedClock.now = clock.now + 3 * MINUTE;
    expect((await hello(restarted, retired)).status).toBe("pairing_required");
    expect(trust(restarted)?.status).toBe("revoked");
  });

  it("past its lost-reply window, is a reuse too", async () => {
    const { gateway, clock } = harness();
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    const next = await hello(gateway, token);
    gateway.disconnect(next.sessionId, "socket closed");
    clock.now += 15 * DAY;
    expect((await hello(gateway, token)).status).toBe("pairing_required");
    expect(trust(gateway)?.status).toBe("revoked");
  });

  it("by a browser whose credential someone else moved on, the moment it comes back: it ends for both", async () => {
    const { gateway, clock, current: copied, sessionId } = await rotatedAndConfirmed();
    const other = await hello(gateway, copied);
    expect(other.status).toBe("ready");
    await gateway.receive(other.sessionId, clientMessage("client.credential_received", {}));
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.status).toBe("disconnected");
    clock.now += SECOND;
    expect((await hello(gateway, copied)).status).toBe("pairing_required");
    expect(trust(gateway)?.status).toBe("revoked");
    await expect(gateway.authorizeToken(other.sent ?? "")).resolves.toBeNull();
    expect((await hello(gateway, other.sent ?? "")).status).toBe("pairing_required");
    expect(gateway.snapshot().auditLog.some((entry) => entry.type === "credential.reuse_detected")).toBe(true);
  });

  it("however many times the credential has moved on since, and however long ago", async () => {
    const { gateway, clock, current: copied } = await rotatedAndConfirmed();
    let held = copied;
    for (let round = 0; round < 40; round += 1) {
      const next = await hello(gateway, held);
      await gateway.receive(next.sessionId, clientMessage("client.credential_received", {}));
      gateway.disconnect(next.sessionId, "socket closed");
      held = next.sent ?? "";
    }
    clock.now += 10 * MINUTE;
    expect((await hello(gateway, copied)).status).toBe("pairing_required");
    expect(trust(gateway)?.status).toBe("revoked");
    await expect(gateway.authorizeToken(held)).resolves.toBeNull();
  });

  it("across a Core restart too, however many times it has moved on", async () => {
    const store = new MemoryStore();
    const { gateway, current: copied } = await rotatedAndConfirmed(store);
    let held = copied;
    for (let round = 0; round < 40; round += 1) {
      const next = await hello(gateway, held);
      await gateway.receive(next.sessionId, clientMessage("client.credential_received", {}));
      gateway.disconnect(next.sessionId, "socket closed");
      held = next.sent ?? "";
    }
    const { gateway: restarted } = harness(store);
    expect((await hello(restarted, copied)).status).toBe("pairing_required");
    expect(trust(restarted)?.status).toBe("revoked");
  });

  it("on a request just after the move is only refused, since one can be in flight, and a hello is not so excused", async () => {
    const { gateway, retired, current } = await rotatedAndConfirmed();
    await expect(gateway.authorizeToken(retired)).resolves.toBeNull();
    expect(trust(gateway)?.status).toBe("active");
    await expect(gateway.authorizeToken(current)).resolves.not.toBeNull();
    expect((await hello(gateway, retired)).status).toBe("pairing_required");
    expect(trust(gateway)?.status).toBe("revoked");
  });

  it("is ordinary noise when it was never a credential of this client", async () => {
    const { gateway, clock, current } = await rotatedAndConfirmed();
    clock.now += 3 * MINUTE;
    await expect(gateway.authorizeToken("dummy-credential-never-issued")).resolves.toBeNull();
    expect(trust(gateway)?.status).toBe("active");
    await expect(gateway.authorizeToken(current)).resolves.not.toBeNull();
  });

  it("ends nothing when it merely names a client: only a credential Core issued can", async () => {
    const { gateway, current } = await rotatedAndConfirmed();
    const named = trust(gateway)?.trustedClientId ?? "";
    for (const forged of [`${named}.dummy`, `${named}.dummy.dummy`, `${named}.${current.split(".")[1]}.dummy`, `${named}`]) {
      expect((await hello(gateway, forged)).status).toBe("pairing_required");
      await expect(gateway.authorizeToken(forged)).resolves.toBeNull();
    }
    expect(trust(gateway)?.status).toBe("active");
    expect((await hello(gateway, current)).status).toBe("ready");
  });
});

describe("what is not a reuse", () => {
  it("a credential still in the lost-reply window, however late in it", async () => {
    const { gateway, clock } = harness();
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    const first = await hello(gateway, token);
    gateway.disconnect(first.sessionId, "socket closed");
    clock.now += 13 * DAY;
    expect((await hello(gateway, token)).status).toBe("ready");
    expect(trust(gateway)?.status).toBe("active");
  });

  it("a browser in regular use, however long, with no upper bound on renewal", async () => {
    const { gateway, clock } = harness();
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    let credential = token;
    for (let round = 0; round < 20; round += 1) {
      clock.now += 59 * DAY;
      const next = await hello(gateway, credential);
      expect(next.status).toBe("ready");
      await gateway.receive(next.sessionId, clientMessage("client.credential_received", {}));
      gateway.disconnect(next.sessionId, "socket closed");
      credential = next.sent ?? "";
    }
    expect(trust(gateway)?.status).toBe("active");
  });
});

describe("what is kept", () => {
  it("no credential, nothing that grows with use, and nothing secret in what the panel reads", async () => {
    const store = new MemoryStore();
    const { gateway, clock } = harness(store);
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    let credential = token;
    const seen: string[] = [token];
    const sizes: number[] = [];
    for (let round = 0; round < 60; round += 1) {
      clock.now += 1_000;
      const next = await hello(gateway, credential);
      await gateway.receive(next.sessionId, clientMessage("client.credential_received", {}));
      gateway.disconnect(next.sessionId, "socket closed");
      credential = next.sent ?? "";
      seen.push(credential);
      sizes.push(JSON.stringify(store.clients).length);
    }
    expect(sizes.at(-1)).toBe(sizes[1]);
    const text = JSON.stringify(store.clients);
    for (const raw of seen) expect(text).not.toContain(raw);
    const shown = gateway.snapshot().trustedClients[0] as unknown as Record<string, unknown>;
    expect(Object.keys(shown).filter((key) => /token|key|hash/iu.test(key))).toEqual([]);
  });
});

describe("the same browser approved again", () => {
  async function approve(gateway: ClientGatewayService, approvedByUserId: string): Promise<{ sessionId: string; token: string }> {
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome" }));
    const pairingCode = gateway.snapshot().pairings.find((pairing) => pairing.requestedBySessionId === session.sessionId)?.pairingCode ?? "";
    await gateway.approvePairing(pairingCode, { approvedByUserId });
    return { sessionId: session.sessionId, token: sentToken(gateway, session.sessionId) };
  }

  it("ends what that person had trusted under that client id, which someone else may still hold", async () => {
    const { gateway, heard } = harness();
    const first = await approve(gateway, "user.web");
    const second = await approve(gateway, "user.web");
    const trusts = gateway.snapshot().trustedClients.filter((client) => client.clientId === CLIENT_ID);
    expect(trusts.map((client) => client.status).sort()).toEqual(["active", "revoked"]);
    await expect(gateway.authorizeToken(first.token)).resolves.toBeNull();
    await expect(gateway.authorizeToken(second.token)).resolves.not.toBeNull();
    expect(heard).toContain("forgotten");
  });

  it("does not touch another person's trust, whose client id anyone could say", async () => {
    const { gateway } = harness();
    const theirs = await approve(gateway, "user.other");
    gateway.disconnect(theirs.sessionId, "socket closed");
    await approve(gateway, "user.web");
    expect(gateway.snapshot().trustedClients.map((client) => client.status)).toEqual(["active", "active"]);
    expect((await hello(gateway, theirs.token)).status).toBe("ready");
  });
});

describe("a revoke while a reconnect is in flight", () => {
  it("leaves no ready session, sends no credential, and tells custody to forget", async () => {
    const { gateway, heard, hold } = harness();
    const { sessionId, token } = await pair(gateway);
    gateway.disconnect(sessionId, "socket closed");
    let letGo = () => {};
    hold.rotating = new Promise<void>((resolve) => { letGo = resolve; });
    const session = gateway.connect();
    const received = gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome", token }));
    await vi_until(() => heard.includes("rotating"));
    await gateway.revokeTrustedClient(trust(gateway)?.trustedClientId ?? "", "person pressed Forget");
    letGo();
    await received;
    expect(gateway.snapshot().sessions.find((entry) => entry.sessionId === session.sessionId)?.status).toBe("pairing_required");
    expect(gateway.outbound(session.sessionId).some((message) => message.type === "server.session_ready")).toBe(false);
    expect(heard.lastIndexOf("forgotten")).toBeGreaterThan(heard.lastIndexOf("rotating"));
    expect(heard.slice(heard.lastIndexOf("rotating"))).not.toContain("presented");
  });
});

describe("a client saying it stored its credential", () => {
  it("confirms only what that session was sent, not a newer one from a concurrent reconnect", async () => {
    const { gateway, heard, hold } = harness();
    const { sessionId, token } = await pair(gateway);
    // A reconnect has written its new credential, and the open session has not been replaced yet.
    let letGo = () => {};
    hold.presented = new Promise<void>((resolve) => { letGo = resolve; });
    const reconnecting = gateway.connect();
    const received = gateway.receive(reconnecting.sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome", token }));
    await vi_until(() => heard.includes("presented"));
    // The open session was never sent that one, so it cannot be what this confirms.
    await gateway.receive(sessionId, clientMessage("client.credential_received", {}));
    letGo();
    await received;
    // The credential Core still accepts for a lost reply is untouched.
    await expect(gateway.authorizeToken(token)).resolves.not.toBeNull();
  });
});

describe("a forget delivered by its credential, with no socket", () => {
  it("ends the trust the credential speaks for", async () => {
    const { gateway, heard } = harness();
    const { token } = await pair(gateway);
    await expect(gateway.access.forgetByCredential(token)).resolves.toBe(true);
    expect(trust(gateway)?.status).toBe("revoked");
    expect(heard).toContain("forgotten");
  });

  it("does nothing for a credential that speaks for nobody", async () => {
    const { gateway } = harness();
    await pair(gateway);
    await expect(gateway.access.forgetByCredential("dummy-credential-never-issued")).resolves.toBe(false);
    expect(trust(gateway)?.status).toBe("active");
  });
});

async function vi_until(check: () => boolean): Promise<void> {
  for (let tick = 0; tick < 200 && !check(); tick += 1) await new Promise((resolve) => setImmediate(resolve));
  expect(check()).toBe(true);
}
