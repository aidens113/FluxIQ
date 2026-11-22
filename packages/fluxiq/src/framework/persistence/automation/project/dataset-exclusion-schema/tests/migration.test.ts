// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";
import { AUTOMATION_STUDIO_PROJECT_RUN_DATASET_EXCLUSIONS_MIGRATION } from "../index.ts";

it("migrates an existing dataset to an explicit unknown exclusion history without adding field IDs or values", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-exclusion-migration-"));
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const lease = await pool.acquire("project");
  try {
    await lease.database.run("create table run_datasets (dataset_id text primary key, schema_json text not null)");
    await lease.database.run("insert into run_datasets values ('legacy', '{\"fields\":[]}')");
    await lease.database.run("create table run_dataset_batches (batch_key text primary key)");
    await lease.database.run("insert into run_dataset_batches values ('legacy')");
    const runner = new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [AUTOMATION_STUDIO_PROJECT_RUN_DATASET_EXCLUSIONS_MIGRATION] });
    await runner.migrate();
    await runner.migrate();
    expect(await lease.database.get("select dataset_id, excluded_field_digests_json, answer_rows_retained from run_datasets")).toEqual({ dataset_id: "legacy", excluded_field_digests_json: null, answer_rows_retained: 0 });
    expect(await lease.database.get("select receipt_digest from run_dataset_batches")).toEqual({ receipt_digest: null });
  } finally {
    await lease.release();
    await pool.closeAll();
    await rm(root, { recursive: true, force: true });
  }
});
