// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AUTOMATION_STUDIO_PROJECT_RECORDING_STREAM_MIGRATION } from "../index.ts";

const migration = AUTOMATION_STUDIO_PROJECT_RECORDING_STREAM_MIGRATION;
const previous = AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.filter(item => item.id !== migration.id);
describe("recording stream identity migration", () => {
  let root: string;
  let pool: AutomationStudioProjectDatabasePool;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-schema-"));
    pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  });
  afterEach(async () => {
    await pool.closeAll();
    await rm(root, { recursive: true, force: true });
  });
  it("adds derived metadata without changing existing recording rows, and applies once", async () => {
    const lease = await pool.acquire("project.unit");
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: previous }).migrate();
      await lease.database.run("insert into recordings (recording_id, name, status, started_at_ms, updated_at_ms) values ('recording.legacy', 'Unit legacy', 'recording', 1, 1)");
      const before = await lease.database.get("select * from recordings where recording_id = 'recording.legacy'");
      await expect(new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate()).resolves.toMatchObject({ applied: [migration.id], status: "ready" });
      expect(await lease.database.get("select * from recordings where recording_id = 'recording.legacy'")).toEqual(before);
      expect(await lease.database.get("select count(*) as total from recording_stream_heads")).toEqual({ total: 0 });
      expect(await lease.database.get("select count(*) as total from recording_stream_entries")).toEqual({ total: 0 });
      await expect(new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate()).resolves.toMatchObject({ applied: [], status: "ready" });
    } finally { await lease.release(); }
  });
  it("guards identity parents even with foreign-key pragma off and constrains metadata", async () => {
    const lease = await pool.acquire("project.unit");
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
      await lease.database.run("pragma foreign_keys = OFF");
      await expect(lease.database.run("insert into recording_stream_heads (recording_id) values ('recording.missing')")).rejects.toThrow(/references missing/);
      await lease.database.run("insert into recordings (recording_id, name, status, started_at_ms, updated_at_ms) values ('recording.unit', 'Unit', 'recording', 1, 1)");
      await lease.database.run("insert into recording_stream_heads (recording_id) values ('recording.unit')");
      const insert = "insert into recording_stream_entries (recording_id, entry_id, public_sequence, body_digest, action_like, state_like) values (?, 'entry.unit', ?, ?, 0, 0)";
      await expect(lease.database.run(insert, ["recording.missing", 0, "a".repeat(64)])).rejects.toThrow(/references missing/);
      await expect(lease.database.run(insert, ["recording.unit", -1, "a".repeat(64)])).rejects.toThrow(/constraint/i);
      await expect(lease.database.run(insert, ["recording.unit", 0, "invalid"])).rejects.toThrow(/constraint/i);
      await lease.database.run(insert, ["recording.unit", 0, "a".repeat(64)]);
      await lease.database.run("delete from recordings where recording_id = 'recording.unit'");
      expect(await lease.database.get("select count(*) as total from recording_stream_heads")).toEqual({ total: 0 });
      expect(await lease.database.get("select count(*) as total from recording_stream_entries")).toEqual({ total: 0 });
    } finally { await lease.release(); }
  });
});
