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

describe("automationStudioAnswerFirstRowSink over the real run datasets", () => {
  it("adds two pages of one read into one dataset and reads back the processed answer", async () => {
    const datasets = await open();
    const sink = automationStudioAnswerFirstRowSink({
      runId: RUN,
      readRowsKey: READ_ROWS_KEY,
      onRecordBatch: datasets.recordBatchHandler(PROJECT, RUN),
      reader: {
        listDatasets: () => datasets.listRunDatasetsForVerification({ projectId: PROJECT, runId: RUN }),
        getPage: (page) => datasets.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: page.datasetId, limit: page.limit, ...(page.cursor !== undefined ? { cursor: page.cursor } : {}) }),
        process: () => datasets.processEndedRunDatasets({ projectId: PROJECT, runId: RUN })
      }
    });
    await sink.fromCall(call("call.1", "web.read", { target: "list", page: 1 }), liveAnswer([item(1), item(2)]));
    await sink.fromCall(call("call.2", "web.read", { target: "list", page: 2 }), liveAnswer([item(2), item(3)]));

    const stored = await datasets.listRunDatasets({ projectId: PROJECT, runId: RUN });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ recordCount: 4 });

    const back = await sink.readBack();
    expect(back.fromStore).toBe(true);
    expect(back).toMatchObject({ datasetId: stored[0]!.datasetId, totalRows: 3, truncated: false, columns: [{ id: "title" }, { id: "price" }] });
    expect(back.rows).toEqual([item(1), item(2), item(3)]);
    expect(back.rows).toEqual(sink.summary().rows);
  });

  it("a re-read is what the store holds, in that order, and processing keeps it", async () => {
    const datasets = await open();
    const sink = sinkOf(datasets);
    await sink.fromCall(call("call.1"), liveAnswer([item(1), item(2), item(3)]));
    await sink.fromCall(call("call.2"), liveAnswer([item(3), item(1)]));
    const judged = await sink.readBack();
    expect(judged).toMatchObject({ fromStore: true, totalRows: 2, rows: [item(3), item(1)], fewerThanEarlier: { earlierRows: 3 } });
    await datasets.processEndedRunDatasets({ projectId: PROJECT, runId: RUN });
    expect(await sink.readBack()).toMatchObject({ fromStore: true, totalRows: 2, rows: judged.rows, fewerThanEarlier: { earlierRows: 3 } });
  });

  it("a row changed in place on one of two pages is one row, in its place, in the store too", async () => {
    const datasets = await open();
    const sink = sinkOf(datasets);
    await sink.fromCall(call("call.1"), liveAnswer([item(1), item(2)]));
    await sink.fromCall(call("call.2"), liveAnswer([item(3)]));
    await sink.fromCall(call("call.3"), liveAnswer([{ ...item(1), price: 90 }, item(2)]));
    expect((await sink.readBack()).rows).toEqual([{ ...item(1), price: 90 }, item(2), item(3)]);
    expect(sink.summary().rows).toEqual((await sink.readBack()).rows);
  });

  it("a run's declared sort reaches the judge, with the attempt still open, as it will reach the person", async () => {
    const datasets = await open();
    const sink = sinkOf(datasets);
    const schema = { schemaVersion: "0.1" as const, fields: [{ id: "title", label: "Title", valueType: "string" as const }, { id: "price", label: "Price", valueType: "number" as const }] };
    await sink.recordBatch({ nodeId: "node.read", attemptId: "a", batchKey: "a", datasetId: "shelves", writeMode: "append", schema, rows: [item(2), item(1), item(3)], invalidCount: 0, truncated: false, process: { sort: [{ field: "price", order: "desc", as: "number" }] } });
    const judged = await sink.readBack();
    expect(judged.rows).toEqual([item(3), item(2), item(1)]);
    await datasets.processEndedRunDatasets({ projectId: PROJECT, runId: RUN });
    expect((await sink.readBack()).rows).toEqual(judged.rows);
    expect(sink.summary().rows).toEqual(judged.rows);
  });

  it("the columns the request names are the answer the store serves, judged and processed, and the read is collected whole (run-mwb2kkv5-1baeee11)", async () => {
    const datasets = await open();
    const sink = automationStudioAnswerFirstRowSink({
      runId: RUN,
      readRowsKey: READ_ROWS_KEY,
      onRecordBatch: datasets.recordBatchHandler(PROJECT, RUN),
      reader: {
        listDatasets: () => datasets.listRunDatasetsForVerification({ projectId: PROJECT, runId: RUN }),
        getPage: (page) => datasets.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: page.datasetId, limit: page.limit, ...(page.cursor !== undefined ? { cursor: page.cursor } : {}) })
      },
      instructionText: "List every shelf the shop sells. Give me a table with columns title and price, where price is written like 12.50."
    });
    const shelf = (n: number) => ({ ...item(n), link: `https://shop.example/shelf/${n}` });
    await sink.fromCall(call("call.1"), liveAnswer([shelf(1), shelf(2)]));
    const [stored] = await datasets.listRunDatasets({ projectId: PROJECT, runId: RUN });
    // Collected whole: the link the read returned is stored with each row.
    const collected = await datasets.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: stored!.datasetId, limit: 10 });
    expect(collected?.rows).toEqual([shelf(1), shelf(2)]);
    // What the judge reads, the attempt still open, and what the person is shown once processed.
    const judged = await sink.readBack();
    expect(judged).toMatchObject({ fromStore: true, columns: [{ id: "title" }, { id: "price" }], rows: [item(1), item(2)] });
    await datasets.processEndedRunDatasets({ projectId: PROJECT, runId: RUN });
    const answered = await datasets.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: stored!.datasetId, limit: 10 });
    expect(answered?.schema.fields.map((field) => field.id)).toEqual(["title", "price"]);
    expect(answered?.rows).toEqual([item(1), item(2)]);
    expect((await sink.readBack()).rows).toEqual(judged.rows);
  });

  it("reports a store the real datasets refuse as data, and counts nothing", async () => {
    const datasets = await open();
    const sink = automationStudioAnswerFirstRowSink({ runId: RUN, readRowsKey: READ_ROWS_KEY, onRecordBatch: datasets.recordBatchHandler("project.unknown", RUN) });
    const result = await sink.fromCall(call("call.1"), liveAnswer([item(1)]));
    expect(result).toMatchObject({ rows: [], failure: { code: "answer_first.rows_not_stored" } });
    expect(sink.summary().totalRows).toBe(0);
  });
});
