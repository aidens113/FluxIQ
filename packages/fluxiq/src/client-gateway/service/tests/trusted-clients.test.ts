import { describe, expect, it } from "vitest";
import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import { resolveClientGatewayConfig } from "../config.ts";
import { ClientGatewayTrustedClientRegistry } from "../trusted-clients.ts";
import { clientGatewayCredentialHash } from "../credentials/index.ts";

describe("mandatory trusted-client persistence rollback", () => {
  it("restores the absent legacy signing key when a digest credential upgrade cannot persist", async () => {
    const original: ClientGatewayTrustedClient = {
      trustedClientId: "synthetic-legacy-client",
      clientId: "extension.synthetic",
      clientType: "extension",
      name: "Synthetic legacy browser",
      tokenHash: clientGatewayCredentialHash("legacy-credential"),
      approvedByUserId: "user.synthetic",
      domainId: null,
      approvedAt: 1_000_000,
      createdAt: 1_000_000,
      updatedAt: 1_000_000,
      lastUsedAt: 1_000_000,
      expiresAt: 2_000_000
    };
    const registry = new ClientGatewayTrustedClientRegistry(resolveClientGatewayConfig({
      now: () => 1_000_000,
      trustedClientStore: { load: async () => [{ ...original }], save: async () => { throw new Error("synthetic save failure"); } }
    }));
    await registry.ready();
    const loaded = registry.get(original.trustedClientId)!;
    await expect(registry.rotateToken(loaded, "legacy-credential")).rejects.toThrow("synthetic save failure");
    expect(loaded).toEqual(original);
    expect(registry.resolveByToken("legacy-credential")).toBe(loaded);
  });

  it("does not revive already revoked trust when a repeat revoke cannot persist", async () => {
    let failing = false;
    const registry = new ClientGatewayTrustedClientRegistry(resolveClientGatewayConfig({
      now: () => 0,
      trustedClientStore: {
        load: async () => [],
        save: async () => { if (failing) throw new Error("synthetic save failure"); }
      }
    }));
    await registry.ready();
    const issued = await registry.register({ clientId: "extension.synthetic", clientType: "extension", name: "Synthetic browser", approvedByUserId: "user.synthetic", domainId: null });
    await registry.revoke(issued.trustedClient, "original revoke");
    expect(registry.isActive(issued.trustedClient)).toBe(false);
    expect(registry.toView(issued.trustedClient).status).toBe("revoked");
    const before = { ...issued.trustedClient };
    failing = true;
    await expect(registry.revoke(issued.trustedClient, "repeat revoke")).rejects.toThrow("synthetic save failure");
    expect(issued.trustedClient).toEqual(before);
    expect(registry.isActive(issued.trustedClient)).toBe(false);
    expect(registry.resolveByToken(issued.token)).toBeUndefined();
  });
});
