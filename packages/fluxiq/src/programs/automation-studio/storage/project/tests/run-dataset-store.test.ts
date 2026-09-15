import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, type AutomationStudioRecordSchema, type AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AutomationStudioProjectAdministration } from "../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../database.ts";
import { AutomationStudioProjectRunDatasetStore, runDatasetSummariesForRun, type AutomationStudioRunDatasetBatch, type AutomationStudioRunDatasetRow } from "../run-dataset-store.ts";
import { AutomationStudioProjectRuntimeStreamStore } from "../runtime-stream-store.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../schema-migrations.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-run-dataset-store-test");
const PROJECT = "project.datasets";
const MAX_ROWS = AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRowsPerDatasetPerRun;
const CURSOR_MISMATCH = "Paging cursor does not match this query.";

const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "title", label: "Title", valueType: "string", required: true },
    { id: "price", label: "Price", valueType: "number" }
  ]
};
const OTHER_SCHEMA: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }] };

type RunSeed = { runId: string; flowId: string; status?: string; startedAt?: number };
type Fixture = { pool: AutomationStudioProjectDatabasePool; store: AutomationStudioProjectRunDatasetStore };
type BatchCounts = { batch_key: string; attempt_id: string; row_count: number; invalid_count: number; truncated: number };

let fixture: Fixture | undefined;

describe("AutomationStudioProjectRunDatasetStore", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });

  afterEach(async () => {
    if (fixture) {
      await fixture.store.close();
      await fixture.pool.closeAll();
      fixture = undefined;
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  it("installs migration 0019's batch table, indexes, and run_id guard, and migrates a database created before it", async () => {
    const { pool } = await openFixture([]);
    const indexes = await query<{ name: string }>(pool, "select name from sqlite_master where type = 'index' and name like 'run_dataset%' order by name");
    expect(indexes.map((row) => row.name)).toEqual(["run_dataset_audit_events_run_idx", "run_dataset_catalog_updated_idx", "run_dataset_rows_batch_idx", "run_datasets_flow_dataset_idx", "run_datasets_run_idx"]);
    const triggers = await query<{ name: string }>(pool, "select name from sqlite_master where type = 'trigger' and tbl_name = 'run_datasets' order by name");
    expect(triggers.map((row) => row.name)).toEqual(["fk_run_datasets_run_id_insert", "fk_run_datasets_run_id_update"]);
    const batchColumns = await query<{ name: string }>(pool, "pragma table_info(run_dataset_batches)");
    expect(batchColumns.map((column) => column.name)).toEqual(["run_id", "dataset_id", "batch_key", "attempt_id", "node_id", "row_count", "invalid_count", "truncated", "created_at_ms", "updated_at_ms"]);
    const rowColumns = await query<{ name: string }>(pool, "pragma table_info(run_dataset_rows)");
    expect(rowColumns.map((column) => column.name)).toEqual(["run_id", "dataset_id", "ordinal", "attempt_id", "batch_key", "row_json"]);

    const legacyPool = new AutomationStudioProjectDatabasePool({ rootDir: path.join(rootDir, "legacy") });
    const lease = await legacyPool.acquire("project.legacy");
    await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.filter((migration) => migration.id !== "0019_run_datasets") }).migrate();
    await expect(lease.database.get("select name from sqlite_master where name = 'run_datasets'")).resolves.toBeUndefined();
    const legacyStore = await AutomationStudioProjectRunDatasetStore.open({ pool: legacyPool, projectId: "project.legacy" });
    await expect(lease.database.get("select migration_id from automation_schema_migrations where migration_id = '0019_run_datasets'")).resolves.toEqual({ migration_id: "0019_run_datasets" });
    await expect(legacyStore.listDatasets("run.none")).resolves.toEqual([]);
    await lease.release();
    await legacyStore.close();
    await legacyPool.closeAll();
  });

  it("assigns ordinals 1..N on the first append and continues from N+1", async () => {
    const { pool, store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    const first = await store.appendBatch(batch({ label: "Listings", rows: items(3) }));
    expect(first).toEqual({ runId: "run.a", datasetId: "listings", label: "Listings", nodeIds: ["node.extract"], schemaDigest: "sha256:schema-a", recordCount: 3, truncated: false, invalidCount: 0, updatedAt: 1_000 });
    const second = await store.appendBatch(batch({ attemptId: "attempt.2", nodeId: "node.loop", rows: items(2, "more"), invalidCount: 1, now: 2_000 }));
    expect(second).toEqual({ runId: "run.a", datasetId: "listings", label: "Listings", nodeIds: ["node.extract", "node.loop"], schemaDigest: "sha256:schema-a", recordCount: 5, truncated: false, invalidCount: 1, updatedAt: 2_000 });
    expect(await storedOrdinals(pool, "run.a", "listings")).toEqual([1, 2, 3, 4, 5]);
    await expect(store.readRows({ runId: "run.a", datasetId: "listings", afterOrdinal: 3 })).resolves.toEqual({ rows: [{ title: "more 1", price: 1 }, { title: "more 2", price: 2 }], lastOrdinal: 5, hasMore: false });
    await expect(store.listDatasets("run.a")).resolves.toEqual([second]);
  });

  it("stores the schema without exclude fields", async () => {
    const { store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [...SCHEMA.fields, { id: "session", label: "Session", valueType: "string", handling: "exclude" }] };
    await store.appendBatch(batch({ schema, rows: items(1) }));
    const page = await store.getPage({ runId: "run.a", datasetId: "listings" });
    expect(page?.schema).toEqual(SCHEMA);
    await expect(store.appendBatch(batch({ schema, attemptId: "attempt.2", rows: [{ title: "t", session: "s" }] }))).rejects.toThrow("Run dataset row holds a key that is not in the stored schema.");
  });

  it("replace deletes the dataset's rows and batches and restarts ordinals at 1", async () => {
    const { pool, store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    await store.appendBatch(batch({ rows: items(3), invalidCount: 2, truncated: true }));
    const replaced = await store.appendBatch(batch({ writeMode: "replace", attemptId: "attempt.2", rows: items(2, "fresh"), now: 2_000 }));
    expect(replaced).toMatchObject({ recordCount: 2, invalidCount: 0, truncated: false });
    expect(await storedOrdinals(pool, "run.a", "listings")).toEqual([1, 2]);
    await expect(store.readRows({ runId: "run.a", datasetId: "listings" })).resolves.toEqual({ rows: [{ title: "fresh 1", price: 1 }, { title: "fresh 2", price: 2 }], lastOrdinal: 2, hasMore: false });
    expect(await batchCounts(pool, "run.a", "listings")).toEqual([{ batch_key: "attempt.2", attempt_id: "attempt.2", row_count: 2, invalid_count: 0, truncated: 0 }]);
  });

  it("replaces an earlier batch with the same batch key, subtracting its rows and invalid count exactly once", async () => {
    const { pool, store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    await store.appendBatch(batch({ attemptId: "attempt.1", rows: items(3), invalidCount: 2 }));
    await store.appendBatch(batch({ attemptId: "attempt.2", rows: items(2, "second"), invalidCount: 5 }));
    const retried = await store.appendBatch(batch({ attemptId: "attempt.2", rows: items(1, "retry"), invalidCount: 1 }));
    expect(retried).toMatchObject({ recordCount: 4, invalidCount: 3 });
    expect(await storedOrdinals(pool, "run.a", "listings")).toEqual([1, 2, 3, 4]);
    expect((await store.readRows({ runId: "run.a", datasetId: "listings" })).rows.map((row) => row.title)).toEqual(["item 1", "item 2", "item 3", "retry 1"]);
    await expectSummaryMatchesBatches(pool, retried, [
      { batch_key: "attempt.1", attempt_id: "attempt.1", row_count: 3, invalid_count: 2, truncated: 0 },
      { batch_key: "attempt.2", attempt_id: "attempt.2", row_count: 1, invalid_count: 1, truncated: 0 }
    ]);

    // A batch whose rows were all invalid is replaced the same way: its invalid count leaves with it.
    await store.appendBatch(batch({ attemptId: "attempt.3", rows: [], invalidCount: 7 }));
    const cleared = await store.appendBatch(batch({ attemptId: "attempt.3", rows: items(1, "valid"), invalidCount: 0, now: 2_000 }));
    expect(cleared).toMatchObject({ recordCount: 5, invalidCount: 3 });
    await expectSummaryMatchesBatches(pool, cleared, [
      { batch_key: "attempt.1", attempt_id: "attempt.1", row_count: 3, invalid_count: 2, truncated: 0 },
      { batch_key: "attempt.2", attempt_id: "attempt.2", row_count: 1, invalid_count: 1, truncated: 0 },
      { batch_key: "attempt.3", attempt_id: "attempt.3", row_count: 1, invalid_count: 0, truncated: 0 }
    ]);
    expect((await store.listProjectDatasets()).datasets).toEqual([{ flowId: "flow.a", datasetId: "listings", latestRunId: "run.a", latestUpdatedAt: 2_000, runCount: 1, latestRecordCount: 5, latestTruncated: false, schemaDigest: "sha256:schema-a" }]);
  });

  it("keeps batches whose attempt ids are equal but whose batch keys differ", async () => {
    const { pool, store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    await store.appendBatch(batch({ attemptId: "extract.attempt.1", batchKey: "extract.attempt.1", rows: items(2, "parent"), invalidCount: 1 }));
    const child = await store.appendBatch(batch({ attemptId: "extract.attempt.1", batchKey: "call.attempt.2/inner%2Fnode.attempt.1/extract.attempt.1", rows: items(3, "child"), invalidCount: 2 }));
    expect(child).toMatchObject({ recordCount: 5, invalidCount: 3 });
    expect((await store.readRows({ runId: "run.a", datasetId: "listings" })).rows.map((row) => row.title)).toEqual(["parent 1", "parent 2", "child 1", "child 2", "child 3"]);
    await expectSummaryMatchesBatches(pool, child, [
      { batch_key: "call.attempt.2/inner%2Fnode.attempt.1/extract.attempt.1", attempt_id: "extract.attempt.1", row_count: 3, invalid_count: 2, truncated: 0 },
      { batch_key: "extract.attempt.1", attempt_id: "extract.attempt.1", row_count: 2, invalid_count: 1, truncated: 0 }
    ]);
    await expect(query(pool, "select distinct attempt_id from run_dataset_rows")).resolves.toEqual([{ attempt_id: "extract.attempt.1" }]);
    expect((await store.listProjectDatasets()).datasets[0]).toMatchObject({ runCount: 1, latestRecordCount: 5 });

    // Retrying the child replaces only the child's batch.
    const retriedChild = await store.appendBatch(batch({ attemptId: "extract.attempt.1", batchKey: "call.attempt.2/inner%2Fnode.attempt.1/extract.attempt.1", rows: items(1, "child retry"), invalidCount: 0 }));
    expect(retriedChild).toMatchObject({ recordCount: 3, invalidCount: 1 });
    expect((await store.readRows({ runId: "run.a", datasetId: "listings" })).rows.map((row) => row.title)).toEqual(["parent 1", "parent 2", "child retry 1"]);

    // Node ids carry no character restriction, so neither do the ids and keys built from them; control characters are refused.
    await expect(store.appendBatch(batch({ datasetId: "odd", nodeId: "node with spaces/and slash", attemptId: "node with spaces/and slash.attempt.1", batchKey: "node with spaces%2Fand slash.attempt.1" }))).resolves.toMatchObject({ nodeIds: ["node with spaces/and slash"] });
    await expect(store.appendBatch(batch({ datasetId: "odd", batchKey: "" }))).rejects.toThrow("Invalid run dataset batch key.");
    await expect(store.appendBatch(batch({ datasetId: "odd", batchKey: "a\nb" }))).rejects.toThrow("Invalid run dataset batch key.");
  });

  it("clears the dataset's truncated flag only when no remaining batch is truncated", async () => {
    const { store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    await store.appendBatch(batch({ attemptId: "attempt.1", truncated: true }));
    await store.appendBatch(batch({ attemptId: "attempt.2", truncated: true }));
    await store.appendBatch(batch({ attemptId: "attempt.3" }));
    await expect(store.appendBatch(batch({ attemptId: "attempt.1", truncated: false }))).resolves.toMatchObject({ truncated: true });
    await expect(store.appendBatch(batch({ attemptId: "attempt.2", truncated: false }))).resolves.toMatchObject({ truncated: false, recordCount: 9 });
    expect((await store.listProjectDatasets()).datasets[0]).toMatchObject({ latestTruncated: false, latestRecordCount: 9 });
  });

  it("refuses a schema digest that changes within one run and writes nothing", async () => {
    const { pool, store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    await store.appendBatch(batch({ rows: items(3) }));
    // Rows that fit OTHER_SCHEMA, so the refusal comes from the digest check and not the row-key check.
    await expect(store.appendBatch(batch({ attemptId: "attempt.2", schema: OTHER_SCHEMA, schemaDigest: "sha256:schema-b", rows: [{ title: "b" }] }))).rejects.toThrow("Run dataset schema changed within one run.");
    await expect(store.appendBatch(batch({ attemptId: "attempt.3", writeMode: "replace", schema: OTHER_SCHEMA, schemaDigest: "sha256:schema-b", rows: [{ title: "c" }] }))).rejects.toThrow("Run dataset schema changed within one run.");
    expect(await storedOrdinals(pool, "run.a", "listings")).toEqual([1, 2, 3]);
  });

  it("refuses a row with a key outside the stored schema, or over the row size, and writes nothing", async () => {
    const { pool, store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    await expect(store.appendBatch(batch({ rows: [{ title: "ok" }, { title: "bad", secret: "x" }] }))).rejects.toThrow("Run dataset row holds a key that is not in the stored schema.");
    await expect(store.appendBatch(batch({ rows: [{ title: "x".repeat(AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.rowMaxBytes) }] }))).rejects.toThrow("Run dataset row exceeds the row size limit.");
    expect(await storedOrdinals(pool, "run.a", "listings")).toEqual([]);
    await expect(store.listDatasets("run.a")).resolves.toEqual([]);
    await expect(store.listProjectDatasets()).resolves.toEqual({ datasets: [], nextCursor: null });
  });

  it("stops at the per-run dataset cap and marks the dataset truncated", async () => {
    const { pool, store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    // Seed the stored count near the cap instead of writing 100,000 rows.
    await store.appendBatch(batch({ datasetId: "exact", rows: items(1) }));
    await setRecordCount(pool, "run.a", "exact", MAX_ROWS - 4);
    await expect(store.appendBatch(batch({ datasetId: "exact", attemptId: "attempt.2", rows: items(4, "fit") }))).resolves.toMatchObject({ recordCount: MAX_ROWS, truncated: false });
    await expect(store.appendBatch(batch({ datasetId: "exact", attemptId: "attempt.3", rows: items(1, "over") }))).resolves.toMatchObject({ recordCount: MAX_ROWS, truncated: true });
    expect(await storedOrdinals(pool, "run.a", "exact")).toEqual([1, 2, 3, 4, 5]);

    await store.appendBatch(batch({ datasetId: "partial", rows: items(1) }));
    await setRecordCount(pool, "run.a", "partial", MAX_ROWS - 2);
    await expect(store.appendBatch(batch({ datasetId: "partial", attemptId: "attempt.2", rows: items(5, "part") }))).resolves.toMatchObject({ recordCount: MAX_ROWS, truncated: true });
    expect(await storedOrdinals(pool, "run.a", "partial")).toEqual([1, 2, 3]);
  });

  it("pages rows by ordinal with a clamped limit and a cursor bound to its run and dataset", async () => {
    const { store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }, { runId: "run.b", flowId: "flow.a" }]);
    await store.appendBatch(batch({ rows: items(250) }));
    await store.appendBatch(batch({ datasetId: "prices", rows: items(1) }));
    await store.appendBatch(batch({ runId: "run.b", rows: items(1) }));

    const first = await store.getPage({ runId: "run.a", datasetId: "listings", limit: 999 });
    expect(first?.rows).toHaveLength(200);
    expect(first?.rows[0]).toEqual({ title: "item 1", price: 1 });
    expect(first?.schema).toEqual(SCHEMA);
    expect(first?.summary).toMatchObject({ runId: "run.a", datasetId: "listings", recordCount: 250 });
    expect(first?.nextCursor).toEqual(expect.any(String));
    const second = await store.getPage({ runId: "run.a", datasetId: "listings", limit: 999, cursor: first!.nextCursor });
    expect(second?.rows).toHaveLength(50);
    expect(second?.rows[0]).toEqual({ title: "item 201", price: 201 });
    expect(second?.nextCursor).toBeNull();
    const defaultPage = await store.getPage({ runId: "run.a", datasetId: "listings" });
    expect(defaultPage?.rows).toHaveLength(50);

    await expect(store.getPage({ runId: "run.a", datasetId: "prices", cursor: first!.nextCursor })).rejects.toThrow(CURSOR_MISMATCH);
    await expect(store.getPage({ runId: "run.b", datasetId: "listings", cursor: first!.nextCursor })).rejects.toThrow(CURSOR_MISMATCH);
    await expect(store.getPage({ runId: "run.a", datasetId: "missing" })).resolves.toBeNull();
  });

  it("reads at most 500 rows at a time for streaming", async () => {
    const { store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    await store.appendBatch(batch({ rows: items(600) }));
    const first = await store.readRows({ runId: "run.a", datasetId: "listings", limit: 999 });
    expect(first).toMatchObject({ lastOrdinal: 500, hasMore: true });
    expect(first.rows).toHaveLength(500);
    const rest = await store.readRows({ runId: "run.a", datasetId: "listings", afterOrdinal: first.lastOrdinal, limit: 999 });
    expect(rest).toMatchObject({ lastOrdinal: 600, hasMore: false });
    expect(rest.rows[0]).toEqual({ title: "item 501", price: 501 });
  });

  it("records typed audit events and lists them by run and dataset", async () => {
    const { store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    const exported = await store.appendAuditEvent({ eventType: "exported", runId: "run.a", datasetId: "listings", actorId: "user.1", format: "csv", rowCount: 3, byteCount: 120, now: 5 });
    expect(exported).toEqual({ eventId: expect.stringMatching(/^run-dataset-audit:/), eventType: "exported", runId: "run.a", datasetId: "listings", actorId: "user.1", format: "csv", rowCount: 3, byteCount: 120, createdAt: 5 });
    const failed = await store.appendAuditEvent({ eventType: "export_failed", runId: "run.a", datasetId: "prices", now: 6 });
    await expect(store.listAuditEvents({ runId: "run.a" })).resolves.toEqual([exported, failed]);
    await expect(store.listAuditEvents({ runId: "run.a", datasetId: "prices" })).resolves.toEqual([{ eventId: failed.eventId, eventType: "export_failed", runId: "run.a", datasetId: "prices", rowCount: 0, byteCount: 0, createdAt: 6 }]);
    await expect(store.appendAuditEvent({ eventType: "revealed" as never, runId: "run.a" })).rejects.toThrow("Invalid run dataset audit event type.");
    await expect(store.appendAuditEvent({ eventType: "exported", runId: "run.a", format: "xml" as never })).rejects.toThrow("Invalid run dataset export format.");
  });

  it("deletes a run's datasets, rows, and batches, keeps audit events, and writes a deleted event per dataset", async () => {
    const { pool, store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    await store.appendBatch(batch({ rows: items(3) }));
    await store.appendBatch(batch({ datasetId: "prices", rows: items(2) }));
    const exported = await store.appendAuditEvent({ eventType: "exported", runId: "run.a", datasetId: "listings", format: "json", rowCount: 3, now: 5 });

    await expect(store.deleteRunDatasets("run.a", { actorId: "user.1", now: 9 })).resolves.toEqual({ datasetCount: 2, rowCount: 5 });
    await expect(store.listDatasets("run.a")).resolves.toEqual([]);
    await expect(query(pool, "select * from run_dataset_rows")).resolves.toEqual([]);
    await expect(query(pool, "select * from run_dataset_batches")).resolves.toEqual([]);
    const events = await store.listAuditEvents({ runId: "run.a" });
    expect(events[0]).toEqual(exported);
    // Both deletions share a timestamp, so their relative order follows random event ids; compare by dataset.
    const deletions = events.slice(1).map(({ eventType, datasetId, actorId, rowCount, createdAt }) => ({ eventType, datasetId, actorId, rowCount, createdAt }));
    expect(deletions.sort((left, right) => String(left.datasetId).localeCompare(String(right.datasetId)))).toEqual([
      { eventType: "deleted", datasetId: "listings", actorId: "user.1", rowCount: 3, createdAt: 9 },
      { eventType: "deleted", datasetId: "prices", actorId: "user.1", rowCount: 2, createdAt: 9 }
    ]);
    await expect(store.listProjectDatasets()).resolves.toEqual({ datasets: [], nextCursor: null });
  });

  it("rejects a batch for a run id with no runtime run through the foreign-key guard", async () => {
    const { pool, store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    await expect(store.appendBatch(batch({ runId: "run.unknown" }))).rejects.toThrow("run_datasets.run_id references missing runtime_runs.run_id");
    await expect(query(pool, "select * from run_datasets")).resolves.toEqual([]);
    await expect(query(pool, "select * from run_dataset_rows")).resolves.toEqual([]);
    await expect(query(pool, "select * from run_dataset_batches")).resolves.toEqual([]);
  });

  it("creates a catalog entry on the first append, with flow_id taken from the run", async () => {
    const { pool, store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    await store.appendBatch(batch({ label: "Listings", rows: items(3) }));
    await expect(query(pool, "select flow_id from run_datasets where run_id = 'run.a' and dataset_id = 'listings'")).resolves.toEqual([{ flow_id: "flow.a" }]);
    await expect(store.listProjectDatasets()).resolves.toEqual({
      datasets: [{ flowId: "flow.a", datasetId: "listings", label: "Listings", latestRunId: "run.a", latestUpdatedAt: 1_000, runCount: 1, latestRecordCount: 3, latestTruncated: false, schemaDigest: "sha256:schema-a" }],
      nextCursor: null
    });
  });

  it("counts each run once and follows the most recently written run", async () => {
    const { store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }, { runId: "run.b", flowId: "flow.a" }]);
    await store.appendBatch(batch({ runId: "run.a", rows: items(3), now: 1_000 }));
    await store.appendBatch(batch({ runId: "run.a", attemptId: "attempt.2", rows: items(1), now: 1_500 }));
    expect((await store.listProjectDatasets()).datasets).toEqual([{ flowId: "flow.a", datasetId: "listings", latestRunId: "run.a", latestUpdatedAt: 1_500, runCount: 1, latestRecordCount: 4, latestTruncated: false, schemaDigest: "sha256:schema-a" }]);

    await store.appendBatch(batch({ runId: "run.b", label: "Newer", schema: OTHER_SCHEMA, schemaDigest: "sha256:schema-b", rows: [{ title: "b" }, { title: "c" }], truncated: true, now: 2_000 }));
    expect((await store.listProjectDatasets()).datasets).toEqual([{ flowId: "flow.a", datasetId: "listings", label: "Newer", latestRunId: "run.b", latestUpdatedAt: 2_000, runCount: 2, latestRecordCount: 2, latestTruncated: true, schemaDigest: "sha256:schema-b" }]);

    await store.appendBatch(batch({ runId: "run.a", attemptId: "attempt.3", rows: items(1), now: 1_800 }));
    expect((await store.listProjectDatasets()).datasets[0]).toMatchObject({ latestRunId: "run.b", latestUpdatedAt: 2_000, runCount: 2, latestRecordCount: 2 });

    await store.appendBatch(batch({ runId: "run.a", attemptId: "attempt.4", rows: items(1), now: 3_000 }));
    const latest = (await store.listProjectDatasets()).datasets[0];
    expect(latest).toEqual({ flowId: "flow.a", datasetId: "listings", latestRunId: "run.a", latestUpdatedAt: 3_000, runCount: 2, latestRecordCount: 6, latestTruncated: false, schemaDigest: "sha256:schema-a" });
  });

  it("lists project tables newest first, filtered by Flow and search, with a cursor bound to the filter", async () => {
    const { store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }, { runId: "run.b", flowId: "flow.b" }]);
    await store.appendBatch(batch({ runId: "run.a", datasetId: "listings", label: "Home listings", now: 1_000 }));
    await store.appendBatch(batch({ runId: "run.a", datasetId: "prices", label: "Price history", now: 2_000 }));
    await store.appendBatch(batch({ runId: "run.b", datasetId: "listings", label: "Car listings", now: 3_000 }));
    const keys = (page: { datasets: Array<{ flowId: string; datasetId: string }> }) => page.datasets.map((dataset) => `${dataset.flowId}/${dataset.datasetId}`);

    const first = await store.listProjectDatasets({ limit: 2 });
    expect(keys(first)).toEqual(["flow.b/listings", "flow.a/prices"]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await store.listProjectDatasets({ limit: 2, cursor: first.nextCursor });
    expect(keys(second)).toEqual(["flow.a/listings"]);
    expect(second.nextCursor).toBeNull();

    expect(keys(await store.listProjectDatasets({ flowId: "flow.a" }))).toEqual(["flow.a/prices", "flow.a/listings"]);
    expect(keys(await store.listProjectDatasets({ search: " LISTINGS " }))).toEqual(["flow.b/listings", "flow.a/listings"]);
    expect(keys(await store.listProjectDatasets({ search: "home" }))).toEqual(["flow.a/listings"]);
    expect(keys(await store.listProjectDatasets({ flowId: "flow.b", search: "price" }))).toEqual([]);

    const flowPage = await store.listProjectDatasets({ flowId: "flow.a", limit: 1 });
    await expect(store.listProjectDatasets({ limit: 1, cursor: flowPage.nextCursor })).rejects.toThrow(CURSOR_MISMATCH);
    await expect(store.listProjectDatasets({ flowId: "flow.a", search: "price", limit: 1, cursor: flowPage.nextCursor })).rejects.toThrow(CURSOR_MISMATCH);
  });

  it("lists a table's runs newest first, joined to each run, filtered by status and run id", async () => {
    const { store } = await openFixture([
      { runId: "run.a", flowId: "flow.a", status: "succeeded", startedAt: 10 },
      { runId: "run.b", flowId: "flow.a", status: "failed", startedAt: 20 },
      { runId: "run.c", flowId: "flow.a", status: "queued" }
    ]);
    await store.appendBatch(batch({ runId: "run.a", now: 1_000 }));
    await store.appendBatch(batch({ runId: "run.b", now: 2_000 }));
    await store.appendBatch(batch({ runId: "run.c", now: 3_000 }));
    await store.appendBatch(batch({ runId: "run.c", datasetId: "prices", now: 4_000 }));

    const first = await store.listDatasetRuns({ flowId: "flow.a", datasetId: "listings", limit: 2 });
    expect(first.runs.map((run) => run.runId)).toEqual(["run.c", "run.b"]);
    expect(first.runs[1]).toEqual({ runId: "run.b", datasetId: "listings", nodeIds: ["node.extract"], schemaDigest: "sha256:schema-a", recordCount: 3, truncated: false, invalidCount: 0, updatedAt: 2_000, flowId: "flow.a", runStatus: "failed", runStartedAt: 20 });
    expect(first.runs[0]).toMatchObject({ runStatus: "queued", runStartedAt: null });
    const second = await store.listDatasetRuns({ flowId: "flow.a", datasetId: "listings", limit: 2, cursor: first.nextCursor });
    expect(second.runs.map((run) => run.runId)).toEqual(["run.a"]);
    expect(second.nextCursor).toBeNull();

    expect((await store.listDatasetRuns({ flowId: "flow.a", datasetId: "listings", status: "failed" })).runs.map((run) => run.runId)).toEqual(["run.b"]);
    expect((await store.listDatasetRuns({ flowId: "flow.a", datasetId: "listings", runId: "run.a" })).runs.map((run) => run.runId)).toEqual(["run.a"]);
    await expect(store.listDatasetRuns({ flowId: "flow.a", datasetId: "listings", status: "waiting" })).rejects.toThrow("Invalid run status.");
    await expect(store.listDatasetRuns({ flowId: "flow.a", datasetId: "listings", status: "failed", limit: 2, cursor: first.nextCursor })).rejects.toThrow(CURSOR_MISMATCH);
    await expect(store.listDatasetRuns({ flowId: "flow.a", datasetId: "prices", limit: 2, cursor: first.nextCursor })).rejects.toThrow(CURSOR_MISMATCH);
  });

  it("deletes one dataset by id, recomputes its catalog entry, and removes the entry with the last run", async () => {
    const { store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }, { runId: "run.b", flowId: "flow.a" }]);
    await store.appendBatch(batch({ runId: "run.a", datasetId: "listings", rows: items(3), now: 1_000 }));
    await store.appendBatch(batch({ runId: "run.a", datasetId: "prices", rows: items(1), now: 1_100 }));
    await store.appendBatch(batch({ runId: "run.b", datasetId: "listings", label: "B", rows: items(2), now: 2_000 }));

    await expect(store.deleteRunDatasets("run.b", { datasetId: "listings" })).resolves.toEqual({ datasetCount: 1, rowCount: 2 });
    const afterFirst = await store.listProjectDatasets();
    expect(afterFirst.datasets).toEqual([
      { flowId: "flow.a", datasetId: "prices", latestRunId: "run.a", latestUpdatedAt: 1_100, runCount: 1, latestRecordCount: 1, latestTruncated: false, schemaDigest: "sha256:schema-a" },
      { flowId: "flow.a", datasetId: "listings", latestRunId: "run.a", latestUpdatedAt: 1_000, runCount: 1, latestRecordCount: 3, latestTruncated: false, schemaDigest: "sha256:schema-a" }
    ]);

    await expect(store.deleteRunDatasets("run.a", { datasetId: "listings" })).resolves.toEqual({ datasetCount: 1, rowCount: 3 });
    expect((await store.listProjectDatasets()).datasets.map((dataset) => dataset.datasetId)).toEqual(["prices"]);
    expect((await store.listDatasets("run.a")).map((dataset) => dataset.datasetId)).toEqual(["prices"]);
    await expect(store.deleteRunDatasets("run.a", { datasetId: "missing" })).resolves.toEqual({ datasetCount: 0, rowCount: 0 });
  });

  it("reads a run's dataset summaries through any SQL executor, newest write first", async () => {
    const { pool, store } = await openFixture([{ runId: "run.a", flowId: "flow.a" }]);
    const listings = await store.appendBatch(batch({ datasetId: "listings", now: 1_000 }));
    const prices = await store.appendBatch(batch({ datasetId: "prices", now: 2_000 }));
    const lease = await pool.acquire(PROJECT);
    try {
      await expect(runDatasetSummariesForRun(lease.database, "run.a")).resolves.toEqual([prices, listings]);
    } finally {
      await lease.release();
    }
  });
});

// Each batch is keyed by its attempt id unless a test sets `batchKey`, as the executor does outside a Call Flow.
function batch(overrides: Partial<AutomationStudioRunDatasetBatch> = {}): AutomationStudioRunDatasetBatch {
  const attemptId = overrides.attemptId ?? "attempt.1";
  return { runId: "run.a", datasetId: "listings", nodeId: "node.extract", attemptId, batchKey: attemptId, schema: SCHEMA, schemaDigest: "sha256:schema-a", writeMode: "append", rows: items(3), invalidCount: 0, truncated: false, now: 1_000, ...overrides };
}

function items(count: number, prefix = "item"): AutomationStudioRunDatasetRow[] {
  return Array.from({ length: count }, (_, index) => ({ title: `${prefix} ${index + 1}`, price: index + 1 }));
}

async function openFixture(runs: RunSeed[]): Promise<Fixture> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: PROJECT });
  const lease = await pool.acquire(PROJECT);
  for (const flowId of new Set(runs.map((run) => run.flowId))) {
    await lease.database.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values (?, 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)", [flowId]);
  }
  const runtime = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
  for (const run of runs) await runtime.upsertRunSummary(runSummary(run));
  await runtime.close();
  await lease.release();
  await admin.close();
  const store = await AutomationStudioProjectRunDatasetStore.open({ pool, projectId: PROJECT });
  fixture = { pool, store };
  return fixture;
}

function runSummary(run: RunSeed): any {
  return { schemaVersion: "0.1", runId: run.runId, flowId: run.flowId, projectId: PROJECT, status: run.status ?? "succeeded", startedAt: run.status === "queued" ? undefined : run.startedAt ?? 10, finishedAt: 100, updatedAt: 100, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 0, interventionCount: 0, adaptationCount: 0 };
}

async function query<T = Record<string, unknown>>(pool: AutomationStudioProjectDatabasePool, sql: string, params: unknown[] = []): Promise<T[]> {
  const lease = await pool.acquire(PROJECT);
  try {
    return await lease.database.all<T>(sql, params);
  } finally {
    await lease.release();
  }
}

async function storedOrdinals(pool: AutomationStudioProjectDatabasePool, runId: string, datasetId: string): Promise<number[]> {
  const rows = await query<{ ordinal: number }>(pool, "select ordinal from run_dataset_rows where run_id = ? and dataset_id = ? order by ordinal", [runId, datasetId]);
  return rows.map((row) => row.ordinal);
}

function batchCounts(pool: AutomationStudioProjectDatabasePool, runId: string, datasetId: string): Promise<BatchCounts[]> {
  return query<BatchCounts>(pool, "select batch_key, attempt_id, row_count, invalid_count, truncated from run_dataset_batches where run_id = ? and dataset_id = ? order by batch_key", [runId, datasetId]);
}

// The dataset's counts must equal the sums over its current batches, and the stored rows must match the batches' row counts.
async function expectSummaryMatchesBatches(pool: AutomationStudioProjectDatabasePool, summary: AutomationStudioRunDatasetSummary, expected: BatchCounts[]): Promise<void> {
  const counts = await batchCounts(pool, summary.runId, summary.datasetId);
  expect(counts).toEqual(expected);
  expect(summary.invalidCount).toBe(counts.reduce((sum, item) => sum + item.invalid_count, 0));
  expect(summary.recordCount).toBe(counts.reduce((sum, item) => sum + item.row_count, 0));
  const stored = await query<{ batch_key: string; total: number }>(pool, "select batch_key, count(*) as total from run_dataset_rows where run_id = ? and dataset_id = ? group by batch_key order by batch_key", [summary.runId, summary.datasetId]);
  expect(stored).toEqual(counts.filter((item) => item.row_count > 0).map((item) => ({ batch_key: item.batch_key, total: item.row_count })));
}

async function setRecordCount(pool: AutomationStudioProjectDatabasePool, runId: string, datasetId: string, recordCount: number): Promise<void> {
  const lease = await pool.acquire(PROJECT);
  try {
    await lease.database.run("update run_datasets set record_count = ? where run_id = ? and dataset_id = ?", [recordCount, runId, datasetId]);
  } finally {
    await lease.release();
  }
}
