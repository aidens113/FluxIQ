// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../project/index.ts";
import { AutomationStudioSchemaMigrationRunner } from "../schema-migrations.ts";

// Its own directory per case: a fixed path under the working directory was
// shared by every run of this file in the checkout, so two runs at once
// deleted and overwrote each other's data.
let rootDir = "";
const initial = [{ id: "0001_initial", statements: ["create table widgets (id text primary key, label text not null)"] }] as const;

describe("AutomationStudioSchemaMigrationRunner", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-migration-test-"));
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("backs up before pending migrations and checksum-skips applied migrations", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await pool.acquire("project.migrate");
    const backups: string[][] = [];
    const runner = new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: initial, backup: async (context) => {
      backups.push(context.pendingMigrationIds);
    } });
    await expect(runner.migrate()).resolves.toEqual({ applied: ["0001_initial"], skipped: [], backupCreated: true, status: "ready" });
    await expect(runner.migrate()).resolves.toEqual({ applied: [], skipped: ["0001_initial"], backupCreated: false, status: "ready" });
    expect(backups).toEqual([["0001_initial"]]);
    await expect(runner.state()).resolves.toMatchObject({ status: "ready", lockToken: null, failureMessage: null });
    await lease.release();
    await pool.closeAll();
  });

  it("serializes concurrent migration callers targeting one project file", async () => {
    const firstPool = new AutomationStudioProjectDatabasePool({ rootDir });
    const secondPool = new AutomationStudioProjectDatabasePool({ rootDir });
    const firstLease = await firstPool.acquire("project.concurrent");
    const secondLease = await secondPool.acquire("project.concurrent");
    expect(firstLease.database).not.toBe(secondLease.database);
    const first = new AutomationStudioSchemaMigrationRunner({
      database: firstLease.database,
      migrations: initial
    });
    const second = new AutomationStudioSchemaMigrationRunner({
      database: secondLease.database,
      migrations: initial
    });

    const results = await Promise.all([first.migrate(), second.migrate()]);

    expect(results.map((result) => result.applied)).toEqual([["0001_initial"], []]);
    expect(results.map((result) => result.skipped)).toEqual([[], ["0001_initial"]]);
    await expect(first.state()).resolves.toMatchObject({
      status: "ready",
      lockToken: null,
      failureMessage: null
    });
    await secondLease.release();
    await firstLease.release();
    await secondPool.closeAll();
    await firstPool.closeAll();
  });

  it("persists checksum mismatch and migration failure states without partial schema ledger writes", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await pool.acquire("project.failure");
    await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: initial }).migrate();
    const changed = new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [{ id: "0001_initial", statements: ["create table changed (id text)"] }] });
    await expect(changed.migrate()).rejects.toThrow(/checksum/);
    await expect(changed.state()).resolves.toMatchObject({ status: "failed", lockToken: null });

    const broken = new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [
      ...initial,
      { id: "0002_broken", statements: ["create table partial_table (id text)", "not valid sql"] }
    ] });
    await expect(broken.migrate()).rejects.toThrow();
    expect(await lease.database.get("select name from sqlite_master where type = 'table' and name = 'partial_table'")).toBeUndefined();
    expect(await lease.database.get("select migration_id from automation_schema_migrations where migration_id = '0002_broken'")).toBeUndefined();
    await expect(broken.state()).resolves.toMatchObject({ status: "failed", lockToken: null });
    await lease.release();
    await pool.closeAll();
  });

  it("refuses an active schema lock and can take over a stale lock", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await pool.acquire("project.lock");
    let now = 100_000;
    const runner = new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: initial, now: () => now, lockTimeoutMs: 1_000, createLockToken: () => "new-lock" });
    await runner.state();
    await lease.database.run("update automation_schema_state set status = 'migrating', lock_token = 'other', lock_acquired_at_ms = ?, updated_at_ms = ? where singleton = 1", [now, now]);
    await expect(runner.migrate()).rejects.toThrow(/already running/);
    now += 2_000;
    await expect(runner.migrate()).resolves.toMatchObject({ applied: ["0001_initial"], status: "ready" });
    await lease.release();
    await pool.closeAll();
  });

  // A first project is opened and migrated while another store opens it to read
  // (Home's "what needs you" listing conversations a few seconds after the first
  // pairing). The reader runs in a second copy of this module, as in a server
  // whose bundle holds Core twice, so this module's per-file queue cannot order
  // the two: only the database does. A reader whose set is already applied must
  // get its tables, not "schema migration lock was lost".
  it("lets a reader whose set is applied open the project while another runner holds the lock migrating it", async () => {
    const opening = new AutomationStudioProjectDatabasePool({ rootDir });
    const reading = new AutomationStudioProjectDatabasePool({ rootDir });
    const opener = await opening.acquire("project.first");
    const reader = await reading.acquire("project.first");
    await new AutomationStudioSchemaMigrationRunner({ database: opener.database, migrations: initial }).migrate();

    let migrating!: () => void;
    let release!: () => void;
    const lockHeld = new Promise<void>((resolve) => {
      migrating = resolve;
    });
    const mayFinish = new Promise<void>((resolve) => {
      release = resolve;
    });
    const opened = new AutomationStudioSchemaMigrationRunner({
      database: opener.database,
      migrations: [...initial, { id: "0002_labels", statements: ["create table labels (id text primary key)"] }],
      createLockToken: () => "opener",
      // Runs once the lock is taken and before anything is applied: the opener is mid-migration until released.
      backup: async () => {
        migrating();
        await mayFinish;
      }
    }).migrate();
    await lockHeld;

    vi.resetModules();
    const { AutomationStudioSchemaMigrationRunner: SecondCopy } = await import("../schema-migrations.ts");
    await expect(new SecondCopy({ database: reader.database, migrations: initial }).migrate())
      .resolves.toEqual({ applied: [], skipped: ["0001_initial"], backupCreated: false, status: "ready" });
    await expect(reader.database.get("select status, lock_token as lockToken from automation_schema_state")).resolves.toEqual({ status: "migrating", lockToken: "opener" });

    release();
    await expect(opened).resolves.toMatchObject({ applied: ["0002_labels"], status: "ready" });
    await expect(reader.database.get("select status, lock_token as lockToken from automation_schema_state")).resolves.toEqual({ status: "ready", lockToken: null });
    await opener.release();
    await reader.release();
    await opening.closeAll();
    await reading.closeAll();
  });
});
