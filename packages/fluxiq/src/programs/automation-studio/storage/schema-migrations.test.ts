import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioSchemaMigrationRunner } from "./schema-migrations.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-migration-test");
const initial = [{ id: "0001_initial", statements: ["create table widgets (id text primary key, label text not null)"] }] as const;

describe("AutomationStudioSchemaMigrationRunner", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
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
});
