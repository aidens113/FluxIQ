import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";
import { AutomationStudioProjectDatabasePool, type AutomationStudioSqlExecutor } from "../../database.ts";
import { AUTOMATION_STUDIO_PROJECT_ADAPTATION_MATCHING_MIGRATION, AUTOMATION_STUDIO_PROJECT_RUN_DATASET_MIGRATION } from "../index.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-adaptation-matching-migration-test");
const MIGRATION = AUTOMATION_STUDIO_PROJECT_ADAPTATION_MATCHING_MIGRATION;
const PREVIOUS = AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.filter((migration) => migration.id < MIGRATION.id);

type ColumnInfo = { name: string; type: string; notnull: number; dflt_value: unknown };

describe("migration 0020: adaptation matching columns", () => {
  let pool: AutomationStudioProjectDatabasePool;

  beforeEach(async () => { await rm(rootDir, { recursive: true, force: true }); await mkdir(rootDir, { recursive: true }); pool = new AutomationStudioProjectDatabasePool({ rootDir }); });
  afterEach(async () => { await pool.closeAll(); await rm(rootDir, { recursive: true, force: true }); });

  it("is the next migration after 0019", () => {
    expect(MIGRATION.id).toBe("0020_adaptation_matching_columns");
    expect(PREVIOUS.at(-1)?.id).toBe(AUTOMATION_STUDIO_PROJECT_RUN_DATASET_MIGRATION.id);
  });

  it("adds nullable columns and indexes to a database created at the previous schema without rewriting its rows", async () => {
    const lease = await pool.acquire("project.matching-upgrade");
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: PREVIOUS }).migrate();
      await insertLegacyAdaptation(lease.database, "adaptation.legacy");
      const before = await lease.database.get<Record<string, unknown>>("select * from adaptations where adaptation_id = 'adaptation.legacy'");

      await expect(new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [...PREVIOUS, MIGRATION] }).migrate())
        .resolves.toMatchObject({ applied: [MIGRATION.id], status: "ready" });

      const columns = await lease.database.all<ColumnInfo>("pragma table_info(adaptations)");
      const added = columns.filter((column) => ["failure_signature", "confidence_tier", "origin_entry_point"].includes(column.name));
      expect(added.map((column) => ({ name: column.name, type: column.type.toLowerCase(), notnull: column.notnull, dflt_value: column.dflt_value }))).toEqual([
        { name: "failure_signature", type: "text", notnull: 0, dflt_value: null },
        { name: "confidence_tier", type: "text", notnull: 0, dflt_value: null },
        { name: "origin_entry_point", type: "text", notnull: 0, dflt_value: null }
      ]);
      const after = await lease.database.get<Record<string, unknown>>("select * from adaptations where adaptation_id = 'adaptation.legacy'");
      expect(after).toEqual({ ...before, failure_signature: null, confidence_tier: null, origin_entry_point: null });

      const matchingIndex = await lease.database.all<{ name: string }>("pragma index_info(adaptations_flow_failure_signature_idx)");
      expect(matchingIndex.map((column) => column.name)).toEqual(["flow_id", "failure_signature", "updated_at_ms", "adaptation_id"]);
      const unmapped = await lease.database.get<{ sql: string }>("select sql from sqlite_master where type = 'index' and name = 'adaptations_unmapped_matching_idx'");
      expect(unmapped?.sql).toMatch(/where\s+confidence_tier\s+is\s+null/i);
      await expect(lease.database.get("select migration_id from automation_schema_migrations where migration_id = ?", [MIGRATION.id])).resolves.toEqual({ migration_id: MIGRATION.id });

      await expect(new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [...PREVIOUS, MIGRATION] }).migrate())
        .resolves.toMatchObject({ applied: [], status: "ready" });
    } finally {
      await lease.release();
    }
  });

  it("rejects a tier, an entry point, or a failure signature the store never writes", async () => {
    const lease = await pool.acquire("project.matching-checks");
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [...PREVIOUS, MIGRATION] }).migrate();
      await insertLegacyAdaptation(lease.database, "adaptation.checked");
      const update = (column: string, value: unknown) => lease.database.run(`update adaptations set ${column} = ? where adaptation_id = 'adaptation.checked'`, [value]);

      await expect(update("confidence_tier", "high")).rejects.toThrow(/constraint/i);
      await expect(update("origin_entry_point", "editor")).rejects.toThrow(/constraint/i);
      await expect(update("failure_signature", "")).rejects.toThrow(/constraint/i);
      await expect(update("failure_signature", "x".repeat(513))).rejects.toThrow(/constraint/i);

      for (const tier of ["unverified", "provisional", "established"]) await expect(update("confidence_tier", tier)).resolves.toMatchObject({ changes: 1 });
      for (const entryPoint of ["instruction", "run_failure", "edge_case"]) await expect(update("origin_entry_point", entryPoint)).resolves.toMatchObject({ changes: 1 });
      await expect(update("failure_signature", "x".repeat(512))).resolves.toMatchObject({ changes: 1 });
    } finally {
      await lease.release();
    }
  });

  it("rolls back every 0020 statement when one of them fails", async () => {
    const lease = await pool.acquire("project.matching-rollback");
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: PREVIOUS }).migrate();
      const broken = { id: MIGRATION.id, statements: [MIGRATION.statements[0]!, "this is invalid sql"] };
      await expect(new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [...PREVIOUS, broken] }).migrate()).rejects.toThrow();

      const columns = await lease.database.all<ColumnInfo>("pragma table_info(adaptations)");
      expect(columns.some((column) => column.name === "failure_signature")).toBe(false);
      await expect(lease.database.get("select migration_id from automation_schema_migrations where migration_id = ?", [MIGRATION.id])).resolves.toBeUndefined();
    } finally {
      await lease.release();
    }
  });
});

async function insertLegacyAdaptation(sql: AutomationStudioSqlExecutor, adaptationId: string): Promise<void> {
  await sql.run("insert or ignore into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow.legacy', 'Legacy', 'global', 'private', 'user', 'visual', 'draft', 1, 1)");
  await sql.run("insert or ignore into objects (object_id, sha256, media_type, byte_count, relative_path, created_at_ms) values ('object:legacy-patch', 'sha-legacy-patch', 'application/json', 2, 'objects/legacy-patch', 1)");
  await sql.run(
    "insert into adaptations (adaptation_id, flow_id, base_revision, proposed_revision, trigger, status, risk_level, approval_mode, patch_object_id, created_at_ms, updated_at_ms, author, status_detail_json) values (?, 'flow.legacy', 1, 2, 'Legacy trigger.', 'applied', 'low', 'adaptive', 'object:legacy-patch', 1, 2, 'runtime', ?)",
    [adaptationId, JSON.stringify({ canonicalStatus: "applied", validationResults: [{ runId: "run.legacy", status: "succeeded", checkedAt: 2 }], metadata: { failureSignature: "legacy.signature" } })]
  );
}
