// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import { AutomationStudioProjectAdministration } from "../../../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../../../database.ts";
import { AutomationStudioProjectRunDatasetStore, type AutomationStudioRunDatasetBatch } from "../../../run-dataset-store.ts";
import { AutomationStudioProjectRuntimeStreamStore } from "../../../runtime-stream-store.ts";

let root = "";
let pool: AutomationStudioProjectDatabasePool;
let store: AutomationStudioProjectRunDatasetStore;
const PROJECT = "project.retained";
const ids = { runId: "run", datasetId: "items" };
const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", primaryKey: ["title"], fields: [
  { id: "title", label: "Title", valueType: "string", required: true },
  { id: "price", label: "Price", valueType: "number", semanticType: "currency" },
  { id: "promoted", label: "Promoted", valueType: "boolean", semanticType: "flag", mark: "badge" }
] };
const batch = (over: Partial<AutomationStudioRunDatasetBatch> = {}): AutomationStudioRunDatasetBatch => ({ ...ids, nodeId: "read", attemptId: "A", batchKey: "A", schema, schemaDigest: "sha256:A", writeMode: "append", rows: [{ title: "A", price: 1, promoted: true }], invalidCount: 0, truncated: false, now: 1, ...over });
async function sql(command: string): Promise<void> {
  const lease = await pool.acquire(PROJECT);
  try {
    await lease.database.run(command);
  } finally {
    await lease.release();
  }
}
async function reopen(): Promise<void> {
  await store.close();
  store = await AutomationStudioProjectRunDatasetStore.open({ pool, projectId: PROJECT });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-retained-rows-"));
  pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: PROJECT });
  await sql("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow', 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)");
  const runtime = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
  await runtime.upsertRunSummary({ schemaVersion: "0.1", runId: "run", flowId: "flow", projectId: PROJECT, status: "running", startedAt: 1, updatedAt: 1, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 0, interventionCount: 0, adaptationCount: 0 });
  await runtime.close();
  await admin.close();
  store = await AutomationStudioProjectRunDatasetStore.open({ pool, projectId: PROJECT });
});

afterEach(async () => {
  await store.close();
  await pool.closeAll();
  await rm(root, { recursive: true, force: true });
});

it("keeps selected original rows, projects only public reads, and separates all cursor modes after reopen", async () => {
  const rows = [{ title: "first", price: 1, promoted: true }, { title: "second", price: 2, promoted: false }, { title: "third", price: 3 }];
  await store.appendBatch(batch({ rows, process: { where: [{ field: "price", atLeast: 2 }], sort: [{ field: "price", order: "desc" }], columns: ["title"], dedupe: false } }));
  await store.processRunDatasets("run");
  await reopen();
  const view = await store.getPage({ ...ids, limit: 1 });
  expect(view?.rows).toEqual([{ title: "third" }]);
  expect(view?.schema.fields.map((field) => field.id)).toEqual(["title"]);
  expect(view).not.toHaveProperty("displayColumns");
  const retained = await store.getPage({ ...ids, retained: "answer", limit: 1 });
  expect(retained?.rows).toEqual([rows[2]]);
  expect(retained?.schema).toEqual(schema);
  expect(retained?.displayColumns).toEqual([{ id: "title", label: "Title" }]);
  const next = await store.getPage({ ...ids, retained: "answer", cursor: retained?.nextCursor });
  expect(next?.rows).toEqual([rows[1]]);
  expect((await store.getPage({ ...ids, retained: "collected" }))?.rows).toEqual(rows);
  expect(await store.readRows(ids)).toMatchObject({ rows: [{ title: "third" }, { title: "second" }] });
  await expect(store.getPage({ ...ids, retained: "answer", cursor: view?.nextCursor })).rejects.toThrow("Paging cursor does not match this query.");
  await expect(store.getPage({ ...ids, retained: "collected", cursor: retained?.nextCursor })).rejects.toThrow("Paging cursor does not match this query.");
});

it("reports old projected answers as unready and rolls back a failed retained rebuild before safely rebuilding", async () => {
  await store.appendBatch(batch({ process: { columns: ["title"] } }));
  await store.processRunDatasets("run");
  await sql("update run_dataset_answer_rows set row_json = '{\"title\":\"A\"}'");
  await sql("update run_datasets set answer_rows_retained = 0");
  await reopen();
  const before = await store.getPage(ids);
  await expect(store.getPage({ ...ids, retained: "answer" })).rejects.toThrow("retained answer is not ready");
  await sql("create trigger refuse_retained before insert on run_dataset_answer_rows begin select raise(abort, 'synthetic processing refusal'); end");
  await expect(store.processRunDatasets("run")).rejects.toThrow("synthetic processing refusal");
  expect(await store.getPage(ids)).toEqual(before);
  await reopen();
  await expect(store.getPage({ ...ids, retained: "answer" })).rejects.toThrow("retained answer is not ready");
  await sql("drop trigger refuse_retained");
  await store.processRunDatasets("run");
  expect((await store.getPage({ ...ids, retained: "answer" }))?.rows).toEqual(batch().rows);
  expect(await store.getPage(ids)).toMatchObject({ rows: [{ title: "A" }] });
  await store.appendBatch(batch({ startsOver: true }));
  await expect(store.getPage({ ...ids, retained: "answer" })).rejects.toThrow("retained answer is not ready");
});

it("keeps a later process and full row order on an exact earlier retry, while a changed replacement stays explicit and atomic", async () => {
  const original = batch({ process: { columns: ["title"], sort: [{ field: "price", order: "asc" }] } });
  await store.appendBatch(original);
  const grown: AutomationStudioRecordSchema = { ...schema, fields: [...schema.fields, { id: "shipping", label: "Shipping", valueType: "string", semanticType: "currency" }] };
  await store.appendBatch(batch({ attemptId: "B", batchKey: "B", schema: grown, schemaDigest: "sha256:B", rows: [{ title: "B", price: 2, shipping: "$0.00" }], process: { columns: ["title"], sort: [{ field: "price", order: "desc" }] }, now: 2 }));
  await store.processRunDatasets("run");
  const before = await store.getPage(ids);
  const raw = await store.getPage({ ...ids, retained: "collected" });
  await reopen();
  await store.appendBatch({ ...original, now: 99 });
  expect(await store.getPage(ids)).toEqual(before);
  expect(await store.getPage({ ...ids, retained: "collected" })).toEqual(raw);
  expect(before?.rows).toEqual([{ title: "B" }, { title: "A" }]);
  const changed = { ...original, rows: [{ title: "changed A", price: 3 }], now: 3 };
  await sql("create trigger refuse_changed before insert on run_dataset_rows when new.batch_key = 'A' begin select raise(abort, 'synthetic changed receipt refusal'); end");
  await expect(store.appendBatch(changed)).rejects.toThrow("synthetic changed receipt refusal");
  expect(await store.getPage(ids)).toEqual(before);
  await reopen();
  await store.appendBatch(original);
  expect(await store.getPage(ids)).toEqual(before);
  await sql("drop trigger refuse_changed");
  await store.appendBatch(changed);
  expect((await store.getPage({ ...ids, retained: "collected" }))?.rows).toEqual([{ title: "B", price: 2, shipping: "$0.00" }, ...changed.rows]);
  await store.processRunDatasets("run");
  expect((await store.getPage(ids))?.rows).toEqual([{ title: "B" }, { title: "changed A" }]);
});
