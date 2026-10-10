import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AUTOMATION_STUDIO_PROJECT_RUNTIME_RUN_INTERRUPTED_STATUS_MIGRATION } from "../index.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";

// Migration 0024_runtime_run_interrupted_status rebuilds `runtime_runs` so its status may be `interrupted`.
// What must hold on a database that already has runs: every row and column is
// kept, the indexes and the guards on the table come back, and the guards other
// tables hold against it still work.

let rootDir = "";
const MIGRATION = AUTOMATION_STUDIO_PROJECT_RUNTIME_RUN_INTERRUPTED_STATUS_MIGRATION;
const PREVIOUS = AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.filter((migration) => migration.id !== MIGRATION.id);

const RUN_COLUMNS = "run_id, flow_id, flow_revision, status, trigger_kind, queued_at_ms, started_at_ms, finished_at_ms, action_count, effect_count, error_count, adaptation_count, last_event_sequence, error_object_id, updated_at_ms, summary_json, result_verification_status, result_check_epoch";

describe("migration 0024_runtime_run_interrupted_status: a run may be stored interrupted", () => {
  let pool: AutomationStudioProjectDatabasePool;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-runtime-run-interrupted-migration-test-"));
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
  });
  afterEach(async () => {
    await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("is the last of the project migrations", () => {
    expect(MIGRATION.id).toBe("0024_runtime_run_interrupted_status");
    expect(AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.at(-1)).toBe(MIGRATION);
  });

  it("keeps every run of an existing database, its indexes and guards, and accepts `interrupted`", async () => {
    const lease = await pool.acquire("project.interrupted-upgrade");
    try {
      const sql = lease.database;
      await new AutomationStudioSchemaMigrationRunner({ database: sql, migrations: PREVIOUS }).migrate();
      await expect(sql.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow.1', 'One', 'project', 'project', 'user', 'visual', 'draft', 1, 1)")).resolves.toBeDefined();
      await sql.run(`insert into runtime_runs (${RUN_COLUMNS}) values ('run.ended', 'flow.1', 3, 'failed', 'schedule', 10, 11, 12, 4, 2, 1, 1, 9, null, 13, '{"runId":"run.ended"}', 'confirmed', 2)`);
      await sql.run(`insert into runtime_runs (run_id, flow_id, flow_revision, status, trigger_kind, queued_at_ms, updated_at_ms) values ('run.queued', 'flow.1', 1, 'queued', 'manual', 20, 20)`);
      await expect(sql.run("update runtime_runs set status = 'interrupted' where run_id = 'run.queued'")).rejects.toThrow(/constraint/i);
      const before = await sql.all<Record<string, unknown>>(`select ${RUN_COLUMNS} from runtime_runs order by run_id`);
      const indexes = async () => (await sql.all<{ name: string; sql: string | null }>("select name, sql from sqlite_master where type = 'index' and tbl_name = 'runtime_runs' order by name")).map((row) => ({ name: row.name, sql: row.sql?.trim() ?? null }));
      const indexesBefore = await indexes();
      const triggersBefore = await sql.all<{ name: string }>("select name from sqlite_master where type = 'trigger' and (tbl_name = 'runtime_runs' or sql like '%runtime_runs%') order by name");

      await expect(new AutomationStudioSchemaMigrationRunner({ database: sql, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate())
        .resolves.toMatchObject({ applied: [MIGRATION.id], status: "ready" });

      await expect(sql.all(`select ${RUN_COLUMNS} from runtime_runs order by run_id`)).resolves.toEqual(before);
      await expect(indexes()).resolves.toEqual(indexesBefore);
      await expect(sql.all("select name from sqlite_master where type = 'trigger' and (tbl_name = 'runtime_runs' or sql like '%runtime_runs%') order by name")).resolves.toEqual(triggersBefore);
      await expect(sql.get("select count(*) as total from sqlite_master where name = 'runtime_runs_interrupted_copy'")).resolves.toEqual({ total: 0 });

      await sql.run("update runtime_runs set status = 'interrupted' where run_id = 'run.queued'");
      await expect(sql.get("select status from runtime_runs where run_id = 'run.queued'")).resolves.toEqual({ status: "interrupted" });
      await expect(sql.run("update runtime_runs set status = 'lost' where run_id = 'run.queued'")).rejects.toThrow(/constraint/i);
      // The table's own guard, and a guard another table holds against it.
      await expect(sql.run("insert into runtime_runs (run_id, flow_id, flow_revision, status, trigger_kind, queued_at_ms, updated_at_ms) values ('run.orphan', 'flow.missing', 1, 'queued', 'manual', 1, 1)")).rejects.toThrow(/missing flows/);
      await sql.run("insert into objects (object_id, sha256, media_type, byte_count, relative_path, created_at_ms) values ('object.1', 'sha', 'application/json', 1, 'objects/one', 1)");
      await expect(sql.run("insert into runtime_event_chunks (chunk_id, run_id, first_sequence, last_sequence, event_count, byte_count, object_id, sha256, closed, created_at_ms) values ('chunk.1', 'run.missing', 1, 1, 1, 1, 'object.1', 'sha', 1, 1)")).rejects.toThrow(/missing runtime_runs/);
    } finally {
      await lease.release();
    }
  });
});
