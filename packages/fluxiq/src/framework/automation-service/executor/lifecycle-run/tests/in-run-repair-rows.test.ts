// @fluxiq-test-group real-sql
// What an in-run repair leaves in the run's dataset: real graph runs and the real
// project store, with a fake repair callback. No model.
//
// A part an in-run repair replaces runs again from its start under attempt ids of
// its own, so what it stored before its contract broke used to stay beside what the
// fix stored: a wrong row was judged again, and a right one kept its old place.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import { fact, line, page, pageOptions } from "../../../../../engine/automation/lifecycle-run/tests/wiring-fixtures.ts";
import { repairer } from "../../../../../engine/automation/lifecycle-run/tests/in-run-repair-fixtures.ts";
import { AutomationStudioProjectAdministration, AutomationStudioProjectDatabasePool, AutomationStudioProjectRuntimeStreamStore } from "../../../../persistence/automation/index.ts";
import { AutomationStudioProjectPaths } from "../../../service/paths/index.ts";
import { AutomationStudioProjectStore } from "../../../service/projects/index.ts";
import { AutomationStudioRunDatasets } from "../../../service/datasets/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../index.ts";
import { factHost, framedRun } from "./recovery-paths-fixtures.ts";

const PROJECT = "project.in-run-rows";
const RUN = "run.in-run-rows";
const DATASET = "listings";

const RECORD_OUTPUT: JsonObject = {
  datasetId: DATASET,
  recordsPath: "rows",
  writeMode: "append",
  schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }] }
};

/** A step that reads the list its dispatcher answers, and stores what it reads. */
const read = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: `read-${id}`, parameters: {}, recordOutput: RECORD_OUTPUT } });
const named = (...names: string[]) => names.map((name) => ({ name }));

let rootDir = "";
const pools: AutomationStudioProjectDatabasePool[] = [];

beforeEach(async () => { rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-in-run-rows-")); });
afterEach(async () => {
  for (const pool of pools.splice(0)) await pool.closeAll();
  await rm(rootDir, { recursive: true, force: true });
});

async function runDatasets(): Promise<AutomationStudioRunDatasets> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  pools.push(pool);
  const projects = new AutomationStudioProjectStore(new AutomationStudioProjectPaths(path.join(rootDir, "projects")));
  await projects.writeProjectIndex(() => ({ categories: [], projects: [{ id: PROJECT, name: "Rows", description: "", createdAt: 1, updatedAt: 1 }] }));
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: PROJECT });
  const lease = await pool.acquire(PROJECT);
  await lease.database.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow.rows', 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)");
  const runtime = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
  await runtime.upsertRunSummary({ schemaVersion: "0.1", runId: RUN, flowId: "flow.rows", projectId: PROJECT, status: "running", startedAt: 10, updatedAt: 100, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 0, interventionCount: 0, adaptationCount: 0 });
  await runtime.close();
  await lease.release();
  await admin.close();
  return new AutomationStudioRunDatasets(projects, pool);
}

/** Options that store through the real collaborator, as the service binds them. */
function storing(datasets: AutomationStudioRunDatasets, answers: Record<string, () => JsonObject[]>, child: AutomationStudioFlowDocument): AutomationStudioGraphExecutionOptions {
  const current = page();
  return pageOptions(current, {
    subflowGraphs: { load: async () => ({ subflowId: "child", graph: child, graphRevision: 1 }) },
    hostRuntime: factHost(current, () => "false"),
    onRecordBatch: datasets.recordBatchHandler(PROJECT, RUN),
    discardRecordBatches: datasets.batchDiscarder(PROJECT, RUN),
    effectDispatcher: (effect) => {
      const outputId = String((effect.payload as JsonObject | undefined)?.outputId).replace("read-", "");
      return { status: "success", route: "success", outputs: { result: { rows: answers[outputId]?.() ?? [] } } };
    }
  });
}

async function storedRows(datasets: AutomationStudioRunDatasets): Promise<JsonObject[] | undefined> {
  return (await datasets.getRunDatasetPage({ projectId: PROJECT, runId: RUN, datasetId: DATASET, limit: 200 }))?.rows;
}

const CALL: AutomationStudioFlowNode = { id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "child" } };

describe("an in-run repair of a part that stored rows before it broke", () => {
  it("leaves only the fix's rows of that part, and every row of the steps around it", async () => {
    const datasets = await runDatasets();
    const child = { ...line("graph.child", [read("inner")]), metadata: { "fluxiq.successCheck": [fact("done-right")] } };
    const fixed = { ...child, metadata: {} };
    let passes = 0;
    const answers = {
      before: () => named("before-part"),
      inner: () => ((passes += 1) === 1 ? named("wrong-row", "listing-7") : named("listing-0", "listing-7"))
    };
    const repair = repairer((request) => ({ kind: "overlay", repairId: "repair-part", unit: request.unit, graph: request.graph, partGraph: { subflowId: "child", graph: fixed } }));
    const { trace } = await framedRun(line("graph.parent", [read("before"), CALL]), { ...storing(datasets, answers, child), repairIncident: repair.callback });

    expect(repair.requests.map((request) => request.unit)).toEqual([{ kind: "part", subflowId: "child" }]);
    expect(trace.status).toBe("succeeded");
    expect(passes).toBe(2);
    expect(await storedRows(datasets)).toEqual(named("before-part", "listing-0", "listing-7"));
    const [processed] = await datasets.processRunDatasets({ projectId: PROJECT, runId: RUN });
    expect(processed).toMatchObject({ recordCount: 3, processing: { collected: 3, duplicates: 0, kept: 3 } });
  });

  it("leaves the trial's rows out too when the fix is dropped, so a failed fix's read is never an answer", async () => {
    const datasets = await runDatasets();
    const child = { ...line("graph.child", [read("inner")]), metadata: { "fluxiq.successCheck": [fact("done-right")] } };
    const answers = { before: () => named("before-part"), inner: () => named("listing-7") };
    const repair = repairer((request) => ({ kind: "overlay", repairId: "repair-part", unit: request.unit, graph: request.graph, partGraph: { subflowId: "child", graph: child } }));
    const { trace } = await framedRun(line("graph.parent", [read("before"), CALL]), { ...storing(datasets, answers, child), repairIncident: repair.callback });

    expect(trace.status).toBe("failed");
    expect(await storedRows(datasets)).toEqual(named("before-part"));
  });

  it("removes a dataset the part alone wrote, so the fix may store another schema under its id", async () => {
    const datasets = await runDatasets();
    const child = { ...line("graph.child", [read("inner")]), metadata: { "fluxiq.successCheck": [fact("done-right")] } };
    const wider = { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }, { id: "price", label: "Price", valueType: "string" }] };
    const fixed: AutomationStudioFlowDocument = { ...child, metadata: {}, nodes: child.nodes.map((node) => node.id === "inner" ? { ...node, parameterValues: { ...node.parameterValues, recordOutput: { ...RECORD_OUTPUT, schema: wider } } } : node) };
    let passes = 0;
    const answers = { inner: () => ((passes += 1) === 1 ? named("wrong-row") : [{ name: "listing-0", price: "1" }]) };
    const repair = repairer((request) => ({ kind: "overlay", repairId: "repair-part", unit: request.unit, graph: request.graph, partGraph: { subflowId: "child", graph: fixed } }));
    const { trace } = await framedRun(line("graph.parent", [CALL]), { ...storing(datasets, answers, child), repairIncident: repair.callback });

    expect(trace.status).toBe("succeeded");
    expect(await storedRows(datasets)).toEqual([{ name: "listing-0", price: "1" }]);
  });
});
