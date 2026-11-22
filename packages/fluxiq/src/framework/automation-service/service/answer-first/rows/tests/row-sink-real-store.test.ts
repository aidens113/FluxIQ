// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectAdministration, AutomationStudioProjectDatabasePool, AutomationStudioProjectRuntimeStreamStore } from "../../../../../persistence/automation/index.ts";
import { AutomationStudioProjectPaths } from "../../../paths/index.ts";
import { AutomationStudioProjectStore } from "../../../projects/index.ts";
import { AutomationStudioRunDatasets } from "../../../datasets/index.ts";
import { automationStudioAnswerFirstRowSink } from "../index.ts";
import { call, item, liveAnswer, READ_ROWS_KEY } from "./support.ts";
import { resultPipeline } from "../../result-feed/tests/pipeline.ts";

const PROJECT = "project.rows";
const RUN = "run.exploration";
let rootDir = "";
const pools: AutomationStudioProjectDatabasePool[] = [];

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-answer-first-rows-test-"));
});

afterEach(async () => {
  for (const pool of pools.splice(0)) await pool.closeAll();
  await rm(rootDir, { recursive: true, force: true });
});

async function open(): Promise<AutomationStudioRunDatasets> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  pools.push(pool);
  const projects = new AutomationStudioProjectStore(new AutomationStudioProjectPaths(path.join(rootDir, "projects")));
  await projects.writeProjectIndex(() => ({ categories: [], projects: [{ id: PROJECT, name: "Rows", description: "", createdAt: 1, updatedAt: 1 }] }));
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: PROJECT });
  const lease = await pool.acquire(PROJECT);
  await lease.database.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values (?, 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)", ["flow.a"]);
  const runtime = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
  await runtime.upsertRunSummary({ schemaVersion: "0.1", runId: RUN, flowId: "flow.a", projectId: PROJECT, status: "running", startedAt: 10, updatedAt: 10, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 0, interventionCount: 0, adaptationCount: 0 });
  await runtime.close();
  await lease.release();
  await admin.close();
  return new AutomationStudioRunDatasets(projects, pool);
}

/** A sink over the real datasets, the session open: nothing processed until a test says so. */
function sinkOf(datasets: AutomationStudioRunDatasets) {
  return automationStudioAnswerFirstRowSink({
    runId: RUN,
    readRowsKey: READ_ROWS_KEY,
    onRecordBatch: datasets.recordBatchHandler(PROJECT, RUN),
    reader: {
      listDatasets: () => datasets.listRunDatasetsForVerification({ projectId: PROJECT, runId: RUN }),
      getPage: (page) => datasets.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: page.datasetId, limit: page.limit, ...(page.cursor !== undefined ? { cursor: page.cursor } : {}) })
    }
  });
}

describe("the ledger answer on the real run datasets", () => {
  it("reloads an actual zero-row read's schema and dataset identity without treating it as missing input", async () => {
    const datasets = await open();
    const sink = sinkOf(datasets);
    const answer = liveAnswer([]);
    answer.recordSchema = { schemaVersion: "0.1", primaryKey: ["title"], fields: [{ id: "title", label: "Title", valueType: "string", semanticType: "id" }] };
    const stored = await sink.fromCall(call("empty"), answer);
    if (!stored?.datasetId) throw new Error("Known empty read lost its dataset identity");
    await datasets.processRunDatasets({ projectId: PROJECT, runId: RUN });
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    pools.push(pool);
    const projects = new AutomationStudioProjectStore(new AutomationStudioProjectPaths(path.join(rootDir, "projects")));
    const restored = new AutomationStudioRunDatasets(projects, pool);
    const page = await restored.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: stored.datasetId }, { retained: "answer" });
    expect(page).toMatchObject({ rows: [], schema: answer.recordSchema, summary: { datasetId: stored.datasetId, recordCount: 0 } });
    expect(await restored.readRunDatasetEvidence({ projectId: PROJECT, runId: RUN })).toEqual([{ datasetId: stored.datasetId, batchKey: "read/empty" }]);
  });

  it("publishes all pages and a reread in exact page order, including exports and source provenance", async () => {
    const datasets = await open();
    const p = resultPipeline(undefined, datasets.recordBatchHandler(PROJECT, RUN));
    await p.read({ source: "s1", place: "page=2", rows: [item(3)] });
    await p.read({ source: "s2", position: 2, place: "page=1", rows: [item(1), item(2)] });
    await p.sink.publish(p.feed.rows(), p.feed.evidence());
    await p.read({ source: "s3", position: 3, place: "page=1", rows: [{ ...item(2), price: 90 }, item(1)] });
    const answer = p.feed.rows();
    await p.sink.publish(answer, p.feed.evidence());
    await datasets.processEndedRunDatasets({ projectId: PROJECT, runId: RUN });
    const page = await datasets.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: answer.datasetId!, limit: 100 });
    expect(page?.rows).toEqual(answer.rows);
    expect(page?.rows).toEqual([{ ...item(2), price: 90 }, item(1), item(3)]);
    const exported = await datasets.exportRunDataset({ projectId: PROJECT, runId: RUN, datasetId: answer.datasetId!, format: "json" });
    if (!exported || exported.tooLarge) throw new Error("No inline export");
    expect(JSON.parse(exported.body)).toEqual(answer.rows);
    expect(exported.body).not.toContain("capture");
    const captured = await datasets.readRunDatasetEvidence({ projectId: PROJECT, runId: RUN });
    const provenance = captured.find((entry) => entry.datasetId === answer.datasetId)?.evidence;
    expect(provenance?.pages).toEqual(p.feed.evidence().pages);
    expect(page?.schema.fields.map((field) => field.id)).toEqual(["title", "price"]);
  });

  it.each([false, { by: ["title"] }])("keeps projected twins unless the declared processing requests dedupe: %j", async (dedupe) => {
    const datasets = await open();
    const p = resultPipeline(undefined, datasets.recordBatchHandler(PROJECT, RUN));
    await p.read({ source: "s1", place: "offset=0", value: p.input([], undefined, { dedupe }), rows: [{ ...item(1), link: "first" }, { ...item(1), link: "second" }] });
    const answer = p.feed.rows();
    await p.sink.publish(answer, p.feed.evidence());
    await datasets.processEndedRunDatasets({ projectId: PROJECT, runId: RUN });
    const page = await datasets.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: answer.datasetId!, limit: 100 });
    expect(answer.totalRows).toBe(dedupe === false ? 2 : 1);
    expect(page?.rows).toEqual(answer.rows);
    expect(page?.rows).toHaveLength(answer.totalRows);
  });

  it("retains a genuine empty page and distinguishes it from missing legacy evidence after restart", async () => {
    const datasets = await open();
    const p = resultPipeline(undefined, datasets.recordBatchHandler(PROJECT, RUN));
    await p.read({ source: "s1", place: "page=1", rows: [item(1)] });
    await p.read({ source: "s2", place: "page=2", position: 2, rows: [] });
    const answer = p.feed.rows();
    await p.sink.publish(answer, p.feed.evidence());
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    pools.push(pool);
    const projects = new AutomationStudioProjectStore(new AutomationStudioProjectPaths(path.join(rootDir, "projects")));
    const restored = new AutomationStudioRunDatasets(projects, pool);
    const entries = await restored.readRunDatasetEvidence({ projectId: PROJECT, runId: RUN });
    expect(entries.find((entry) => entry.datasetId === "read.s1")?.evidence).toBeUndefined();
    const evidence = entries.find((entry) => entry.datasetId === answer.datasetId)?.evidence;
    expect(evidence?.pages).toEqual(p.feed.evidence().pages);
    expect((evidence?.pages as Array<{ place: string; kept: number }>).map((page) => [page.place, page.kept])).toEqual([["page=1", 1], ["page=2", 0]]);
  });

  it("a real store refusal is visible and contributes no capture or answer page", async () => {
    const datasets = await open();
    const sink = sinkOf(datasets);
    const lease = await pools[0]!.acquire(PROJECT);
    try { await lease.database.run("create trigger refuse_raw_read before insert on run_dataset_batches begin select raise(abort, 'fixture refuses capture'); end"); } finally { await lease.release(); }
    expect(await sink.fromCall(call("lost"), liveAnswer([item(1)]))).toMatchObject({ rows: [], failure: { code: "answer_first.rows_not_stored" } });
    expect(await datasets.listRunDatasetsForVerification({ projectId: PROJECT, runId: RUN })).toEqual([]);
    expect(sink.readsAnswered()).toBe(0);
  });
});
