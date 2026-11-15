// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SQLiteRepository } from "../../../../framework/persistence/repository/sqlite-repository.ts";
import { appInstallationFixture, appManifestFixture } from "../../tests/fixtures/index.ts";
import { SQLiteAppRegistryStore } from "../index.ts";

const roots: string[] = [];
const stores: SQLiteAppRegistryStore[] = [];
const allow = async () => true;
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-app-registry-"));
  roots.push(rootDir);
  const store = open(rootDir);
  const manifest = await appManifestFixture();
  await store.registerManifest(manifest, allow);
  return { rootDir, store, manifest };
}

function open(rootDir: string): SQLiteAppRegistryStore {
  const store = new SQLiteAppRegistryStore({ rootDir });
  stores.push(store);
  return store;
}

describe("durable app registry", () => {
  it("does not persist caller mutations while the authorization guard is pending", async () => {
    const { store, manifest } = await fixture();
    const input = appInstallationFixture(manifest);
    let resume!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const paused = new Promise<void>((resolve) => { resume = resolve; });
    const pending = store.createInstallation(input, "user.one", async () => {
      entered();
      await paused;
      return true;
    });
    await started;
    input.workspaceId = "workspace.attacker";
    input.approvedGrants = [];
    resume();
    expect(await pending).toBe(true);
    const stored = await store.getInstallation(input.installationId);
    expect(stored?.workspaceId).toBe("workspace.one");
    expect(stored?.approvedGrants).toEqual(manifest.requestedGrants);
    expect(await store.listInstallations("workspace.attacker")).toEqual([]);
  });

  it("rolls back a failing authority provider without exposing its raw error", async () => {
    const { store, manifest } = await fixture();
    const input = appInstallationFixture(manifest);
    const failure = store.createInstallation(input, "user.one", async () => { throw new Error("private-provider-detail"); });
    await expect(failure).rejects.toMatchObject({ code: "storage_unavailable" });
    await expect(failure).rejects.not.toThrow("private-provider-detail");
    expect(await store.getInstallation(input.installationId)).toBeNull();
    expect(await store.history(input.installationId)).toEqual([]);
  });

  it("reopens immutable manifest pins, workspace installations and ordered consent history", async () => {
    const { rootDir, store, manifest } = await fixture();
    const initial = appInstallationFixture(manifest);
    expect(await store.createInstallation(initial, "user.one", allow)).toBe(true);
    const changed = { ...initial, revision: 2, generation: 2, updatedAtMs: 2_000, approvedGrants: [] };
    expect(await store.replaceInstallation(changed, 1, "user.admin", allow)).toBe(true);
    await store.close();
    const reopened = open(rootDir);
    expect(await reopened.getManifest(manifest)).toEqual(manifest);
    expect(await reopened.getInstallation(initial.installationId)).toEqual(changed);
    expect(await reopened.listInstallations("workspace.one")).toEqual([changed]);
    expect(await reopened.listInstallations("workspace.other")).toEqual([]);
    expect((await reopened.history(initial.installationId)).map((entry) => [entry.installation.revision, entry.actorUserId])).toEqual([[1, "user.one"], [2, "user.admin"]]);
  });

  it("rejects tampered manifests and immutable version reuse without overwriting the old artifact", async () => {
    const { store, manifest } = await fixture();
    expect(await store.registerManifest(manifest, allow)).toBe("existing");
    await expect(store.registerManifest({ ...manifest, packageDigest: "c".repeat(64) }, allow)).rejects.toMatchObject({ code: "invalid_record" });
    const different = await appManifestFixture({ packageDigest: "c".repeat(64) });
    await expect(store.registerManifest(different, allow)).rejects.toMatchObject({ code: "manifest_conflict" });
    expect(await store.getManifest(manifest)).toEqual(manifest);
  });

  it("commits exactly one competing revision across independent SQLite stores", async () => {
    const { store, rootDir, manifest } = await fixture();
    const initial = appInstallationFixture(manifest);
    await store.createInstallation(initial, "user.one", allow);
    const contenders = Array.from({ length: 8 }, () => open(rootDir));
    const results = await Promise.all(contenders.map((candidate, index) => candidate.replaceInstallation({ ...initial, revision: 2, generation: 2, updatedAtMs: 2_000 + index }, 1, `user.${index}`, allow)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.history(initial.installationId)).toHaveLength(2);
  });

  it("does not rebind workspace/app/installer or revive a revoked installation", async () => {
    const { store, manifest } = await fixture();
    const initial = appInstallationFixture(manifest);
    await store.createInstallation(initial, "user.one", allow);
    const next = { ...initial, revision: 2, generation: 2, updatedAtMs: 2_000 };
    for (const changed of [{ ...next, workspaceId: "workspace.other" }, { ...next, installedByUserId: "user.other" }, { ...next, installedAtMs: 999 }, { ...next, generation: 1 }]) {
      await expect(store.replaceInstallation(changed, 1, "user.one", allow)).rejects.toMatchObject({ code: "invalid_record" });
    }
    expect(await store.replaceInstallation({ ...next, status: "revoked", revokedAtMs: 2_000 }, 1, "user.one", allow)).toBe(true);
    expect(await store.replaceInstallation({ ...next, revision: 3, generation: 3 }, 2, "user.one", allow)).toBe(false);
    expect((await store.getInstallation(initial.installationId))?.status).toBe("revoked");
  });

  it("requires a matching registered pin and refuses grant expansion", async () => {
    const { store, manifest } = await fixture();
    const initial = appInstallationFixture(manifest);
    await expect(store.createInstallation({ ...initial, app: { ...initial.app, manifestDigest: "c".repeat(64) } }, "user.one", allow)).rejects.toMatchObject({ code: "invalid_record" });
    await expect(store.createInstallation({ ...initial, approvedGrants: [{ capability: "dataset.write", bindingId: "dataset:orders" }] }, "user.one", allow)).rejects.toMatchObject({ code: "invalid_record" });
    expect(await store.listInstallations(initial.workspaceId)).toEqual([]);
  });

  it("rechecks the trusted mutation guard and rolls back every row when it refuses", async () => {
    const { store, manifest } = await fixture();
    const initial = appInstallationFixture(manifest);
    await expect(store.createInstallation(initial, "user.one", async () => false)).rejects.toMatchObject({ code: "authority_changed" });
    expect(await store.getInstallation(initial.installationId)).toBeNull();
    expect(await store.listInstallations(initial.workspaceId)).toEqual([]);
    expect(await store.history(initial.installationId)).toEqual([]);
  });

  it("rolls back the installation and workspace index if its audit insert fails", async () => {
    const { store, rootDir, manifest } = await fixture();
    const repository = new SQLiteRepository({ rootDir, kind: "platform.apps" });
    await repository.transaction({}, (transaction) => transaction.run(`CREATE TRIGGER fail_app_audit BEFORE INSERT ON ${repository.tableName} WHEN NEW.id LIKE 'history/%' BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END`));
    const initial = appInstallationFixture(manifest);
    await expect(store.createInstallation(initial, "user.one", allow)).rejects.toMatchObject({ code: "storage_unavailable" });
    expect(await store.getInstallation(initial.installationId)).toBeNull();
    expect(await store.listInstallations(initial.workspaceId)).toEqual([]);
  });

  it("close drains a write already in progress and refuses new work", async () => {
    const { store, manifest } = await fixture();
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const pending = store.createInstallation(appInstallationFixture(manifest), "user.one", async () => {
      entered();
      await gate;
      return true;
    });
    await enteredPromise;
    const closing = store.close();
    await expect(store.getInstallation("installation.one")).rejects.toMatchObject({ code: "store_closed" });
    release();
    expect(await pending).toBe(true);
    await closing;
  });
});
