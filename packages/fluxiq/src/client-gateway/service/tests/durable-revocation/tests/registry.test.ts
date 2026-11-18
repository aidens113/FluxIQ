import { describe, expect, it } from "vitest";
import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import { resolveClientGatewayConfig } from "../../../config.ts";
import { ClientGatewayTrustedClientRegistry } from "../../../trusted-clients.ts";
import { clientGatewayCredentialHash } from "../../../credentials/index.ts";
import { RevocationStore } from "../store.ts";

async function registryFixture() {
  const store = new RevocationStore();
  const registry = new ClientGatewayTrustedClientRegistry(resolveClientGatewayConfig({ trustedClientStore: store, now: () => 1_000_000 }));
  const issued = await registry.register({ clientId: "extension.registry", clientType: "extension", name: "Synthetic browser", approvedByUserId: "user.registry", domainId: null });
  return { registry, store, ...issued };
}

describe("registry-owned committed teardown decisions", () => {
  it("rejects a detached record instead of mutating a stale copy", async () => {
    const { registry, store, trustedClient } = await registryFixture();
    const before = structuredClone(store.clients);
    await expect(registry.revoke({ ...trustedClient }, "foreign object")).rejects.toThrow("trust ended");
    expect(store.clients).toEqual(before);
    expect(store.saves).toBe(1);
  });

  it("returns the registry-owned object and preserves direct repeat-save rollback", async () => {
    const { registry, store, trustedClient } = await registryFixture();
    const decision = await registry.revokeById(trustedClient.trustedClientId, "original");
    expect(decision?.trustedClient).toBe(registry.get(trustedClient.trustedClientId));
    expect(decision?.changed).toBe(true);
    const original = structuredClone(trustedClient);
    store.failNext = true;
    await expect(registry.revoke(trustedClient, "repeat")).rejects.toThrow("synthetic save rejected");
    expect(trustedClient).toEqual(original);
    expect((await registry.revokeById(trustedClient.trustedClientId, "repeat"))?.changed).toBe(false);
    expect(store.saves).toBe(3);
  });

  it("resolves a previous credential after a pending confirmation removes its index then rolls back", async () => {
    const { registry, store, trustedClient, token } = await registryFixture();
    await registry.rotateToken(trustedClient, token);
    const held = store.blockNextSave();
    const confirmation = registry.confirmCurrent(trustedClient);
    const outcome = confirmation.then(() => "saved", () => "failed");
    await held.entered;
    expect(registry.resolveByToken(token)).toBeUndefined();
    const credential = registry.resolveForgetCredential(token);
    held.fail();
    expect(await outcome).toBe("failed");
    expect((await credential)?.status).toBe("previous");
    expect(registry.resolveByToken(token)).toBe(trustedClient);
  });

  it("resolves the committed current credential after pending rotation rolls back", async () => {
    const { registry, store, trustedClient, token } = await registryFixture();
    const held = store.blockNextSave();
    const rotating = registry.rotateToken(trustedClient, token);
    const outcome = rotating.then(() => "saved", () => "failed");
    await held.entered;
    const credential = registry.resolveForgetCredential(token);
    held.fail();
    expect(await outcome).toBe("failed");
    expect((await credential)?.status).toBe("current");
    expect(registry.resolveByToken(token)).toBe(trustedClient);
  });

  it("does not report a tentative registration as present after its failed save", async () => {
    const store = new RevocationStore();
    const registry = new ClientGatewayTrustedClientRegistry(resolveClientGatewayConfig({ trustedClientStore: store }));
    const held = store.blockNextSave();
    const registering = registry.register({ clientId: "extension.pending", clientType: "extension", name: "Pending", approvedByUserId: "user.pending", domainId: null });
    const outcome = registering.then(() => "saved", () => "failed");
    await held.entered;
    const tentative = registry.list()[0]!;
    const revoking = registry.revokeById(tentative.trustedClientId, "never committed");
    held.fail();
    expect(await outcome).toBe("failed");
    expect(await revoking).toBeUndefined();
    expect(store.clients).toEqual([]);
    expect(store.saves).toBe(1);
  });

  it("recognizes a revoked legacy digest solely for retrying its cleanup", async () => {
    const store = new RevocationStore();
    const legacy: ClientGatewayTrustedClient = {
      trustedClientId: "synthetic-legacy",
      clientId: "extension.legacy",
      clientType: "extension",
      name: "Synthetic legacy browser",
      tokenHash: clientGatewayCredentialHash("synthetic-legacy-credential"),
      approvedByUserId: "user.legacy",
      domainId: null,
      approvedAt: 0,
      createdAt: 0,
      updatedAt: 0,
      lastUsedAt: 0,
      expiresAt: 10_000,
      revokedAt: 0
    };
    store.clients = [legacy];
    const registry = new ClientGatewayTrustedClientRegistry(resolveClientGatewayConfig({ trustedClientStore: store, now: () => 1_000 }));
    const credential = await registry.resolveForgetCredential("synthetic-legacy-credential");
    expect(credential).toEqual({ trustedClientId: legacy.trustedClientId, clientId: legacy.clientId, status: "revoked" });
    expect(registry.resolveByToken("synthetic-legacy-credential")).toBeUndefined();
    expect(store.saves).toBe(0);
  });
});
