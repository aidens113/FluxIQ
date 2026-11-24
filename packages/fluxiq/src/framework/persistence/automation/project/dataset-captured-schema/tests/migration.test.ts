// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";
import { AUTOMATION_STUDIO_PROJECT_RUN_DATASET_CAPTURED_MIGRATION } from "../index.ts";

it("migrates an existing batch to an unknown captured field list, keeping its rows' missing-evidence semantics (t998)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-captured-migration-"));
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const lease = await pool.acquire("project");
  try {
    await lease.database.run("create table run_dataset_batches (batch_key text primary key, receipt_digest text)");
    await lease.database.run("insert into run_dataset_batches values ('legacy', 'sha256:legacy')");
    const runner = new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [AUTOMATION_STUDIO_PROJECT_RUN_DATASET_CAPTURED_MIGRATION] });
    await runner.migrate();
    await runner.migrate();
    expect(await lease.database.get("select batch_key, receipt_digest, captured_fields_json from run_dataset_batches")).toEqual({ batch_key: "legacy", receipt_digest: "sha256:legacy", captured_fields_json: null });
  } finally {
    await lease.release();
    await pool.closeAll();
    await rm(root, { recursive: true, force: true });
  }
});
