// A pairing binds the domain the client declared when the person approved it
// (t379). A later connection declaring another domain, or trust minted before
// the domain was bound, is not resumed: it goes back through the existing
// pairing path, where a person approves it again or not.

import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage, type ClientGatewayTrustedClient, type ClientGatewayTrustedClientStore } from "../index.ts";

const WEB = { domainId: "web-automation" };
const DESKTOP = { domainId: "desktop-automation" };

describe("a paired client's trust is bound to the domain it declared when approved", () => {
  it("records the declared domain and keeps it when the client reconnects declaring the same one", async () => {
    const tokens = ["pair-token", "rotated-token"];
    const gateway = new ClientGatewayService({ createToken: () => tokens.shift() ?? "unexpected-token" });
    const paired = await pairClient(gateway, "extension.web", WEB);
    expect(gateway.snapshot().trustedClients[0]).toMatchObject({ trustedClientId: paired.trustedClientId, domainId: "web-automation" });
    expect((await gateway.authorizeToken(paired.token))?.metadata).toMatchObject(WEB);
    gateway.disconnect(paired.sessionId);

    const again = await hello(gateway, "extension.web", paired.token, WEB);

    expect(status(gateway, again)).toBe("ready");
    expect(readyToken(gateway, again)).toBe("rotated-token");
    expect((await gateway.authorizeToken("rotated-token"))?.sessionId).toBe(again);
    expect(gateway.snapshot().trustedClients[0]?.domainId).toBe("web-automation");
  });

  it("binds a client that declared no domain to none, and refuses it once it declares one", async () => {
    const gateway = new ClientGatewayService({ createToken: () => "none-token" });
    const paired = await pairClient(gateway, "extension.none");
    expect(gateway.snapshot().trustedClients[0]?.domainId).toBeNull();
    gateway.disconnect(paired.sessionId);

    const again = await hello(gateway, "extension.none", paired.token, WEB);

    expect(status(gateway, again)).toBe("pairing_required");
  });

  it("does not resume a connection that declares another domain, and the existing re-pair path binds the new one", async () => {
    const tokens = ["web-token", "desktop-token"];
    const gateway = new ClientGatewayService({ createToken: () => tokens.shift() ?? "unexpected-token" });
    const paired = await pairClient(gateway, "extension.switch", WEB);
    gateway.disconnect(paired.sessionId);

    const switched = await hello(gateway, "extension.switch", paired.token, DESKTOP);

    expect(status(gateway, switched)).toBe("pairing_required");
    expect(gateway.outbound(switched).some((message) => message.type === "server.session_ready")).toBe(false);
    expect(gateway.outbound(switched).some((message) => message.type === "server.pairing_required")).toBe(true);
    expect(gateway.snapshot().auditLog.find((entry) => entry.type === "session.domain_rejected")?.metadata).toEqual({
      sessionId: switched,
      clientId: "extension.switch",
      boundDomainId: "web-automation",
      declaredDomainId: "desktop-automation",
    });
    // The refused connection rotated nothing and reached nothing.
    expect(await gateway.authorizeToken(paired.token)).toBeNull();

    const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === switched);
    await gateway.approvePairing(pairing?.pairingCode ?? "", { approvedByUserId: "user.alpha" });

    expect(status(gateway, switched)).toBe("ready");
    expect(readyToken(gateway, switched)).toBe("desktop-token");
    expect((await gateway.authorizeToken("desktop-token"))?.metadata).toMatchObject(DESKTOP);
    expect(gateway.snapshot().trustedClients.map((client) => client.domainId)).toEqual(["web-automation", "desktop-automation"]);
  });

  it("requires a new approval for trust minted before the domain was bound", async () => {
    const store = new MemoryTrustedClientStore();
    const first = new ClientGatewayService({ trustedClientStore: store, createToken: () => "legacy-token" });
    const paired = await pairClient(first, "extension.legacy", WEB);
    first.disconnect(paired.sessionId);
    // As written by a gateway that did not bind the domain.
    store.clients = store.clients.map(({ domainId: _domainId, ...client }) => client);

    const restarted = new ClientGatewayService({ trustedClientStore: store, createToken: () => "unused" });
    const again = await hello(restarted, "extension.legacy", paired.token, WEB);

    expect(status(restarted, again)).toBe("pairing_required");
    expect(restarted.snapshot().auditLog.some((entry) => entry.type === "session.domain_rejected")).toBe(true);
  });

  it("persists the bound domain with the trust, and restores it after a restart", async () => {
    const store = new MemoryTrustedClientStore();
    const first = new ClientGatewayService({ trustedClientStore: store, createToken: () => "persist-token" });
    const paired = await pairClient(first, "extension.persist", WEB);
    first.disconnect(paired.sessionId);
    expect(store.clients[0]?.domainId).toBe("web-automation");

    const restarted = new ClientGatewayService({ trustedClientStore: store, createToken: () => "persist-rotated" });
    const same = await hello(restarted, "extension.persist", paired.token, WEB);
    expect(status(restarted, same)).toBe("ready");

    const other = await hello(restarted, "extension.persist", "persist-rotated", DESKTOP);
    expect(status(restarted, other)).toBe("pairing_required");
  });
});

async function pairClient(gateway: ClientGatewayService, clientId: string, metadata?: { domainId: string }) {
  const session = gateway.connect();
  await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId, clientType: "extension", name: clientId, ...(metadata ? { metadata } : {}) }));
  await gateway.approvePairing(gateway.snapshot().pairings.find((pairing) => pairing.requestedBySessionId === session.sessionId)?.pairingCode ?? "", { approvedByUserId: "user.alpha" });
  return {
    sessionId: session.sessionId,
    token: readyToken(gateway, session.sessionId),
    trustedClientId: gateway.snapshot().sessions.find((item) => item.sessionId === session.sessionId)?.trustedClientId ?? "",
  };
}

async function hello(gateway: ClientGatewayService, clientId: string, token: string, metadata: { domainId: string }): Promise<string> {
  const session = gateway.connect();
  await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId, clientType: "extension", token, metadata }));
  return session.sessionId;
}

function status(gateway: ClientGatewayService, sessionId: string): string | undefined {
  return gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.status;
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
  payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"],
): Extract<ClientGatewayClientMessage, { type: TType }> {
  return {
    id: `message.${Math.random().toString(36).slice(2)}`,
    type,
    protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
    timestamp: Date.now(),
    payload,
  } as Extract<ClientGatewayClientMessage, { type: TType }>;
}
