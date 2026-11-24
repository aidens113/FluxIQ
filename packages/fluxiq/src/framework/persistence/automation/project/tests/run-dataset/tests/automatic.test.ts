// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, stampAutomationStudioRecordProcessing, validateAutomationStudioRecords, type AutomationStudioRecordProcessing, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import { AutomationStudioProjectAdministration } from "../../../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../../../database.ts";
import { AutomationStudioProjectRunDatasetStore, type AutomationStudioRunDatasetBatch } from "../../../run-dataset-store.ts";
import { AutomationStudioProjectRuntimeStreamStore } from "../../../runtime-stream-store.ts";

const PROJECT = "project.automatic";
const ids = { runId: "run", datasetId: "items" };
const REFERENCE = Date.UTC(2030, 0, 10, 12);
const SEGMENT = Date.UTC(2030, 0, 20, 12);
const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", primaryKey: ["id"], fields: [
  { id: "id", label: "Id", valueType: "string", semanticType: "id" },
  { id: "title", label: "Title", valueType: "string", required: true },
  { id: "price", label: "Price", valueType: "string", semanticType: "currency" },
  { id: "date", label: "Date", valueType: "string", semanticType: "date" },
  { id: "promoted", label: "Promoted", valueType: "boolean", mark: "badge", semanticType: "flag" },
  { id: "secret", label: "Secret", valueType: "string", handling: "exclude" }
] };
let root = "";
let pool: AutomationStudioProjectDatabasePool;
let store: AutomationStudioProjectRunDatasetStore;
const processOf = (raw: unknown): AutomationStudioRecordProcessing => {
  const bound = stampAutomationStudioRecordProcessing(raw, schema, { source: "a".repeat(64), revision: 1 });
  if (!bound.ok) throw new Error(bound.issues.join(", "));
  return bound.processing;
};
const batch = (over: Partial<AutomationStudioRunDatasetBatch> = {}): AutomationStudioRunDatasetBatch => ({ ...ids, nodeId: "read", attemptId: "capture", batchKey: "capture", schema, schemaDigest: "sha256:captured", writeMode: "append", rows: [], invalidCount: 0, truncated: false, now: SEGMENT, ...over });
async function sql<T = Record<string, unknown>>(command: string, params: unknown[] = []): Promise<T[]> {
  const lease = await pool.acquire(PROJECT);
  try { return await lease.database.all<T>(command, params); }
  finally { await lease.release(); }
}
async function session(metadata: Record<string, string | number | null | { attemptId: string }>): Promise<void> {
  const runtime = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
  try { await runtime.upsertRunSummary({ schemaVersion: "0.1", runId: "run", flowId: "flow", projectId: PROJECT, status: "succeeded", startedAt: SEGMENT, finishedAt: SEGMENT + 50, updatedAt: SEGMENT + 50, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 0, interventionCount: 0, adaptationCount: 0, metadata }); }
  finally { await runtime.close(); }
}
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automatic-store-"));
  pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: PROJECT });
  await sql("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow', 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)");
  await session({ processingReferenceTimeMs: REFERENCE, explorationAttempt: { attemptId: "attempt" } });
  await admin.close();
  store = await AutomationStudioProjectRunDatasetStore.open({ pool, projectId: PROJECT });
});
afterEach(async () => {
  await store.close();
  await pool.closeAll();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

it("withholds a previously-ready valid subset across restart until its exact rejected-source batch is repaired or genuinely replaced", async () => {
  const process = processOf({ where: [{ field: "promoted", equals: "false" }], columns: ["title"] });
  const safe = { id: "a", title: "A", promoted: false };
  const repaired = { id: "b", title: "B", promoted: false };
  await store.appendBatch(batch({ process, rows: [safe] }));
  await store.processRunDatasets("run");
  expect((await store.getPage({ ...ids, retained: "answer" }))?.rows).toEqual([safe]);
  // The upstream validator kept this safe original and rejected one other occurrence; rejected values are never fabricated/stored.
  await store.appendBatch(batch({ process, rows: [safe], invalidCount: 1 }));
  await store.processRunDatasets("run");
  await expect(store.getPage({ ...ids, retained: "answer" })).rejects.toThrow("not ready");
  expect(await sql("select invalid_count, answer_rows_retained from run_datasets where dataset_id = 'items'")).toEqual([{ invalid_count: 1, answer_rows_retained: 0 }]);
  expect(await sql("select count(*) as retained from run_dataset_answer_rows")).toEqual([{ retained: 0 }]);
  await store.close();
  store = await AutomationStudioProjectRunDatasetStore.open({ pool, projectId: PROJECT });
  await store.processRunDatasets("run");
  await expect(store.getPage({ ...ids, retained: "answer" })).rejects.toThrow("not ready");
  expect((await store.getPage({ ...ids, retained: "collected" }))?.rows).toEqual([safe]);
  await store.appendBatch(batch({ process, rows: [safe, repaired], invalidCount: 0 }));
  await store.processRunDatasets("run");
  expect(await sql("select invalid_count from run_datasets where dataset_id = 'items'")).toEqual([{ invalid_count: 0 }]);
  expect((await store.getPage({ ...ids, retained: "answer" }))?.rows).toEqual([safe, repaired]);
  await store.appendBatch(batch({ process, attemptId: "bad-other", batchKey: "bad-other", rows: [], invalidCount: 1 }));
  await store.processRunDatasets("run");
  await expect(store.getPage({ ...ids, retained: "answer" })).rejects.toThrow("not ready");
  await store.appendBatch(batch({ process, attemptId: "complete-pass", batchKey: "complete-pass", startsOver: true, rows: [safe, repaired], invalidCount: 0 }));
  await store.processRunDatasets("run");
  expect(await sql("select invalid_count from run_datasets where dataset_id = 'items'")).toEqual([{ invalid_count: 0 }]);
  expect((await store.getPage({ ...ids, retained: "answer" }))?.rows).toEqual([safe, repaired]);
});

it("saved replay uses the same original reference/selection and full originals after reopening, preserving actual segment timestamps", async () => {
  const process = processOf({ where: [{ field: "promoted", equals: "false" }, { field: "date", atLeast: "2030-01-09", atMost: "2030-01-10", as: "date" }], sort: [{ field: "price", order: "asc", as: "number" }], columns: ["title"] });
  const promoted = { id: "a", title: "Promoted A", price: "$1", date: "1 day ago", promoted: true, secret: "excluded" };
  const organic = { id: "a", title: "Organic A", price: "$10", date: "1 day ago", promoted: false };
  const old = { id: "b", title: "Old B", price: "$2", date: "4 days ago", promoted: false };
  const captured = validateAutomationStudioRecords([promoted], schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
  expect(captured.invalidCount).toBe(0);
  expect(captured.rows[0]).not.toHaveProperty("secret");
  expect(promoted.secret).toBe("excluded");
  await store.appendBatch(batch({ process, rows: captured.rows, invalidCount: captured.invalidCount, truncated: captured.truncated }));
  await store.appendBatch(batch({ process, attemptId: "organic", batchKey: "organic", rows: [organic, organic, old] }));
  await store.processRunDatasets("run", { now: Date.UTC(2040, 0, 1) });
  expect((await store.getPage({ ...ids, retained: "answer" }))?.rows).toEqual([organic]);
  expect((await store.getPage(ids))?.rows).toEqual([{ title: "Organic A" }]);
  expect(await sql("select attempt_id, batch_key from run_dataset_answer_rows")).toEqual([{ attempt_id: "organic", batch_key: "organic" }]);
  const actual = await sql<{ started_at_ms: number }>("select started_at_ms from runtime_runs where run_id = 'run'");
  expect(actual[0]?.started_at_ms).toBe(SEGMENT);
  await store.close();
  store = await AutomationStudioProjectRunDatasetStore.open({ pool, projectId: PROJECT });
  await store.processRunDatasets("run", { now: Date.UTC(2050, 0, 1) });
  expect((await store.getPage({ ...ids, retained: "answer" }))?.rows).toEqual([organic]);
  expect((await store.getPage({ ...ids, retained: "collected" }))?.rows).toEqual([{ id: "a", title: "Promoted A", price: "$1", date: "1 day ago", promoted: true }, organic, organic, old]);
});

it("atomically invalidates an earlier answer when amended required evidence is missing, preserving collected records for repair", async () => {
  // Until t998 this used an absent `promoted` flag, but the batch captured `promoted`, so its absence now reads as
  // "not shown" (t993, t998). Required evidence is missing here because the price the item shows cannot be read.
  const original = { id: "a", title: "A", price: "ask", date: "1 day ago" };
  await store.appendBatch(batch({ process: processOf({ columns: ["title"] }), rows: [original] }));
  await store.processRunDatasets("run");
  expect((await store.getPage({ ...ids, retained: "answer" }))?.rows).toEqual([original]);
  const amended = processOf({ where: [{ field: "price", atMost: 5 }], columns: ["title"] });
  await store.setProcess({ ...ids, process: amended });
  await expect(store.getPage({ ...ids, retained: "answer" })).rejects.toThrow("retained answer is not ready");
  expect(await sql("select answer_rows_retained, processed_at_ms, processing_json from run_datasets")).toEqual([{ answer_rows_retained: 0, processed_at_ms: null, processing_json: null }]);
  expect(await sql("select row_json from run_dataset_answer_rows")).toEqual([]);
  expect((await store.getPage({ ...ids, retained: "collected" }))?.rows).toEqual([original]);
  const repaired = { ...original, price: "$2" };
  await store.appendBatch(batch({ startsOver: true, attemptId: "repaired", batchKey: "repaired", process: amended, rows: [repaired] }));
  await store.processRunDatasets("run");
  expect((await store.getPage({ ...ids, retained: "answer" }))?.rows).toEqual([repaired]);
});

it("refuses absent/invalid carried reference metadata without reinterpreting old dates from the new segment clock", async () => {
  const original = { id: "a", title: "A", date: "1 day ago" };
  await store.appendBatch(batch({ process: processOf({ where: [{ field: "date", atMost: "2030-01-10", as: "date" }], columns: ["title"] }), rows: [original] }));
  await store.processRunDatasets("run");
  for (const metadata of [{ explorationAttempt: { attemptId: "attempt" } }, { explorationAttempt: { attemptId: "attempt" }, processingReferenceTimeMs: null }, { explorationAttempt: { attemptId: "attempt" }, processingReferenceTimeMs: "old" }]) {
    await session(metadata);
    await store.processRunDatasets("run", { now: REFERENCE });
    await expect(store.getPage({ ...ids, retained: "answer" })).rejects.toThrow("retained answer is not ready");
  }
  await session({ explorationAttempt: { attemptId: "attempt" }, processingReferenceTimeMs: REFERENCE });
  await store.processRunDatasets("run");
  expect((await store.getPage({ ...ids, retained: "answer" }))?.rows).toEqual([original]);
  expect((await sql<{ started_at_ms: number }>("select started_at_ms from runtime_runs"))[0]?.started_at_ms).toBe(SEGMENT);
});

it("materializes a truthful minRows:0 empty selection with its full schema instead of treating it as missing source", async () => {
  await store.appendBatch(batch({ process: processOf({ columns: ["title"], minRows: 0 }), rows: [] }));
  await store.processRunDatasets("run");
  const result = await store.getPage({ ...ids, retained: "answer" });
  expect(result?.rows).toEqual([]);
  expect(result?.schema.primaryKey).toEqual(["id"]);
  expect(result?.displayColumns).toEqual([{ id: "title", label: "Title" }]);
  expect(result?.schema.fields.some((field) => field.id === "secret")).toBe(false);
});
