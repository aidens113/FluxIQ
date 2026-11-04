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

  it("reports a store the real datasets refuse as data, and counts nothing", async () => {
    const datasets = await open();
    const sink = automationStudioAnswerFirstRowSink({ runId: RUN, readRowsKey: READ_ROWS_KEY, onRecordBatch: datasets.recordBatchHandler("project.unknown", RUN) });
    const result = await sink.fromCall(call("call.1"), liveAnswer([item(1)]));
    expect(result).toMatchObject({ rows: [], failure: { code: "answer_first.rows_not_stored" } });
    expect(sink.summary().totalRows).toBe(0);
  });
});
