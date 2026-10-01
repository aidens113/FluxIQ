import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool, type AutomationStudioProjectDatabase } from "../project/index.ts";
import { AutomationStudioSchemaMigrationRunner, type AutomationStudioSchemaMigration } from "../schema-migrations.ts";

// The runner remembers, per open connection, a migration set it has already
// checked. These cases pin when that memo is used and when the full check runs.
let rootDir = "";
const initial: readonly AutomationStudioSchemaMigration[] = [{ id: "0001_initial", statements: ["create table if not exists widgets (id text primary key)"] }];
const extended: readonly AutomationStudioSchemaMigration[] = [...initial, { id: "0002_labels", statements: ["create table if not exists labels (id text primary key)"] }];

const migrate = (database: AutomationStudioProjectDatabase, migrations = initial) => new AutomationStudioSchemaMigrationRunner({ database, migrations }).migrate();
// A ledger edit is data, not schema: it moves no cookie, so only a full check notices it.
const forgetLedger = (database: AutomationStudioProjectDatabase) => database.run("delete from automation_schema_migrations where migration_id = '0001_initial'");

describe("AutomationStudioSchemaMigrationRunner ready memo", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-migration-memo-test-"));
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("skips the full check on a connection that already checked the set, and runs it on a new connection", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await pool.acquire("project.memo");
    await migrate(lease.database);
    await expect(migrate(lease.database)).resolves.toEqual({ applied: [], skipped: ["0001_initial"], backupCreated: false, status: "ready" });
    await forgetLedger(lease.database);
    // Same connection: the memo answers, so the edited ledger goes unread.
    await expect(migrate(lease.database)).resolves.toMatchObject({ applied: [] });
    await lease.release();

    // The last release closed the connection; the next one checks in full.
    const reopened = await pool.acquire("project.memo");
    expect(reopened.database).not.toBe(lease.database);
    await expect(migrate(reopened.database)).resolves.toMatchObject({ applied: ["0001_initial"] });
    await reopened.release();
    await pool.closeAll();
  });

  it("checks again after another connection changes the schema", async () => {
    const mine = new AutomationStudioProjectDatabasePool({ rootDir });
    const theirs = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await mine.acquire("project.other-writer");
    const other = await theirs.acquire("project.other-writer");
    await migrate(lease.database);
    await forgetLedger(lease.database);
    await migrate(other.database, extended);
    // The other connection's DDL moved the schema cookie, so this one re-reads the ledger.
    await expect(migrate(lease.database)).resolves.toMatchObject({ applied: [], skipped: ["0001_initial"] });
    await expect(lease.database.get("select migration_id from automation_schema_migrations where migration_id = '0001_initial'")).resolves.toEqual({ migration_id: "0001_initial" });
    await lease.release(); await other.release();
    await mine.closeAll(); await theirs.closeAll();
  });

  it("still refuses while another connection holds the migration lock", async () => {
    const mine = new AutomationStudioProjectDatabasePool({ rootDir });
    const theirs = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await mine.acquire("project.locked");
    const other = await theirs.acquire("project.locked");
    await migrate(lease.database);
    const now = Date.now();
    await other.database.run("update automation_schema_state set status = 'migrating', lock_token = 'other', lock_acquired_at_ms = ?, updated_at_ms = ? where singleton = 1", [now, now]);
    await expect(migrate(lease.database)).rejects.toThrow(/lock was lost/);
    await other.database.run("update automation_schema_state set status = 'ready', lock_token = null, lock_acquired_at_ms = null where singleton = 1");
    await expect(migrate(lease.database)).resolves.toMatchObject({ applied: [], status: "ready" });
    await lease.release(); await other.release();
    await mine.closeAll(); await theirs.closeAll();
  });

  it("checks again after this connection applies another set, and keeps sets apart", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await pool.acquire("project.sets");
    await migrate(lease.database);
    await forgetLedger(lease.database);
    // A set never checked on this connection runs in full and re-applies the forgotten entry.
    await expect(migrate(lease.database, extended)).resolves.toMatchObject({ applied: ["0001_initial", "0002_labels"] });
    await forgetLedger(lease.database);
    // Its DDL moved the cookie, so the first set's memo is no longer trusted.
    await expect(migrate(lease.database)).resolves.toMatchObject({ applied: ["0001_initial"] });
    await lease.release();
    await pool.closeAll();
  });
});
