// @fluxiq-test-group real-sql
// A layout v1 root that has run before holds its runtime store at
// `.fluxiq/artifacts/runtime`, outside every legacy root. Its migration used to
// archive the legacy roots and then throw at the cutover, and a rollback then
// deleted that runtime store (t932). These tests migrate such a root, stop the
// migration at every rename it makes, and check that each stop resumes and
// rolls back cleanly.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SQLiteRepository, createRecord } from "../persistence/repository/sqlite-repository.ts";
import { FluxIQ, inspectFluxIQStorage, migrateFluxIQStorage, rollbackFluxIQStorageMigration, writeMigrationJournal } from "../index.ts";

// Every rename the migration makes passes through here, so a test can make the n-th one fail as an interrupted process would leave it.
const interruption = vi.hoisted(() => ({ renames: 0, failAt: 0 }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const rename: typeof actual.rename = async (from, to) => {
    interruption.renames += 1;
    if (interruption.renames === interruption.failAt) throw new Error(`interrupted at rename ${interruption.renames}`);
    return await actual.rename(from, to);
  };
  return { ...actual, rename };
});

const DOMAIN_ID = "importer_domain";
const roots: string[] = [];
const instances: FluxIQ[] = [];

afterEach(async () => {
  interruption.failAt = 0;
  await Promise.all(instances.splice(0).map((instance) => instance.close()));
  await Promise.all(roots.splice(0).map(removeWithRetry));
});

describe("FluxIQ storage migration of a v1 root that has run before", () => {
  it("migrates a root whose runtime store sits under artifacts/, keeps that store, and then sets up", async () => {
    const { root, fluxiqRoot } = await ranLegacyRoot();
    const legacy = open(root);
    expect(legacy.inspectStorage().layout).toBe("v1");

    const result = await legacy.migrateStorage();

    expect(result.archiveRoot).toBe(path.join(fluxiqRoot, "legacy", path.basename(result.archiveRoot)));
    await expectMigrated(fluxiqRoot);
    const migrated = open(root);
    await expect(migrated.setup()).resolves.toMatchObject({ created: [], configPath: path.join(fluxiqRoot, "config.json") });
    expect((await migrated.programs.automationStudio.listProjects()).projects).toContainEqual(expect.objectContaining({ id: "project.legacy" }));
  });

  it("changes nothing when it is asked to migrate a second time", async () => {
    const { fluxiqRoot } = await ranLegacyRoot();
    await migrateFluxIQStorage({ fluxiqRoot, activeDomainId: DOMAIN_ID });
    const before = await snapshot(fluxiqRoot);

    await expect(migrateFluxIQStorage({ fluxiqRoot, activeDomainId: DOMAIN_ID })).rejects.toThrow("already uses layout v2");

    expect(await snapshot(fluxiqRoot)).toEqual(before);
    await expectMigrated(fluxiqRoot);
  });

  it("resumes, or rolls back to the exact original files, from a stop at every rename the migration makes", { timeout: 600_000 }, async () => {
    const counted = await ranLegacyRoot();
    interruption.renames = 0;
    await migrateFluxIQStorage({ fluxiqRoot: counted.fluxiqRoot, activeDomainId: DOMAIN_ID });
    const renames = interruption.renames;
    // The journal's five writes, three archived roots, three promoted entries, the commit marker and the history at least.
    expect(renames).toBeGreaterThanOrEqual(13);

    for (let failAt = 1; failAt <= renames; failAt += 1) {
      const resumed = await ranLegacyRoot();
      await interrupted(resumed.fluxiqRoot, failAt);
      await migrateFluxIQStorage({ fluxiqRoot: resumed.fluxiqRoot, activeDomainId: DOMAIN_ID });
      await expectMigrated(resumed.fluxiqRoot);

      const rolledBack = await ranLegacyRoot();
      const original = await snapshot(rolledBack.fluxiqRoot);
      await interrupted(rolledBack.fluxiqRoot, failAt);
      if (await exists(path.join(rolledBack.fluxiqRoot, "config.json"))) {
        // Past the commit marker the root is v2 already: only resuming finishes it.
        await expect(rollbackFluxIQStorageMigration(rolledBack.fluxiqRoot)).rejects.toThrow("already committed");
      } else {
        await rollbackFluxIQStorageMigration(rolledBack.fluxiqRoot);
        expect(inspectFluxIQStorage({ fluxiqRoot: rolledBack.fluxiqRoot, activeDomainId: DOMAIN_ID }).layout, `rollback after a stop at rename ${failAt}`).toBe("v1");
        expect(await snapshot(rolledBack.fluxiqRoot), `files after a rollback from a stop at rename ${failAt}`).toEqual(original);
        await expect(stat(path.join(rolledBack.fluxiqRoot, "legacy")), `archive left after a rollback from rename ${failAt}`).rejects.toThrow();
      }
      await migrateFluxIQStorage({ fluxiqRoot: rolledBack.fluxiqRoot, activeDomainId: DOMAIN_ID });
      await expectMigrated(rolledBack.fluxiqRoot);
      await Promise.all(roots.splice(0).map(removeWithRetry));
    }
  });

  it("resumes a migration stopped while staging, past the lock its dead process left", async () => {
    const { fluxiqRoot } = await ranLegacyRoot();
    const inspection = inspectFluxIQStorage({ fluxiqRoot, activeDomainId: DOMAIN_ID });
    await writeMigrationJournal(inspection.migrationJournalPath, {
      version: 1, migrationId: "migration.stopped-staging", fromLayout: 1, toLayout: 2, stage: "staging", startedAt: 7, updatedAt: 8, legacyRoots: inspection.legacyRoots
    });
    await writeText(path.join(fluxiqRoot, ".migration", "v2", "staged", "global.sqlite"), "half-written staging");
    await writeFile(path.join(fluxiqRoot, "migration.lock"), JSON.stringify({ pid: exitedProcessId(), host: os.hostname(), startedAt: 7 }), "utf8");
    expect(inspectFluxIQStorage({ fluxiqRoot, activeDomainId: DOMAIN_ID }).layout).toBe("migration_incomplete");

    await migrateFluxIQStorage({ fluxiqRoot, activeDomainId: DOMAIN_ID });

    await expectMigrated(fluxiqRoot);
    await expect(stat(path.join(fluxiqRoot, "legacy", "v1-7", "data"))).resolves.toBeTruthy();
  });

  it("moves nothing when layout v2 state already sits where the cutover would put its own", async () => {
    const { fluxiqRoot } = await ranLegacyRoot();
    await writeFile(path.join(fluxiqRoot, "global.sqlite"), "not this migration's database", "utf8");
    const original = await snapshot(fluxiqRoot);

    await expect(migrateFluxIQStorage({ fluxiqRoot, activeDomainId: DOMAIN_ID })).rejects.toThrow("stopped before moving anything");

    expect(await snapshot(fluxiqRoot)).toEqual(original);
    await expect(stat(path.join(fluxiqRoot, "legacy"))).rejects.toThrow();
    expect(inspectFluxIQStorage({ fluxiqRoot, activeDomainId: DOMAIN_ID }).layout).toBe("migration_incomplete");
    await expect(rollbackFluxIQStorageMigration(fluxiqRoot)).resolves.toMatchObject({ rolledBack: true, restoredRoots: [] });
    expect(await snapshot(fluxiqRoot)).toEqual(original);
    expect(inspectFluxIQStorage({ fluxiqRoot, activeDomainId: DOMAIN_ID }).layout).toBe("v1");
  });
});

async function interrupted(fluxiqRoot: string, failAt: number): Promise<void> {
  interruption.renames = 0;
  interruption.failAt = failAt;
  try {
    await expect(migrateFluxIQStorage({ fluxiqRoot, activeDomainId: DOMAIN_ID })).rejects.toThrow(`interrupted at rename ${failAt}`);
  } finally {
    interruption.failAt = 0;
  }
}

function open(root: string): FluxIQ {
  const instance = FluxIQ.create({ rootDir: root, domainId: "Importer Domain", loadEnv: false });
  instances.push(instance);
  return instance;
}

/**
 * A layout v1 root that a runtime has used: program state as JSON, an
 * Automation Studio project, global and domain databases in both the unscoped
 * and the active domain's scoped tree (sharing a table, as hosts that ran both
 * ways leave them), and the runtime store and a log the
 * runtime wrote outside every legacy root.
 */
async function ranLegacyRoot(): Promise<{ root: string; fluxiqRoot: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-v1-ran-"));
  roots.push(root);
  const fluxiqRoot = path.join(root, ".fluxiq");
  await writeText(path.join(fluxiqRoot, "data", "programs", "deployment-sync", "state.json"), JSON.stringify({ version: 1, data: { targets: [{ id: "target.1" }], artifacts: [], runs: [] } }));
  await writeText(path.join(fluxiqRoot, "data", "programs", "automation-studio", "projects.json"), JSON.stringify({ version: 1, data: {
    categories: [],
    projects: [{ id: "project.legacy", name: "Legacy project", description: "", categoryId: null, createdAt: 1, updatedAt: 1, customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} }]
  } }));
  await new SQLiteRepository({ rootDir: path.join(fluxiqRoot, "databases"), kind: "identity.users" }).put(createRecord({ id: "user:admin", kind: "identity.users", data: { username: "admin" } }));
  await new SQLiteRepository({ rootDir: path.join(fluxiqRoot, DOMAIN_ID, "databases"), kind: "identity.users" }).put(createRecord({ id: "user:scoped", kind: "identity.users", data: { username: "scoped" } }));
  await new SQLiteRepository({ rootDir: path.join(fluxiqRoot, "databases"), kind: "domain.notes" }).put(createRecord({ id: "note:unscoped", kind: "domain.notes", scope: { domainId: "Importer Domain" }, data: { from: "unscoped" } }));
  await new SQLiteRepository({ rootDir: path.join(fluxiqRoot, DOMAIN_ID, "databases"), kind: "domain.notes" }).put(createRecord({ id: "note:scoped", kind: "domain.notes", scope: { domainId: "Importer Domain" }, data: { from: "scoped" } }));
  await writeText(path.join(fluxiqRoot, "artifacts", "runtime", "store.json"), "{\"kept\":true}");
  await writeText(path.join(fluxiqRoot, "logs", "runtime.log"), "a log line\n");
  return { root, fluxiqRoot };
}

async function expectMigrated(fluxiqRoot: string): Promise<void> {
  expect(inspectFluxIQStorage({ fluxiqRoot, activeDomainId: DOMAIN_ID }).layout).toBe("v2");
  const programs = new SQLiteRepository({ rootDir: fluxiqRoot, kind: "program.state", layoutVersion: 2 });
  expect((await programs.get("deployment-sync/state"))?.data).toMatchObject({ targets: [{ id: "target.1" }] });
  const identity = new SQLiteRepository({ rootDir: fluxiqRoot, kind: "identity.users", layoutVersion: 2 });
  expect((await identity.get("user:admin"))?.data).toMatchObject({ username: "admin" });
  expect((await identity.get("user:scoped"))?.data).toMatchObject({ username: "scoped" });
  const notes = new SQLiteRepository({ rootDir: fluxiqRoot, kind: "domain.notes", layoutVersion: 2 });
  expect((await notes.get("note:unscoped", { domainId: "Importer Domain" }))?.data).toMatchObject({ from: "unscoped" });
  expect((await notes.get("note:scoped", { domainId: "Importer Domain" }))?.data).toMatchObject({ from: "scoped" });
  await expect(readFile(path.join(fluxiqRoot, "artifacts", "runtime", "store.json"), "utf8")).resolves.toBe("{\"kept\":true}");
  await expect(readFile(path.join(fluxiqRoot, "logs", "runtime.log"), "utf8")).resolves.toBe("a log line\n");
  expect((await readdir(path.join(fluxiqRoot, "artifacts"))).sort()).toEqual(["automation-studio", "runtime"]);
  const history = JSON.parse(await readFile(path.join(fluxiqRoot, "migration-history.json"), "utf8")) as { migrations: unknown[] };
  expect(history.migrations).toHaveLength(1);
  expect(await readdir(path.join(fluxiqRoot, "legacy"))).toHaveLength(1);
  await expect(stat(path.join(fluxiqRoot, ".migration"))).rejects.toThrow();
  await expect(stat(path.join(fluxiqRoot, "migration.lock"))).rejects.toThrow();
}

/** Every file below the root by relative path and content hash, leaving out the migration's own scratch. */
async function snapshot(directory: string, base = directory): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    const relative = path.relative(base, target).replaceAll("\\", "/");
    if (relative === ".migration") continue;
    if (entry.isDirectory()) Object.assign(files, await snapshot(target, base));
    else files[relative] = createHash("sha256").update(await readFile(target)).digest("hex");
  }
  return files;
}

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function exists(target: string): Promise<boolean> {
  return await stat(target).then(() => true, () => false);
}

/** The id of a process that has already exited, as a lock its crashed holder left names. */
function exitedProcessId(): number {
  return spawnSync(process.execPath, ["--version"]).pid;
}

async function removeWithRetry(root: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 5) throw error;
      await delay(20 * (attempt + 1));
    }
  }
}
