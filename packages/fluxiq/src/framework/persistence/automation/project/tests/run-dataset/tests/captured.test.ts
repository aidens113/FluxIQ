// @fluxiq-test-group real-sql
// The end-of-run automatic answer reads a field a batch's own read captured, and an item does not show, as "not shown"
// (t998), as the answer-first feed does (t993). A lending library's shelf, where only some loans carry a "Renewable"
// tag; nothing here mirrors a Lab scenario.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { stampAutomationStudioRecordProcessing, type AutomationStudioRecordProcessing, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import { AutomationStudioProjectAdministration } from "../../../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../../../database.ts";
import { automationStudioRunDatasetAnswer, type AutomationStudioRunDatasetCollectedRow } from "../../../run-dataset-answer/index.ts";
import { AutomationStudioProjectRunDatasetStore, type AutomationStudioRunDatasetBatch } from "../../../run-dataset-store.ts";
import { AutomationStudioProjectRuntimeStreamStore } from "../../../runtime-stream-store.ts";

const PROJECT = "project.captured";
const ids = { runId: "run", datasetId: "loans" };
const REFERENCE = Date.UTC(2030, 0, 10, 12);
const BASE: AutomationStudioRecordSchema = { schemaVersion: "0.1", primaryKey: ["id"], fields: [
  { id: "id", label: "Id", valueType: "string", semanticType: "id" },
  { id: "title", label: "Title", valueType: "string", required: true },
  { id: "secret", label: "Secret", valueType: "string", handling: "exclude" }
] };
const TAGGED: AutomationStudioRecordSchema = { ...BASE, fields: [...BASE.fields, { id: "tag", label: "Tag", valueType: "string" }] };
const RENEWABLE = { where: [{ field: "tag", contains: "Renewable" }], columns: ["title"] };
let root = "";
let pool: AutomationStudioProjectDatabasePool;
let store: AutomationStudioProjectRunDatasetStore;

const processOf = (raw: unknown, schema: AutomationStudioRecordSchema = TAGGED): AutomationStudioRecordProcessing => {
  const bound = stampAutomationStudioRecordProcessing(raw, schema, { source: "b".repeat(64), revision: 1 });
  if (!bound.ok) throw new Error(bound.issues.join(", "));
  return bound.processing;
};
const batch = (over: Partial<AutomationStudioRunDatasetBatch> = {}): AutomationStudioRunDatasetBatch => ({ ...ids, nodeId: "read", attemptId: "shelf", batchKey: "shelf", schema: TAGGED, schemaDigest: "sha256:tagged", writeMode: "append", rows: [], invalidCount: 0, truncated: false, now: REFERENCE, ...over });
async function sql<T = Record<string, unknown>>(command: string, params: unknown[] = []): Promise<T[]> {
  const lease = await pool.acquire(PROJECT);
  try { return await lease.database.all<T>(command, params); }
  finally { await lease.release(); }
}
/** The rows exactly as the store's end-of-run processing selects them. */
const collected = () => sql<AutomationStudioRunDatasetCollectedRow>(`select r.attempt_id, r.batch_key, coalesce(b.node_id, r.attempt_id) as node_id, r.row_json, b.captured_fields_json
  from run_dataset_rows r left join run_dataset_batches b on b.run_id = r.run_id and b.dataset_id = r.dataset_id and b.batch_key = r.batch_key
  where r.run_id = ? and r.dataset_id = ? order by r.ordinal`, [ids.runId, ids.datasetId]);

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-captured-store-"));
  pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: PROJECT });
  await sql("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow', 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)");
  const runtime = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
  try { await runtime.upsertRunSummary({ schemaVersion: "0.1", runId: "run", flowId: "flow", projectId: PROJECT, status: "succeeded", startedAt: REFERENCE, finishedAt: REFERENCE + 50, updatedAt: REFERENCE + 50, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 0, interventionCount: 0, adaptationCount: 0, metadata: { processingReferenceTimeMs: REFERENCE, explorationAttempt: { attemptId: "attempt" } } }); }
  finally { await runtime.close(); }
  await admin.close();
  store = await AutomationStudioProjectRunDatasetStore.open({ pool, projectId: PROJECT });
});
afterEach(async () => {
  await store.close();
  await pool.closeAll();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

it("stores each batch's captured fields and reads a captured tag an item does not show as not shown", async () => {
  const shelf = [{ id: "a", title: "Atlas", tag: "Renewable" }, { id: "b", title: "Birds" }, { id: "c", title: "Clocks", tag: "" }];
  await store.appendBatch(batch({ process: processOf(RENEWABLE), rows: shelf }));
  expect(await sql("select batch_key, captured_fields_json from run_dataset_batches")).toEqual([{ batch_key: "shelf", captured_fields_json: '["id","title","tag"]' }]);
  await store.processRunDatasets("run");
  expect((await store.getPage({ ...ids, retained: "answer" }))?.rows).toEqual([shelf[0]]);
  expect((await store.getPage(ids))?.rows).toEqual([{ title: "Atlas" }]);
});

it("keeps a batch written before migration 0041 withholding, with no list inferred from another batch", async () => {
  await store.appendBatch(batch({ process: processOf(RENEWABLE), rows: [{ id: "a", title: "Atlas", tag: "Renewable" }, { id: "b", title: "Birds" }] }));
  await store.appendBatch(batch({ attemptId: "later", batchKey: "later", process: processOf(RENEWABLE), rows: [{ id: "c", title: "Clocks" }] }));
  await sql("update run_dataset_batches set captured_fields_json = null where batch_key = 'shelf'");
  await store.processRunDatasets("run");
  await expect(store.getPage({ ...ids, retained: "answer" })).rejects.toThrow("not ready");
  const answer = automationStudioRunDatasetAnswer(await collected(), TAGGED, processOf(RENEWABLE), REFERENCE);
  expect("unavailable" in answer && answer.missingEvidence?.map((entry) => [entry.field, entry.reason, entry.source.batchKey, entry.source.row])).toEqual([["tag", "missing", "shelf", 1]]);
});

it("keeps each batch's own list when the schema grows between batches", async () => {
  await store.appendBatch(batch({ attemptId: "early", batchKey: "early", schema: BASE, schemaDigest: "sha256:base", process: processOf({ columns: ["title"] }, BASE), rows: [{ id: "a", title: "Atlas" }] }));
  await store.appendBatch(batch({ attemptId: "late", batchKey: "late", process: processOf(RENEWABLE), rows: [{ id: "b", title: "Birds", tag: "Renewable" }, { id: "c", title: "Clocks" }] }));
  expect(await sql("select batch_key, captured_fields_json from run_dataset_batches order by batch_key")).toEqual([
    { batch_key: "early", captured_fields_json: '["id","title"]' },
    { batch_key: "late", captured_fields_json: '["id","title","tag"]' }
  ]);
  await store.processRunDatasets("run");
  // The early read never captured the tag: its row stays missing evidence, naming that batch; the late read's untagged row does not.
  await expect(store.getPage({ ...ids, retained: "answer" })).rejects.toThrow("not ready");
  const answer = automationStudioRunDatasetAnswer(await collected(), TAGGED, processOf(RENEWABLE), REFERENCE);
  expect("unavailable" in answer && answer.missingEvidence?.map((entry) => [entry.field, entry.reason, entry.source.batchKey])).toEqual([["tag", "missing", "early"]]);
  // A complete fresh pass with the grown schema replaces it, and the answer is ready.
  await store.appendBatch(batch({ attemptId: "fresh", batchKey: "fresh", startsOver: true, process: processOf(RENEWABLE), rows: [{ id: "a", title: "Atlas" }, { id: "b", title: "Birds", tag: "Renewable" }] }));
  await store.processRunDatasets("run");
  expect((await store.getPage({ ...ids, retained: "answer" }))?.rows).toEqual([{ id: "b", title: "Birds", tag: "Renewable" }]);
});
