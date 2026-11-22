// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import { AutomationStudioProjectAdministration } from "../../../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../../../database.ts";
import { AutomationStudioProjectRunDatasetStore, type AutomationStudioRunDatasetBatch } from "../../../run-dataset-store.ts";
import { AutomationStudioProjectRuntimeStreamStore } from "../../../runtime-stream-store.ts";

let root = "";
let pool: AutomationStudioProjectDatabasePool;
let store: AutomationStudioProjectRunDatasetStore;
const PROJECT = "project.exclusions";
const schema: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }] };
const batch = (over: Partial<AutomationStudioRunDatasetBatch> = {}): AutomationStudioRunDatasetBatch => ({ runId: "run", datasetId: "items", nodeId: "read", attemptId: "one", batchKey: "one", schema, schemaDigest: "sha256:first", writeMode: "append", rows: [{ title: "one" }], invalidCount: 0, truncated: false, now: 1, ...over });

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-exclusion-policy-"));
  pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: PROJECT });
  const lease = await pool.acquire(PROJECT);
  await lease.database.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow', 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)");
  await lease.release();
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

describe("durable exclusion policies on additive pages", () => {
  it("rolls back schema growth and private exclusion policy together when row persistence fails", async () => {
    await store.appendBatch(batch());
    const before = await store.getPage({ runId: "run", datasetId: "items" });
    const lease = await pool.acquire(PROJECT);
    await lease.database.run("create trigger refuse_later before insert on run_dataset_rows when new.batch_key = 'later' begin select raise(abort, 'synthetic row refusal'); end");
    await lease.release();
    const grown: AutomationStudioRecordSchema = { ...schema, fields: [...schema.fields, { id: "later", label: "Later", valueType: "string" }, { id: "secret", label: "Secret", valueType: "string", handling: "exclude" }] };
    await expect(store.appendBatch(batch({ attemptId: "later", batchKey: "later", schema: grown, schemaDigest: "sha256:later", rows: [{ title: "later", later: "safe" }] }))).rejects.toThrow("synthetic row refusal");
    expect(await store.getPage({ runId: "run", datasetId: "items" })).toEqual(before);
    const check = await pool.acquire(PROJECT);
    expect(await check.database.get("select excluded_field_digests_json from run_datasets where run_id = 'run'")).toEqual({ excluded_field_digests_json: "[]" });
    await check.release();
  });

  it("blocks direct-store resurrection before writes, across reopen/retry, and permits only an explicit restart", async () => {
    const excluded: AutomationStudioRecordSchema = { ...schema, fields: [...schema.fields, { id: "credentials", label: "Credentials", valueType: "string", handling: "exclude" }] };
    await store.appendBatch(batch({ schema: excluded, process: { sort: [{ field: "title", order: "asc" }] } }));
    await store.processRunDatasets("run");
    const before = await store.getPage({ runId: "run", datasetId: "items" });
    const lease = await pool.acquire(PROJECT);
    const metadata = await lease.database.get<{ schema_json: string; excluded_field_digests_json: string }>("select schema_json, excluded_field_digests_json from run_datasets where run_id = 'run'");
    expect(metadata?.schema_json).not.toContain("credentials");
    expect(metadata?.excluded_field_digests_json).toMatch(/^\["[0-9a-f]{64}"\]$/u);
    await lease.release();
    const included: AutomationStudioRecordSchema = { ...schema, fields: [...schema.fields, { id: "credentials", label: "Credentials", valueType: "string" }] };
    const incoming = batch({ attemptId: "later", batchKey: "later", schema: included, schemaDigest: "sha256:later", rows: [{ title: "two", credentials: "excluded synthetic cell" }], process: { limit: 1 } });
    await expect(store.appendBatch(incoming)).rejects.toThrow("Run dataset schema exclusion conflict");
    expect(await store.getPage({ runId: "run", datasetId: "items" })).toEqual(before);
    await store.close();
    store = await AutomationStudioProjectRunDatasetStore.open({ pool, projectId: PROJECT });
    await expect(store.appendBatch(incoming)).rejects.toThrow("Run dataset schema exclusion conflict");
    expect(await store.getPage({ runId: "run", datasetId: "items" })).toEqual(before);
    const check = await pool.acquire(PROJECT);
    const persisted = await check.database.all<{ row_json: string }>("select row_json from run_dataset_rows where run_id = 'run'");
    expect(JSON.stringify(persisted)).not.toContain("excluded synthetic cell");
    await check.release();
    await store.appendBatch({ ...incoming, startsOver: true });
    expect((await store.getPage({ runId: "run", datasetId: "items" }))?.rows).toEqual(incoming.rows);
  });

  it("keeps legacy same-schema appends compatible but requires restart before growth with unknown exclusion history", async () => {
    await store.appendBatch(batch());
    const lease = await pool.acquire(PROJECT);
    await lease.database.run("update run_datasets set excluded_field_digests_json = null where run_id = 'run'");
    await lease.release();
    await store.appendBatch(batch({ attemptId: "two", batchKey: "two", rows: [{ title: "two" }] }));
    const before = await store.getPage({ runId: "run", datasetId: "items" });
    const grown: AutomationStudioRecordSchema = { ...schema, fields: [...schema.fields, { id: "later", label: "Later", valueType: "string" }] };
    const incoming = batch({ attemptId: "new", batchKey: "new", schema: grown, schemaDigest: "sha256:grown", rows: [{ title: "new", later: "retained" }] });
    await expect(store.appendBatch(incoming)).rejects.toThrow("exclusion policy unknown; restart before schema growth");
    expect(await store.getPage({ runId: "run", datasetId: "items" })).toEqual(before);
    await store.appendBatch({ ...incoming, startsOver: true });
    expect((await store.getPage({ runId: "run", datasetId: "items" }))?.rows).toEqual(incoming.rows);
  });
});
