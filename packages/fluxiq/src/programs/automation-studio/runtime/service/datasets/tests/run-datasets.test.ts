import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  AUTOMATION_STUDIO_RUN_DATASET_EXPORT_LIMITS,
  encodeAutomationStudioRecordsCsvHeader,
  encodeAutomationStudioRecordsCsvRows,
  type AutomationStudioRecordSchema
} from "@fluxiq/contracts/automation-studio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioRecordBatch } from "../../../executor/index.ts";
import {
  AutomationStudioProjectAdministration,
  AutomationStudioProjectDatabasePool,
  AutomationStudioProjectRunDatasetStore,
  AutomationStudioProjectRuntimeStreamStore,
  type AutomationStudioRunDatasetRow
} from "../../../../storage/index.ts";
import { AutomationStudioProjectPaths } from "../../paths/index.ts";
import { AutomationStudioProjectStore } from "../../projects/index.ts";
import { AutomationStudioRunDatasets } from "../run-datasets.ts";
import type { AutomationStudioRunDatasetExportLimits, AutomationStudioRunDatasetStream } from "../types.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-run-datasets-collaborator-test");
const PROJECT = "project.datasets";
const RUN = "run.a";
const UNAVAILABLE = "Run datasets require project storage.";

const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "title", label: "Title", valueType: "string", required: true },
    { id: "price", label: "Price", valueType: "number" }
  ]
};
// The stable JSON of SCHEMA written out by hand: keys sorted, no exclude field.
const SCHEMA_STABLE_JSON = "{\"fields\":[{\"id\":\"title\",\"label\":\"Title\",\"required\":true,\"valueType\":\"string\"},{\"id\":\"price\",\"label\":\"Price\",\"valueType\":\"number\"}],\"schemaVersion\":\"0.1\"}";
const SCHEMA_DIGEST = `sha256:${createHash("sha256").update(SCHEMA_STABLE_JSON).digest("hex")}`;

type RunSeed = { runId: string; flowId: string; status?: "succeeded" | "failed" };
type Fixture = { pool: AutomationStudioProjectDatabasePool; projects: AutomationStudioProjectStore; datasets: AutomationStudioRunDatasets };
type AuditView = { eventType: string; runId: string; datasetId?: string; actorId?: string; format?: string; rowCount: number; byteCount: number };

const pools: AutomationStudioProjectDatabasePool[] = [];

describe("AutomationStudioRunDatasets", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });

  afterEach(async () => {
    for (const pool of pools.splice(0)) await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("is unavailable without a project database pool, and every method fails closed", async () => {
    const datasets = new AutomationStudioRunDatasets(new AutomationStudioProjectStore(new AutomationStudioProjectPaths(undefined)), undefined);
    expect(datasets.available).toBe(false);
    await expect(datasets.recordBatchHandler(PROJECT, RUN)(batch())).rejects.toThrow(UNAVAILABLE);
    await expect(datasets.listRunDatasets({ projectId: PROJECT, runId: RUN })).rejects.toThrow(UNAVAILABLE);
    await expect(datasets.exportRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "csv" })).rejects.toThrow(UNAVAILABLE);
    await expect(datasets.streamRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "csv" })).rejects.toThrow(UNAVAILABLE);
  });

  it("stores a batch under its run with the digest of the stored schema, whatever the key order or excluded fields", async () => {
    const { datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    expect(datasets.available).toBe(true);
    const declared: AutomationStudioRecordSchema = {
      fields: [
        { valueType: "string", required: true, label: "Title", id: "title" },
        { id: "session", label: "Session", valueType: "string", handling: "exclude" },
        { label: "Price", id: "price", valueType: "number" }
      ],
      schemaVersion: "0.1"
    };
    const handler = datasets.recordBatchHandler(PROJECT, RUN);
    const summary = await handler(batch({ schema: declared, rows: items(2) }));
    expect(summary).toEqual({ runId: RUN, datasetId: "listings", label: "Listings", nodeIds: ["extract"], schemaDigest: SCHEMA_DIGEST, recordCount: 2, truncated: false, invalidCount: 0, updatedAt: expect.any(Number) });
    await expect(datasets.listRunDatasets({ projectId: PROJECT, runId: RUN })).resolves.toEqual([summary]);
    await expect(datasets.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: "listings" })).resolves.toEqual({ summary, schema: SCHEMA, rows: items(2), nextCursor: null });

    // The same schema written without the excluded field and in another key order has the same digest, so the store accepts it.
    const again = await handler(batch({ attemptId: "extract.attempt.2", batchKey: "extract.attempt.2", schema: SCHEMA, rows: items(1, "more") }));
    expect(again).toMatchObject({ schemaDigest: SCHEMA_DIGEST, recordCount: 3 });
  });

  it("keeps batches with different batch keys apart and replaces a batch that reuses its key", async () => {
    const { datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    const handler = datasets.recordBatchHandler(PROJECT, RUN);
    await handler(batch({ rows: items(2, "parent") }));
    // A Call Flow child's capture: the same node and attempt ids, a different batch key.
    await handler(batch({ batchKey: "call.attempt.2/extract.attempt.1", rows: items(2, "child") }));
    await expect(datasets.listRunDatasets({ projectId: PROJECT, runId: RUN })).resolves.toMatchObject([{ recordCount: 4 }]);
    await handler(batch({ rows: items(1, "rerun") }));
    const page = required(await datasets.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: "listings" }));
    expect(page.rows.map((row) => row.title).sort()).toEqual(["child 1", "child 2", "rerun 1"]);
  });

  it("throws, failing the attempt, when the store refuses the batch or cannot be opened", async () => {
    const { pool, datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    await expect(datasets.recordBatchHandler(PROJECT, "run.unknown")(batch())).rejects.toThrow();
    await pool.closeAll();
    await expect(datasets.recordBatchHandler(PROJECT, RUN)(batch())).rejects.toThrow("pool is closing");
  });

  it("pages rows through the shared page limit and answers null for an unknown dataset", async () => {
    const { datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    await datasets.recordBatchHandler(PROJECT, RUN)(batch({ rows: items(205) }));
    const first = required(await datasets.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: "listings", limit: 999 }));
    expect(first.rows).toHaveLength(200);
    const second = required(await datasets.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: "listings", limit: 999, cursor: first.nextCursor }));
    expect(second.rows.map((row) => row.title)).toEqual(["item 201", "item 202", "item 203", "item 204", "item 205"]);
    expect(second.nextCursor).toBeNull();
    await expect(datasets.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: "missing" })).resolves.toBeNull();
  });

  it("exports inline CSV with formula escaping, only after writing its exported audit event", async () => {
    const { pool, datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    await datasets.recordBatchHandler(PROJECT, RUN)(batch({ rows: [{ title: "=HYPERLINK(\"x\")", price: 1 }, { title: "Chair, oak", price: 2 }] }));
    const body = "Title,Price\r\n\"'=HYPERLINK(\"\"x\"\")\",1\r\n\"Chair, oak\",2\r\n";
    await expect(datasets.exportRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "csv", actorId: "user.1" })).resolves.toEqual({
      tooLarge: false,
      format: "csv",
      fileName: "fluxiq-dataset-run.a-listings.csv",
      contentType: "text/csv; charset=utf-8",
      body,
      rowCount: 2,
      byteCount: Buffer.byteLength(body)
    });
    await expect(auditEvents(pool)).resolves.toEqual([{ eventType: "exported", runId: RUN, datasetId: "listings", actorId: "user.1", format: "csv", rowCount: 2, byteCount: Buffer.byteLength(body) }]);

    await expect(datasets.exportRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "missing", format: "csv", actorId: "user.1" })).resolves.toBeNull();
    await expect(datasets.exportRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "xml" as "csv" })).rejects.toThrow("Invalid run dataset export format.");
    await expect(auditEvents(pool)).resolves.toHaveLength(1);
  });

  it("exports inline JSON holding the stored fields, and an empty dataset as an empty array or a header", async () => {
    const { datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    const handler = datasets.recordBatchHandler(PROJECT, RUN);
    await handler(batch({ rows: items(2) }));
    await handler(batch({ datasetId: "empty", batchKey: "empty.attempt.1", attemptId: "empty.attempt.1", rows: [] }));
    const json = inline(await datasets.exportRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "json" }));
    expect(JSON.parse(json.body)).toEqual(items(2));
    expect(json).toMatchObject({ fileName: "fluxiq-dataset-run.a-listings.json", contentType: "application/json; charset=utf-8", rowCount: 2 });
    expect(inline(await datasets.exportRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "empty", format: "json" }))).toMatchObject({ body: "[]", rowCount: 0, byteCount: 2 });
    expect(inline(await datasets.exportRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "empty", format: "csv" }))).toMatchObject({ body: "Title,Price\r\n", rowCount: 0 });
  });

  it("exports 10,000 rows inline and answers tooLarge at 10,001 with the stream path and no audit event", { timeout: 120_000 }, async () => {
    const { pool, datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    const handler = datasets.recordBatchHandler(PROJECT, RUN);
    await handler(batch({ rows: items(AUTOMATION_STUDIO_RUN_DATASET_EXPORT_LIMITS.inlineMaxRows) }));
    expect(await datasets.exportRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "csv" })).toMatchObject({ tooLarge: false, rowCount: 10_000 });
    await handler(batch({ attemptId: "extract.attempt.2", batchKey: "extract.attempt.2", rows: items(1, "extra") }));
    await expect(datasets.exportRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "csv", actorId: "user.1" })).resolves.toEqual({
      tooLarge: true,
      format: "csv",
      rowCount: 10_001,
      downloadPath: "/api/programs/automation-studio/run-datasets/project.datasets/run.a/listings?format=csv"
    });
    await expect(auditEvents(pool)).resolves.toMatchObject([{ eventType: "exported", rowCount: 10_000 }]);
  });

  it("answers tooLarge when the inline body would pass the byte cap, and exports a body exactly at it", async () => {
    const { pool, projects, datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    await datasets.recordBatchHandler(PROJECT, RUN)(batch({ rows: items(3) }));
    const body = encodeAutomationStudioRecordsCsvHeader(SCHEMA) + encodeAutomationStudioRecordsCsvRows(SCHEMA, items(3));
    const exact = new AutomationStudioRunDatasets(projects, pool, limits({ inlineMaxBytes: Buffer.byteLength(body) }));
    expect(inline(await exact.exportRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "csv" }))).toMatchObject({ body, rowCount: 3 });
    const under = new AutomationStudioRunDatasets(projects, pool, limits({ inlineMaxBytes: Buffer.byteLength(body) - 1 }));
    await expect(under.exportRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "csv" })).resolves.toMatchObject({ tooLarge: true, rowCount: 3 });
    await expect(auditEvents(pool)).resolves.toHaveLength(1);
  });

  it("writes export_failed and rethrows when an inline export cannot read its rows", async () => {
    const { pool, datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    await datasets.recordBatchHandler(PROJECT, RUN)(batch({ rows: items(2) }));
    await dropRowsTable(pool);
    await expect(datasets.exportRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "csv", actorId: "user.1" })).rejects.toThrow("run_dataset_rows");
    await expect(auditEvents(pool)).resolves.toEqual([{ eventType: "export_failed", runId: RUN, datasetId: "listings", actorId: "user.1", format: "csv", rowCount: 0, byteCount: 0 }]);
  });

  it("streams CSV in 500-row pages and writes one exported event when the body completes", async () => {
    const { pool, datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    await datasets.recordBatchHandler(PROJECT, RUN)(batch({ rows: items(1_001) }));
    await expect(datasets.streamRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "missing", format: "csv" })).resolves.toBeNull();
    const stream = required(await datasets.streamRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "csv", actorId: "user.1" }));
    expect(stream).toMatchObject({ format: "csv", fileName: "fluxiq-dataset-run.a-listings.csv", contentType: "text/csv; charset=utf-8" });
    const chunks = await collect(stream);
    const expected = encodeAutomationStudioRecordsCsvHeader(SCHEMA) + encodeAutomationStudioRecordsCsvRows(SCHEMA, items(1_001));
    expect(chunks).toHaveLength(4);
    expect(chunks.join("")).toBe(expected);
    await expect(auditEvents(pool)).resolves.toEqual([{ eventType: "exported", runId: RUN, datasetId: "listings", actorId: "user.1", format: "csv", rowCount: 1_001, byteCount: Buffer.byteLength(expected) }]);
    expect(pool.stats().openProjects).toBe(0);
  });

  it("ends a stream on the last whole row within the byte cap and records export_truncated", async () => {
    const { pool, projects, datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    await datasets.recordBatchHandler(PROJECT, RUN)(batch({ rows: items(3) }));
    const capped = new AutomationStudioRunDatasets(projects, pool, limits({ streamMaxBytes: Buffer.byteLength(jsonBody(items(3))) - 1 }));
    const text = (await collect(required(await capped.streamRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "json", actorId: "user.1" })))).join("");
    expect(text).toBe(jsonBody(items(2)));
    expect(JSON.parse(text)).toEqual(items(2));
    await expect(auditEvents(pool)).resolves.toEqual([{ eventType: "export_truncated", runId: RUN, datasetId: "listings", actorId: "user.1", format: "json", rowCount: 2, byteCount: Buffer.byteLength(text) }]);
  });

  it("opens nothing until a stream is read, and records export_failed and releases the store when the consumer stops early", async () => {
    const { pool, datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    await datasets.recordBatchHandler(PROJECT, RUN)(batch({ rows: items(2) }));
    const stream = required(await datasets.streamRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "csv", actorId: "user.1" }));
    expect(pool.stats().openProjects).toBe(0);
    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ done: false, value: "Title,Price\r\n" });
    expect(pool.stats().openProjects).toBe(1);
    await iterator.return?.();
    expect(pool.stats().openProjects).toBe(0);
    await expect(auditEvents(pool)).resolves.toEqual([{ eventType: "export_failed", runId: RUN, datasetId: "listings", actorId: "user.1", format: "csv", rowCount: 0, byteCount: Buffer.byteLength("Title,Price\r\n") }]);
  });

  it("records export_failed with what was sent and rethrows when a stream cannot read its rows", async () => {
    const { pool, datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    await datasets.recordBatchHandler(PROJECT, RUN)(batch({ rows: items(2) }));
    const stream = required(await datasets.streamRunDataset({ projectId: PROJECT, runId: RUN, datasetId: "listings", format: "csv", actorId: "user.1" }));
    await dropRowsTable(pool);
    await expect(collect(stream)).rejects.toThrow("run_dataset_rows");
    expect(pool.stats().openProjects).toBe(0);
    await expect(auditEvents(pool)).resolves.toEqual([{ eventType: "export_failed", runId: RUN, datasetId: "listings", actorId: "user.1", format: "csv", rowCount: 0, byteCount: Buffer.byteLength("Title,Price\r\n") }]);
  });

  it("deletes one dataset or every dataset of a run, naming the actor on each deleted event", async () => {
    const { pool, datasets } = await openFixture([{ runId: RUN, flowId: "flow.a" }]);
    const handler = datasets.recordBatchHandler(PROJECT, RUN);
    await handler(batch({ rows: items(2) }));
    await handler(batch({ datasetId: "prices", batchKey: "prices.attempt.1", attemptId: "prices.attempt.1", rows: items(3) }));
    await expect(datasets.deleteRunDatasets({ projectId: PROJECT, runId: RUN, datasetId: "prices", actorId: "user.1" })).resolves.toEqual({ datasetCount: 1, rowCount: 3 });
    await expect(datasets.listRunDatasets({ projectId: PROJECT, runId: RUN })).resolves.toMatchObject([{ datasetId: "listings" }]);
    await expect(datasets.deleteRunDatasets({ projectId: PROJECT, runId: RUN, actorId: "user.1" })).resolves.toEqual({ datasetCount: 1, rowCount: 2 });
    await expect(datasets.listRunDatasets({ projectId: PROJECT, runId: RUN })).resolves.toEqual([]);
    await expect(auditEvents(pool)).resolves.toEqual([
      { eventType: "deleted", runId: RUN, datasetId: "listings", actorId: "user.1", rowCount: 2, byteCount: 0 },
      { eventType: "deleted", runId: RUN, datasetId: "prices", actorId: "user.1", rowCount: 3, byteCount: 0 }
    ]);
  });

  it("lists the project's tables for a Flow and a table's runs by status", async () => {
    const { datasets } = await openFixture([
      { runId: "run.a", flowId: "flow.a" },
      { runId: "run.b", flowId: "flow.a", status: "failed" },
      { runId: "run.c", flowId: "flow.b" }
    ]);
    await datasets.recordBatchHandler(PROJECT, "run.a")(batch());
    await datasets.recordBatchHandler(PROJECT, "run.b")(batch());
    await datasets.recordBatchHandler(PROJECT, "run.c")(batch({ datasetId: "other" }));
    const tables = await datasets.listProjectDatasets({ projectId: PROJECT, flowId: "flow.a" });
    expect(tables).toMatchObject({ datasets: [{ flowId: "flow.a", datasetId: "listings", runCount: 2 }], nextCursor: null });
    await expect(datasets.listProjectDatasets({ projectId: PROJECT, search: "OTH" })).resolves.toMatchObject({ datasets: [{ flowId: "flow.b", datasetId: "other" }] });
    const runs = await datasets.listDatasetRuns({ projectId: PROJECT, flowId: "flow.a", datasetId: "listings", status: "failed" });
    expect(runs.runs.map((run) => run.runId)).toEqual(["run.b"]);
  });

  it("refuses an unknown project before opening a database for it", async () => {
    const { datasets } = await openFixture([]);
    await expect(datasets.listRunDatasets({ projectId: "project.unknown", runId: RUN })).rejects.toThrow("Unknown Automation Studio project: project.unknown");
    await expect(datasets.streamRunDataset({ projectId: "project.unknown", runId: RUN, datasetId: "listings", format: "csv" })).rejects.toThrow("Unknown Automation Studio project");
    expect(existsSync(path.join(rootDir, "projects", "project.unknown"))).toBe(false);
  });
});

function batch(overrides: Partial<AutomationStudioRecordBatch> = {}): AutomationStudioRecordBatch {
  return {
    nodeId: "extract",
    attemptId: "extract.attempt.1",
    batchKey: "extract.attempt.1",
    datasetId: "listings",
    label: "Listings",
    writeMode: "append",
    schema: SCHEMA,
    rows: items(2),
    invalidCount: 0,
    truncated: false,
    ...overrides
  };
}

function items(count: number, prefix = "item"): AutomationStudioRunDatasetRow[] {
  return Array.from({ length: count }, (_, index) => ({ title: `${prefix} ${index + 1}`, price: index + 1 }));
}

function jsonBody(rows: AutomationStudioRunDatasetRow[]): string {
  return `[${rows.map((row, index) => `${index === 0 ? "\n" : ",\n"}${JSON.stringify(row)}`).join("")}${rows.length === 0 ? "]" : "\n]"}`;
}

function limits(overrides: Partial<AutomationStudioRunDatasetExportLimits>): AutomationStudioRunDatasetExportLimits {
  return { ...AUTOMATION_STUDIO_RUN_DATASET_EXPORT_LIMITS, ...overrides };
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected a value.");
  return value;
}

function inline<T extends { tooLarge: boolean }>(value: T | null): Extract<T, { tooLarge: false }> {
  const exported = required(value);
  if (exported.tooLarge) throw new Error("Expected an inline export.");
  return exported as Extract<T, { tooLarge: false }>;
}

async function collect(stream: AutomationStudioRunDatasetStream): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

async function openFixture(runs: RunSeed[]): Promise<Fixture> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  pools.push(pool);
  const projects = new AutomationStudioProjectStore(new AutomationStudioProjectPaths(path.join(rootDir, "projects")));
  await projects.writeProjectIndex(() => ({ categories: [], projects: [{ id: PROJECT, name: "Datasets", description: "", createdAt: 1, updatedAt: 1 }] }));
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
  return { pool, projects, datasets: new AutomationStudioRunDatasets(projects, pool) };
}

function runSummary(run: RunSeed): Parameters<AutomationStudioProjectRuntimeStreamStore["upsertRunSummary"]>[0] {
  return {
    schemaVersion: "0.1",
    runId: run.runId,
    flowId: run.flowId,
    projectId: PROJECT,
    status: run.status ?? "succeeded",
    startedAt: 10,
    finishedAt: 100,
    updatedAt: 100,
    routeDecisionCount: 0,
    subflowEntryCount: 0,
    actionAttemptCount: 0,
    interventionCount: 0,
    adaptationCount: 0
  };
}

async function auditEvents(pool: AutomationStudioProjectDatabasePool): Promise<AuditView[]> {
  const store = await AutomationStudioProjectRunDatasetStore.open({ pool, projectId: PROJECT });
  try {
    const events = await store.listAuditEvents({ runId: RUN });
    return events
      .map(({ eventId: _eventId, createdAt: _createdAt, ...event }) => event)
      .sort((left, right) => (left.datasetId ?? "").localeCompare(right.datasetId ?? ""));
  } finally {
    await store.close();
  }
}

async function dropRowsTable(pool: AutomationStudioProjectDatabasePool): Promise<void> {
  const lease = await pool.acquire(PROJECT);
  try {
    await lease.database.run("drop table run_dataset_rows");
  } finally {
    await lease.release();
  }
}
