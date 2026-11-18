// @fluxiq-test-group real-sql
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import { clientGatewayCredentialHash, issueClientGatewayCredential } from "../../../../client-gateway/service/credentials/index.ts";
import { createSqliteClientTrustRepository } from "../../index.ts";
import { browserTrustFixture } from "../../tests/browser-trust-fixture.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function record(id = "synthetic-client", token = "legacy-synthetic-credential"): ClientGatewayTrustedClient {
  return {
    trustedClientId: id,
    clientId: "extension.same-client-id",
    clientType: "extension",
    name: "Synthetic browser",
    tokenHash: clientGatewayCredentialHash(token),
    approvedByUserId: "user.synthetic",
    domainId: null,
    approvedAt: 1_000_000,
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    lastUsedAt: 1_000_000,
    expiresAt: 2_000_000
  };
}

describe("scoped authoritative browser trust persistence", () => {
  it("counts active ordinary clients across tenants while excluding only the exact replacement", async () => {
    const f = await browserTrustFixture(cleanups);
    const first = f.repository.scopedStore("workspace.first");
    const second = f.repository.scopedStore("workspace.second");
    await Promise.all([first.load(), second.load()]);
    const make = (id: string) => ({ ...record(id, `token-${id}`), clientInstallId: "installation-one" });
    await first.save([
      make("active-first"), { ...make("expired"), expiresAt: f.clock.now },
      { ...make("revoked"), revokedAt: f.clock.now },
      { ...make("managed"), managedHost: { hostId: "host-one", profile: "named" } },
      { ...make("other-user"), approvedByUserId: "different-user" }
    ]);
    await second.save([make("active-second")]);
    expect(await f.repository.countActiveForUser("user.synthetic")).toBe(2);
    expect(await f.repository.countActiveForUser("user.synthetic", { workspaceId: "workspace.first", clientId: "extension.same-client-id", clientInstallId: "installation-one" })).toBe(1);
    expect(await f.repository.countActiveForUser("user.synthetic", { workspaceId: "workspace.first", clientId: "extension.same-client-id", clientInstallId: "different-installation" })).toBe(2);
    expect(await f.repository.countActiveForUser("different-user")).toBe(1);
    // The same clients, listed as bindings in their own workspaces: what account deletion and a suspended membership revoke.
    expect((await f.repository.listActiveForUser("user.synthetic")).map((binding) => [binding.workspaceId, binding.trustedClientId])).toEqual([
      ["workspace.first", "active-first"],
      ["workspace.second", "active-second"]
    ]);
    expect(await f.repository.listActiveForUser("different-user")).toEqual([
      { workspaceId: "workspace.first", trustedClientId: "other-user", approvedByUserId: "different-user", clientId: "extension.same-client-id", clientType: "extension", domainId: null }
    ]);
    expect(await f.repository.listActiveForUser("nobody")).toEqual([]);
  });

  it("keeps installation and approving-session bindings immutable and rejects raw-session metadata", async () => {
    const f = await browserTrustFixture(cleanups);
    const store = f.repository.scopedStore("workspace.consent");
    await store.load();
    const trusted = { ...record(), clientInstallId: "installation-one", approvingSessionDigest: "a".repeat(64) };
    await store.save([trusted]);
    for (const changed of [
      { ...trusted, clientInstallId: "installation-two" },
      { ...trusted, approvingSessionDigest: "b".repeat(64) },
      { ...record() }
    ]) await expect(store.save([changed])).rejects.toMatchObject({ reason: "trust-rebound" });
    await expect(store.save([{ ...trusted, approvingSessionDigest: "raw-session-value" }])).rejects.toThrow("session digest");
    await expect(store.save([{ ...trusted, clientInstallId: " " }])).rejects.toThrow("installation binding");
    expect(await f.openRepository().scopedStore("workspace.consent").load()).toEqual([trusted]);
    const proof = await f.repository.lookupCredential("legacy-synthetic-credential");
    expect(JSON.stringify(proof)).not.toContain(trusted.approvingSessionDigest);
    expect(proof).toMatchObject({ status: "current", binding: { workspaceId: "workspace.consent" } });
  });

  it("does not create files or directories from empty load/lookup and arbitrates eight racing first saves", async () => {
    const f = await browserTrustFixture(cleanups);
    const freshPath = path.join(path.dirname(f.filePath), "fresh-root", "platform", "browser-trust.sqlite");
    const repositories = Array.from({ length: 8 }, () => createSqliteClientTrustRepository({ filePath: freshPath, now: () => f.clock.now }));
    for (const repository of repositories) cleanups.push(() => repository.close());
    const stores = repositories.map((repository) => repository.scopedStore("workspace.fresh"));
    expect(await Promise.all(stores.map((store) => store.load()))).toEqual(Array.from({ length: 8 }, () => []));
    expect(await repositories[0]!.lookupCredential("unknown")).toEqual({ status: "invalid", reason: "unknown" });
    await expect(access(path.join(path.dirname(f.filePath), "fresh-root"))).rejects.toMatchObject({ code: "ENOENT" });
    const outcomes = await Promise.allSettled(stores.map((store, index) => store.save([record(`synthetic-${index}`, `legacy-${index}`)])));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    for (const outcome of outcomes) if (outcome.status === "rejected") expect(outcome.reason).toMatchObject({ code: "browser_trust.conflict", reason: "stale-generation" });
    expect(await repositories[0]!.scopedStore("workspace.fresh").load()).toHaveLength(1);
  });

  it("requires a loaded snapshot and prevents immutable workspace/client/credential rebinding", async () => {
    const f = await browserTrustFixture(cleanups);
    const first = f.repository.scopedStore("workspace.first");
    const second = f.openRepository().scopedStore("workspace.second");
    await expect(first.save([record()])).rejects.toMatchObject({ reason: "not-loaded" });
    await Promise.all([first.load(), second.load()]);
    await first.save([record()]);
    await expect(second.save([record()])).rejects.toMatchObject({ reason: "workspace-rebound" });
    await expect(first.save([{ ...record(), approvedByUserId: "user.stranger" }])).rejects.toMatchObject({ reason: "trust-rebound" });
    await expect(second.save([record("another-id")])).rejects.toMatchObject({ reason: "credential-rebound" });
    await second.save([record("another-id", "different-legacy-token")]);
    expect(await first.load()).toHaveLength(1);
    expect(await second.load()).toHaveLength(1);
  });

  it("rejects stale writers after credential rotation and after revocation", async () => {
    const f = await browserTrustFixture(cleanups);
    const owner = f.repository.scopedStore("workspace.first");
    await owner.load();
    const key = "synthetic-reuse-key";
    const initial = issueClientGatewayCredential("signed-client", key, "initial");
    const changed = issueClientGatewayCredential("signed-client", key, "changed");
    const trusted = { ...record("signed-client", initial), reuseKey: key };
    await owner.save([trusted]);
    const stale = f.openRepository().scopedStore("workspace.first");
    const snapshot = await stale.load();
    const rotated = { ...trusted, tokenHash: clientGatewayCredentialHash(changed), previousTokenHash: trusted.tokenHash, previousValidUntil: f.clock.now + 10_000, lastMovedOnAt: f.clock.now };
    await owner.save([rotated]);
    await expect(stale.save(snapshot)).rejects.toMatchObject({ reason: "stale-generation" });
    expect(await f.openRepository().lookupCredential(changed)).toMatchObject({ status: "current" });
    expect(await f.openRepository().lookupCredential(initial)).toMatchObject({ status: "previous" });
    const beforeRevoke = await stale.load();
    await owner.save([{ ...rotated, revokedAt: f.clock.now, revocationReason: "synthetic revoke" }]);
    await expect(stale.save(beforeRevoke)).rejects.toMatchObject({ reason: "stale-generation" });
    expect(await f.openRepository().lookupCredential(changed)).toMatchObject({ status: "inactive", reason: "revoked" });
  });

  it("retains immutable removed/revoked authority and refuses fresh-snapshot revival", async () => {
    const f = await browserTrustFixture(cleanups);
    const store = f.repository.scopedStore("workspace.first");
    await store.load();
    const trusted = record();
    await store.save([trusted]);
    await store.save([{ ...trusted, revokedAt: f.clock.now, revocationReason: "synthetic revoke" }]);
    await expect(store.save([trusted])).rejects.toMatchObject({ reason: "revoked-trust" });
    await store.save([]);
    const fresh = f.openRepository().scopedStore("workspace.first");
    expect(await fresh.load()).toEqual([]);
    await expect(fresh.save([trusted])).rejects.toMatchObject({ reason: "removed-trust" });
    const other = f.openRepository().scopedStore("workspace.other");
    await other.load();
    await expect(other.save([trusted])).rejects.toMatchObject({ reason: "workspace-rebound" });
    expect(await f.openRepository().lookupCredential("legacy-synthetic-credential")).toMatchObject({ status: "inactive", reason: "revoked" });
  });

  it("keeps legacy digest proof, previous expiry and managed-host binding without persisting raw credentials", async () => {
    const f = await browserTrustFixture(cleanups);
    const store = f.repository.scopedStore("workspace.first");
    await store.load();
    await store.save([{ ...record(), previousTokenHash: clientGatewayCredentialHash("legacy-previous"), previousValidUntil: f.clock.now + 1_000, managedHost: { hostId: "host.synthetic", profile: "named" } }]);
    const lookup = f.openRepository();
    expect(await lookup.lookupCredential("legacy-synthetic-credential")).toMatchObject({ status: "current", binding: { workspaceId: "workspace.first", managedHost: { hostId: "host.synthetic", profile: "named" } } });
    expect(await lookup.lookupCredential("legacy-previous")).toMatchObject({ status: "previous" });
    f.clock.now += 1_000;
    expect(await lookup.lookupCredential("legacy-previous")).toEqual({ status: "invalid", reason: "unknown" });
    f.clock.now = 2_000_000;
    expect(await lookup.lookupCredential("legacy-synthetic-credential")).toMatchObject({ status: "inactive", reason: "expired" });
    const bytes = await readFile(f.filePath);
    expect(bytes.includes(Buffer.from("legacy-synthetic-credential"))).toBe(false);
    expect(bytes.includes(Buffer.from("legacy-previous"))).toBe(false);
  });

  it("rolls back every record and the CAS generation if a later insert fails", async () => {
    const f = await browserTrustFixture(cleanups);
    const store = f.repository.scopedStore("workspace.first");
    await store.load();
    await store.save([]);
    await f.executeSql("create trigger refuse_second before insert on browser_trust_records when new.trusted_client_id = 'second' begin select raise(abort, 'synthetic second insert rejection'); end;");
    await expect(store.save([record("first", "first-legacy"), record("second", "second-legacy")])).rejects.toThrow("synthetic second insert rejection");
    expect(await f.openRepository().scopedStore("workspace.first").load()).toEqual([]);
    await f.executeSql("drop trigger refuse_second;");
    await store.save([record("first", "first-legacy"), record("second", "second-legacy")]);
    expect(await store.load()).toHaveLength(2);
  });

  it("recovers a valid empty authority after the first write and schema creation roll back", async () => {
    const f = await browserTrustFixture(cleanups);
    const store = f.repository.scopedStore("workspace.first");
    await store.load();
    await expect(store.save([record(), record()])).rejects.toThrow("Duplicate browser trust record");
    expect(await f.openRepository().scopedStore("workspace.first").load()).toEqual([]);
    expect(await f.openRepository().lookupCredential("legacy-synthetic-credential")).toEqual({ status: "invalid", reason: "unknown" });
    await store.save([record()]);
    expect(await f.openRepository().lookupCredential("legacy-synthetic-credential")).toMatchObject({ status: "current" });
  });

  it("fails closed on corrupt persisted proof instead of reporting an unknown client", async () => {
    const f = await browserTrustFixture(cleanups);
    const store = f.repository.scopedStore("workspace.first");
    await store.load();
    await store.save([record()]);
    await f.executeSql("update browser_trust_records set client_json = '{}';");
    await expect(f.openRepository().lookupCredential("legacy-synthetic-credential")).rejects.toThrow("Invalid browser trust");
    await expect(f.openRepository().scopedStore("workspace.first").load()).rejects.toThrow("Invalid browser trust");
  });

  it("drains already queued saves on close and refuses later store or lookup use", async () => {
    const f = await browserTrustFixture(cleanups);
    const store = f.repository.scopedStore("workspace.first");
    await store.load();
    const first = store.save([record()]);
    const second = store.save([{ ...record(), name: "Renamed synthetic browser" }]);
    await Promise.all([first, second, f.repository.close()]);
    expect((await f.openRepository().scopedStore("workspace.first").load())[0]?.name).toBe("Renamed synthetic browser");
    await expect(store.load()).rejects.toThrow("closed");
    await expect(f.repository.lookupCredential("legacy-synthetic-credential")).rejects.toThrow("closed");
  });
});
