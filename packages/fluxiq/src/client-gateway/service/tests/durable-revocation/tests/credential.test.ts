import { describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage } from "../../../../index.ts";
import { clientGatewayCredentialHash } from "../../../credentials/index.ts";
import { revocationFixture } from "../fixture.ts";
import { RevocationStore } from "../store.ts";

async function reconnect(gateway: ClientGatewayService, token: string) {
  const session = gateway.connect();
  const hello: ClientGatewayClientMessage = {
    id: "synthetic-reconnect",
    type: "client.hello",
    protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
    timestamp: 1,
    payload: { clientId: "extension.revocation", clientType: "extension", token }
  };
  await gateway.receive(session.sessionId, hello);
  const ready = gateway.outbound(session.sessionId).find((message) => message.type === "server.session_ready")!;
  return { sessionId: session.sessionId, token: (ready.payload as { token: string }).token };
}

describe("forget credential proof semantics", () => {
  it("accepts a previous credential still in its lost-reply window", async () => {
    const { gateway, store, token } = await revocationFixture();
    const current = await reconnect(gateway, token);
    await expect(gateway.access.forgetByCredential(token)).resolves.toBe(true);
    await expect(gateway.authorizeToken(current.token)).resolves.toBeNull();
    expect(store.clients[0]?.revokedAt).toBeDefined();
    expect(gateway.snapshot().auditLog.some((entry) => entry.type === "credential.reuse_detected")).toBe(false);
  });

  it("refuses an obsolete credential and durably revokes only its matching trust as reuse", async () => {
    const { gateway, store, pair, token } = await revocationFixture();
    const other = await pair("extension.unrelated");
    const current = await reconnect(gateway, token);
    await gateway.receive(current.sessionId, {
      id: "synthetic-confirmation",
      type: "client.credential_received",
      protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
      timestamp: 1,
      payload: {}
    });
    await expect(gateway.access.forgetByCredential(token)).resolves.toBe(false);
    await expect(gateway.authorizeToken(current.token)).resolves.toBeNull();
    await expect(gateway.authorizeToken(other.token)).resolves.toMatchObject({ trustedClientId: other.trustedClientId });
    const reused = gateway.snapshot().auditLog.filter((entry) => entry.type === "credential.reuse_detected");
    expect(reused).toHaveLength(1);
    expect(store.clients.find((client) => client.trustedClientId === other.trustedClientId)?.revokedAt).toBeUndefined();
    expect(JSON.stringify(reused)).not.toContain(token);
  });

  it("treats an expired previous credential on active trust as reuse", async () => {
    const { gateway, store, clock, token } = await revocationFixture();
    await reconnect(gateway, token);
    clock.now = store.clients[0]!.previousValidUntil!;
    await expect(gateway.access.forgetByCredential(token)).resolves.toBe(false);
    expect(store.clients[0]?.revocationReason).toBe("credential reuse detected");
  });

  it("leaves expired trust unchanged for its current credential", async () => {
    const { gateway, store, clock, token } = await revocationFixture();
    clock.now = store.clients[0]!.expiresAt;
    await expect(gateway.access.forgetByCredential(token)).resolves.toBe(false);
    expect(store.clients[0]?.revokedAt).toBeUndefined();
    expect(store.saves).toBe(1);
  });

  it("does not turn obsolete proof of expired trust into another revoke", async () => {
    const { gateway, store, clock, token } = await revocationFixture();
    const current = await reconnect(gateway, token);
    await gateway.receive(current.sessionId, { id: "synthetic-expiring-confirmation", type: "client.credential_received", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1, payload: {} });
    const saves = store.saves;
    clock.now = store.clients[0]!.expiresAt;
    await expect(gateway.access.forgetByCredential(token)).resolves.toBe(false);
    expect(store.clients[0]?.revokedAt).toBeUndefined();
    expect(store.saves).toBe(saves);
  });

  it("forgets legacy digest trust and recognizes its removed index for cleanup retry", async () => {
    const store = new RevocationStore();
    const token = "synthetic-legacy-credential";
    store.clients = [{ trustedClientId: "legacy", clientId: "extension.legacy", clientType: "extension", name: "Legacy", tokenHash: clientGatewayCredentialHash(token), approvedByUserId: "user.legacy", domainId: null, approvedAt: 0, createdAt: 0, updatedAt: 0, lastUsedAt: 0, expiresAt: 10_000 }];
    const forgotten = vi.fn(async () => undefined);
    const gateway = new ClientGatewayService({
      trustedClientStore: store,
      now: () => 1_000,
      credentialCustody: { issued: async () => undefined, confirmed: async () => undefined, rotating: async () => undefined, presented: async () => undefined, released: () => undefined, forgotten }
    });
    try {
      await expect(gateway.access.forgetByCredential(token)).resolves.toBe(true);
      await expect(gateway.access.forgetByCredential(token)).resolves.toBe(false);
      expect(forgotten).toHaveBeenCalledTimes(2);
      expect(store.clients[0]?.revokedAt).toBe(1_000);
      expect(store.saves).toBe(1);
    } finally {
      await gateway.close();
    }
  });

  it.each(["empty", "unknown", "named-forgery"] as const)("does nothing for %s proof", async (kind) => {
    const { gateway, store, trustedClientId } = await revocationFixture();
    const token = kind === "empty" ? "" : kind === "unknown" ? "synthetic-no-credential" : `${trustedClientId}.synthetic.forged`;
    await expect(gateway.access.forgetByCredential(token)).resolves.toBe(false);
    expect(store.saves).toBe(1);
    expect(store.clients[0]?.revokedAt).toBeUndefined();
  });
});
