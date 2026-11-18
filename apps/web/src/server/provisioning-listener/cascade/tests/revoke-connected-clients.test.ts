// @fluxiq-test-group real-sql
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ClientGatewayService } from "fluxiq/client-gateway";
import { createSqliteClientTrustRepository } from "fluxiq/platform";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConnectedClientRevoker } from "../revoke-connected-clients";

// One workspace (local and self-hosted): a person's paired browsers live in
// the workspace's own gateway store, so turning the account off or deleting
// it revokes them there. Synthetic people and credentials only.

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function singleWorkspace() {
  // Issuance needs a durable trusted-client store; the revoker reads only the gateway's own snapshot.
  const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-single-revoke-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const store = createSqliteClientTrustRepository({ filePath: path.join(directory, "trust.sqlite") });
  cleanups.push(() => store.close());
  const gateway = new ClientGatewayService({
    trustedClientStore: store.scopedStore("workspace-main"),
    trustAuthority: {
      validateApproval: async ({ userId, approvingSessionDigest }) => ({ userId, approvingSessionDigest, maxActiveClients: 10 }),
      grantCredential: async () => undefined
    }
  });
  cleanups.push(() => gateway.close());
  await gateway.ready();
  const pair = async (userId: string, label: string) =>
    (await gateway.trust.issue({ clientId: `browser-${label}`, clientInstallId: `install-${label}`, clientType: "extension", name: "Synthetic browser", domainId: "web", approvedByUserId: userId, approvingSessionDigest: createHash("sha256").update(label).digest("hex") })).trustedClientId;
  const listActiveForUser = vi.fn(async () => { throw new Error("one workspace has no platform trust authority"); });
  const holdWorkspace = vi.fn(async () => { throw new Error("one workspace holds no tenant"); });
  const revoke = createConnectedClientRevoker({ tenancy: "single", primaryWorkspaceId: "workspace-main", primaryGateway: () => gateway, listActiveForUser, holdWorkspace });
  return { gateway, pair, revoke, listActiveForUser, holdWorkspace };
}

describe("createConnectedClientRevoker, one workspace", () => {
  it("revokes the person's browsers in the workspace's own gateway, telling them why, and nobody else's", async () => {
    const w = await singleWorkspace();
    const mine = await w.pair("person", "mine");
    const theirs = await w.pair("other", "theirs");
    expect(await w.revoke("person", "account_disabled")).toBe(1);
    const clients = w.gateway.snapshot().trustedClients;
    expect(clients.find((client) => client.trustedClientId === mine)).toMatchObject({ status: "revoked", revokedFor: "account_disabled" });
    expect(clients.find((client) => client.trustedClientId === theirs)).toMatchObject({ status: "active" });
    expect(await w.revoke("person", "account_deleted")).toBe(0);
    expect(w.listActiveForUser).not.toHaveBeenCalled();
    expect(w.holdWorkspace).not.toHaveBeenCalled();
  });

  it("revokes nothing for a scope naming another workspace", async () => {
    const w = await singleWorkspace();
    const mine = await w.pair("person", "mine");
    expect(await w.revoke("person", "revoked_by_admin", { workspaceId: "somewhere-else" })).toBe(0);
    expect(w.gateway.snapshot().trustedClients.find((client) => client.trustedClientId === mine)).toMatchObject({ status: "active" });
    expect(await w.revoke("person", "revoked_by_admin", { workspaceId: "workspace-main" })).toBe(1);
  });
});

describe("createConnectedClientRevoker, several workspaces", () => {
  it("skips a workspace that no longer exists and releases every workspace it held", async () => {
    const primaryGateway = { ready: vi.fn(async () => undefined), revokeTrustedClient: vi.fn(async () => true), snapshot: vi.fn(() => ({ trustedClients: [] })) };
    const tenantGateway = { ready: vi.fn(async () => undefined), revokeTrustedClient: vi.fn(async () => true), snapshot: vi.fn(() => ({ trustedClients: [] })) };
    const release = vi.fn();
    const binding = (workspaceId: string, trustedClientId: string) => ({ workspaceId, trustedClientId, approvedByUserId: "person", clientId: "browser", clientType: "extension" as const });
    const revoke = createConnectedClientRevoker({
      tenancy: "multi",
      primaryWorkspaceId: "workspace-main",
      primaryGateway: () => primaryGateway,
      listActiveForUser: async () => [binding("workspace-main", "on-primary"), binding("tenant-a", "in-a"), binding("tenant-gone", "in-gone")],
      holdWorkspace: async (workspaceId) => (workspaceId === "tenant-a" ? { gateway: tenantGateway, release } : null)
    });
    expect(await revoke("person", "account_deleted")).toBe(2);
    expect(primaryGateway.revokeTrustedClient).toHaveBeenCalledWith("on-primary", "account_deleted", "account_deleted");
    expect(tenantGateway.revokeTrustedClient).toHaveBeenCalledWith("in-a", "account_deleted", "account_deleted");
    expect(release).toHaveBeenCalledOnce();
    expect(await revoke("person", "revoked_by_admin", { workspaceId: "tenant-a" })).toBe(1);
    expect(primaryGateway.revokeTrustedClient).toHaveBeenCalledOnce();
  });
});
