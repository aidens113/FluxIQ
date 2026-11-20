// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";
import { AUTOMATION_STUDIO_PROJECT_RUN_DATASET_EVIDENCE_MIGRATION as EVIDENCE } from "../index.ts";
import { AUTOMATION_STUDIO_PROJECT_DATASET_SNAPSHOT_MIGRATION as SNAPSHOTS } from "../../dataset-occurrence-schema/index.ts";

let rootDir = "";
let pool: AutomationStudioProjectDatabasePool;
beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-batch-evidence-migration-"));
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
});
afterEach(async () => {
  await pool.closeAll();
  await rm(rootDir, { recursive: true, force: true });
});

it.each([false, true])("adds evidence to legacy batches without inventing a page, even with 0037 already installed: %s", async (snapshotInstalled) => {
  const lease = await pool.acquire("project.one");
  try {
    await lease.database.run("create table run_dataset_batches (batch_key text primary key, row_count integer not null)");
    await lease.database.run("insert into run_dataset_batches (batch_key, row_count) values ('older', 0)");
    if (snapshotInstalled) await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [SNAPSHOTS] }).migrate();
    await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [EVIDENCE, SNAPSHOTS] }).migrate();
    expect(await lease.database.get("select batch_key, row_count, evidence_json from run_dataset_batches")).toEqual({ batch_key: "older", row_count: 0, evidence_json: null });
    // Reopening the owner never applies the additive column twice.
    await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [EVIDENCE, SNAPSHOTS] }).migrate();
    const columns = await lease.database.all<{ name: string }>("pragma table_info(run_dataset_batches)");
    expect(columns.map((column) => column.name)).toEqual(["batch_key", "row_count", "evidence_json"]);
  } finally { await lease.release(); }
});
