// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioProjectDatasetSnapshotStore, type AutomationStudioDatasetSnapshotRow } from "../index.ts";
import { AUTOMATION_STUDIO_PROJECT_DATASET_SNAPSHOT_MIGRATION } from "../../dataset-occurrence-schema/index.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";

let rootDir = "";
let pool: AutomationStudioProjectDatabasePool;
const stores: AutomationStudioProjectDatasetSnapshotStore[] = [];
beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-immutable-snapshots-"));
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
});
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  await pool.closeAll();
  await rm(rootDir, { recursive: true, force: true });
});
const open = async (projectId = "project.one") => {
  const store = await AutomationStudioProjectDatasetSnapshotStore.open({ pool, projectId });
  stores.push(store);
  return store;
};
const rows: AutomationStudioDatasetSnapshotRow[] = [{ occurrenceId: "occurrence.a", row: { title: "Same", secret: { $secret: "opaque.reference" } } }, { occurrenceId: "occurrence.b", row: { title: "Same", secret: { $secret: "opaque.reference" } } }, { occurrenceId: "occurrence.c", row: { title: "Last" } }];

it("installs independently of runtime runs and the 0036 evidence migration", async () => {
  const lease = await pool.acquire("project.independent");
  try {
    await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [AUTOMATION_STUDIO_PROJECT_DATASET_SNAPSHOT_MIGRATION] }).migrate();
    expect(await lease.database.get("select name from sqlite_master where name = 'runtime_runs'")).toBeUndefined();
    expect(await lease.database.get("select name from sqlite_master where name = 'run_dataset_batches'")).toBeUndefined();
    expect(await lease.database.get("select name from sqlite_master where name = 'dataset_snapshots'")).toEqual({ name: "dataset_snapshots" });
  } finally { await lease.release(); }
});

it("preserves occurrence order, duplicate values and references, with no fake run or content digest", async () => {
  const store = await open();
  const snapshot = await store.create(rows);
  expect(snapshot.snapshotId).toMatch(/^snapshot\.[a-f0-9-]{36}$/u);
  const first = await store.page({ snapshotId: snapshot.snapshotId, limit: 2 });
  expect(first).toMatchObject({ count: 3, rows: rows.slice(0, 2), nextCursor: expect.any(String) });
  expect(await store.page({ snapshotId: snapshot.snapshotId, cursor: first!.nextCursor!, limit: 2 })).toEqual({ ...snapshot, rows: rows.slice(2) });
  const lease = await pool.acquire("project.one");
  try {
    expect(await lease.database.get("select count(*) as count from runtime_runs")).toEqual({ count: 0 });
    const columns = await lease.database.all<{ name: string }>("pragma table_info(dataset_snapshot_rows)");
    expect(columns.map((column) => column.name)).toEqual(["snapshot_id", "ordinal", "occurrence_id", "row_json"]);
  } finally { await lease.release(); }
});

it("creates independent immutable snapshots, and caller mutations cannot change one", async () => {
  const store = await open();
  const input = [{ occurrenceId: "one", row: { title: "Before" } }];
  const first = await store.create(input);
  input[0]!.row.title = "After";
  const second = await store.create(input);
  expect(first.snapshotId).not.toBe(second.snapshotId);
  expect((await store.page(first))?.rows).toEqual([{ occurrenceId: "one", row: { title: "Before" } }]);
  expect((await store.page(second))?.rows).toEqual(input);
});

it("validates unique occurrence IDs and finite JSON without leaving a partial snapshot", async () => {
  const store = await open();
  await expect(store.create([rows[0]!, rows[0]!])).rejects.toThrow(/unique/u);
  await expect(store.create([{ occurrenceId: "bad", row: { value: Number.NaN } }])).rejects.toThrow(/finite JSON/u);
  const lease = await pool.acquire("project.one");
  try { expect(await lease.database.get("select count(*) as count from dataset_snapshots")).toEqual({ count: 0 }); } finally { await lease.release(); }
});

it("rolls back metadata and preceding rows when a later SQL write fails", async () => {
  const store = await open();
  const lease = await pool.acquire("project.one");
  try { await lease.database.run("create trigger reject_snapshot_fixture before insert on dataset_snapshot_rows when new.occurrence_id = 'reject' begin select raise(abort, 'fixture rejection'); end"); } finally { await lease.release(); }
  await expect(store.create([rows[0]!, { occurrenceId: "reject", row: {} }])).rejects.toThrow(/fixture rejection/u);
  const query = await pool.acquire("project.one");
  try {
    expect(await query.database.get("select count(*) as count from dataset_snapshots")).toEqual({ count: 0 });
    expect(await query.database.get("select count(*) as count from dataset_snapshot_rows")).toEqual({ count: 0 });
  } finally { await query.release(); }
});

it("survives a store restart, isolates projects, and represents an empty snapshot explicitly", async () => {
  const store = await open();
  const snapshot = await store.create(rows);
  await store.close();
  stores.splice(stores.indexOf(store), 1);
  const restored = await open();
  expect((await restored.page(snapshot))?.rows).toEqual(rows);
  const other = await open("project.other");
  expect(await other.page(snapshot)).toBeNull();
  const empty = await restored.create([]);
  expect(await restored.page(empty)).toEqual({ ...empty, count: 0, rows: [] });
});

it("rejects malformed, foreign, fractional and out-of-range cursors and invalid limits", async () => {
  const store = await open();
  const snapshot = await store.create(rows);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  for (const cursor of ["!", "eA", encode({ snapshotId: "another", after: 1 }), encode({ snapshotId: snapshot.snapshotId, after: 1.5 }), encode({ snapshotId: snapshot.snapshotId, after: -1 }), encode({ snapshotId: snapshot.snapshotId, after: 3 }), encode({ snapshotId: snapshot.snapshotId, after: 1, extra: true })]) await expect(store.page({ snapshotId: snapshot.snapshotId, cursor })).rejects.toThrow(/cursor/u);
  for (const limit of [0, -1, 1.5, Number.NaN]) await expect(store.page({ snapshotId: snapshot.snapshotId, limit })).rejects.toThrow(/size/u);
});
