import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../../storage/index.ts";
import type { AutomationStudioRecordBatch } from "../../../executor/index.ts";
import { AutomationStudioService } from "../../../service.ts";

// The run datasets collaborator as `AutomationStudioService` wires it (K4c):
// the record-batch hook the service binds into `graphOptions.onRecordBatch`, and
// what a real run through the service persists. K4b covered the collaborator
// called directly; nothing there proved the service reaches it, so these rows
// run a Flow end to end and read the stored rows back through the service.

// Obviously synthetic: every assertion about these is where they must or must not travel.
const ROW = "synthetic-extracted-row-text";
const EXCLUDED = "synthetic-excluded-field-value";
const UNKNOWN = "synthetic-unknown-field-value";

const RECORD_OUTPUT: JsonObject = {
  datasetId: "listings",
  label: "Listings",
  recordsPath: "rows",
  writeMode: "append",
  schema: {
    schemaVersion: "0.1",
    fields: [
      { id: "title", label: "Title", valueType: "string", required: true },
      { id: "price", label: "Price", valueType: "number" },
      { id: "secret", label: "Secret", valueType: "string", handling: "exclude" }
    ]
  }
};

// What the output returns at `recordsPath`: one row carrying an excluded field
// and an unknown key, and one holding only the required field.
function dispatchedRows(): JsonObject[] {
  return [
    { title: ROW, price: 3, secret: EXCLUDED, extra: UNKNOWN },
    { title: `${ROW}-second` }
  ];
}

// The same rows after the allowlist copy: stored fields only, in schema order.
function validatedRows(): JsonObject[] {
  return [{ title: ROW, price: 3 }, { title: `${ROW}-second` }];
}

type ObservedBatch = { projectId: string; runId: string; batch: AutomationStudioRecordBatch };

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-run-datasets-wiring-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

// `beforeRows` runs after the output is asked and before it answers, which is
// the only window in which the run has loaded its Flow but has not yet stored
// any rows.
function startService(beforeRows?: () => Promise<void>): AutomationStudioService {
  const io = new IoRegistry();
  io.registerOutput("example", {
    definition: { id: "extract-list", title: "Extract list" },
    mode: "request",
    dispatch: async (request) => {
      await beforeRows?.();
      return { ok: true, domainId: "example", outputId: request.outputId, payload: { rows: dispatchedRows() } };
    }
  });
  const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example");
  services.add(service);
  return service;
}

// A canonical Flow whose primary Subflow dispatches the extracting output once,
// declaring where its records are.
async function extractionFlow(service: AutomationStudioService, projectId: string, flowId: string) {
  const flow = await service.createFlow({ projectId, flowId, name: flowId });
  const subflow = await service.createFlowSubflow({ projectId, flowId: flow.flowId, name: "Primary", role: "primary" });
  const blank = await service.getFlow(projectId, subflow.graphFlowId!);
  await service.saveFlow({
    projectId,
    flow: {
      ...blank,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "extract", definitionId: "builtin.policy.action", parameterValues: { outputId: "extract-list", parameters: {}, recordOutput: RECORD_OUTPUT } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [
        { id: "start.extract", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "extract", targetPortId: "in" },
        { id: "extract.end", sourceNodeId: "extract", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    }
  });
  await service.setFlowMapFallback({ projectId, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  return flow;
}

// Wraps the field the service binds its hook from, so a row can tell that the
// batch reached the store through `graphOptions.onRecordBatch` and under which
// project and run the service bound it.
function observeBatches(service: AutomationStudioService, seen: ObservedBatch[]): void {
  const datasets = service.runDatasets;
  const handlerFor = datasets.recordBatchHandler.bind(datasets);
  (datasets as { recordBatchHandler: typeof handlerFor }).recordBatchHandler = (projectId, runId) => {
    const handler = handlerFor(projectId, runId);
    return async (batch) => {
      seen.push({ projectId, runId, batch });
      return await handler(batch);
    };
  };
}

async function closeProjectStorage(service: AutomationStudioService): Promise<void> {
  await (service as unknown as { runtimeProjectDatabasePool?: AutomationStudioProjectDatabasePool }).runtimeProjectDatabasePool?.closeAll();
}

describe("the run datasets the service wires into a run", () => {
  it("binds no hook when there is no project storage to bind one to", () => {
    const service = new AutomationStudioService();
    services.add(service);

    expect(service.runDatasets.available).toBe(false);
  });

  it("stores the rows the run validated, through the hook, under the run that captured them", { timeout: 120_000 }, async () => {
    const service = startService();
    const project = await service.createProject({ name: "Datasets wiring", domainId: "example" });
    const flow = await extractionFlow(service, project.id, "flow.extract");
    const seen: ObservedBatch[] = [];
    observeBatches(service, seen);

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });

    // The hook fired once, through the options the service built for this run.
    expect(run.status).toBe("succeeded");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ projectId: project.id, runId: run.runId });
    expect(seen[0]?.batch).toMatchObject({ nodeId: "extract", datasetId: "listings", label: "Listings", writeMode: "append", invalidCount: 0, truncated: false });
    expect(seen[0]?.batch.rows).toEqual(validatedRows());

    // What the store holds is what the run validated, and nothing more.
    const page = await service.runDatasets.getRunDatasetPage({ projectId: project.id, runId: run.runId, datasetId: "listings" });
    expect(page?.rows).toEqual(validatedRows());
    expect(page?.rows).toEqual(seen[0]?.batch.rows);
    expect(page?.schema.fields.map((field) => field.id)).toEqual(["title", "price"]);
    for (const held of [JSON.stringify(page), JSON.stringify(run.trace)]) {
      expect(held).not.toContain(EXCLUDED);
      expect(held).not.toContain(UNKNOWN);
    }
    await expect(service.runDatasets.listRunDatasets({ projectId: project.id, runId: run.runId }))
      .resolves.toMatchObject([{ datasetId: "listings", label: "Listings", nodeIds: ["extract"], recordCount: 2, invalidCount: 0, truncated: false }]);
  });

  it("fails the attempt, and saves no rows, when the project's store cannot be opened", { timeout: 120_000 }, async () => {
    // The pool closes once the run has its Flow and the output has been asked,
    // so the only thing left that can fail is storing the rows. There is no
    // JSONL fallback (C12): the attempt fails instead.
    //
    // Run deterministically, which is what this row always meant. Since
    // 2026-09-28 a Flow nobody configured repairs itself by default, so without
    // this the failed attempt would go on to a repair that reads the run's
    // conversation -- out of the same closed pool -- and the test would be
    // measuring that read rather than the dataset store it is about.
    let running: AutomationStudioService | undefined;
    const service = startService(async () => { await closeProjectStorage(running!); });
    running = service;
    const project = await service.createProject({ name: "Datasets fail closed", domainId: "example" });
    const flow = await extractionFlow(service, project.id, "flow.extract-closed");

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, adaptiveMode: "no_llm_intervention" });

    expect(run.status).toBe("failed");
    const attempt = run.trace?.attempts.find((entry) => entry.nodeId === "extract");
    expect(attempt?.status).toBe("failed");
    expect(attempt?.failure).toEqual({ category: "action_failed", code: "record_output.persist_failed", retryable: false });
    expect(JSON.stringify(run.trace)).not.toContain(ROW);
  });

  // t258: the same closed store under the default, fully adaptive mode. The
  // failed attempt goes on to recovery, which reads the run's conversation, and
  // the judged end, which reads the run's record -- both out of the closed pool.
  // Until t258 that threw an AggregateError at the caller; the run now ends
  // failed for its own step, and its session says what the store could not take.
  it("ends a fully adaptive run failed for its own step, not by throwing, when its store goes away", { timeout: 120_000 }, async () => {
    let running: AutomationStudioService | undefined;
    const service = startService(async () => { await closeProjectStorage(running!); });
    running = service;
    const project = await service.createProject({ name: "Datasets fail closed, adaptive", domainId: "example" });
    const flow = await extractionFlow(service, project.id, "flow.extract-closed-adaptive");

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });

    expect(run.status).toBe("failed");
    expect(run.metadata?.adaptiveMode).toBe("fully_adaptive");
    expect(run.trace?.attempts.find((entry) => entry.nodeId === "extract")?.failure).toEqual({ category: "action_failed", code: "record_output.persist_failed", retryable: false });
    // Its own reason stands: the store's absence is noted beside it, not written as the run's failure.
    expect(run.metadata).not.toHaveProperty("runFailure");
    expect(run.metadata?.projectStoreUnavailable).toMatchObject({ sessionStatus: "failed", reason: expect.stringContaining("pool is closing") });
    expect(run.metadata?.judgedPromotionSettlement).toMatchObject({ status: "store_unavailable", step: "read_record", recordSaved: false });
    expect(JSON.stringify(run.trace)).not.toContain(ROW);
    // What the caller got back is what is stored.
    await expect(service.getRuntimeSession(project.id, run.runId)).resolves.toMatchObject({ status: "failed", metadata: { projectStoreUnavailable: { sessionStatus: "failed" } } });
  });
});

// Read-list design P1: when the graph run ends -- succeeded, failed or
// cancelled -- and before its result is verified, the run's datasets become
// their answers, so every reader reads the answer and not the collected rows.
describe("the answer a run's datasets hold once the run ends", () => {
  const SCHEMA: JsonObject = {
    schemaVersion: "0.1",
    fields: [
      { id: "title", label: "Title", valueType: "string", required: true },
      { id: "price", label: "Price", valueType: "number" }
    ]
  };
  // Sorted descending, so the answer's order proves the declaration reached the store.
  const PROCESSED_OUTPUT: JsonObject = { datasetId: "pairs", label: "Pairs", recordsPath: "rows", writeMode: "append", schema: SCHEMA, process: { sort: [{ field: "title", order: "desc" }] } };
  const row = (title: string): JsonObject => ({ title: `${ROW}-${title}`, price: 1 });

  // Two passes into one dataset: A,B,C then C,D. Each call answers the next list in turn.
  function startPassService(passes: JsonObject[][]): AutomationStudioService {
    const io = new IoRegistry();
    let call = 0;
    io.registerOutput("example", {
      definition: { id: "extract-list", title: "Extract list" },
      mode: "request",
      dispatch: async (request) => ({ ok: true, domainId: "example", outputId: request.outputId, payload: { rows: passes[call++] ?? [] } })
    });
    const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example");
    services.add(service);
    return service;
  }

  async function twoPassFlow(service: AutomationStudioService, projectId: string, flowId: string) {
    const flow = await service.createFlow({ projectId, flowId, name: flowId });
    const subflow = await service.createFlowSubflow({ projectId, flowId: flow.flowId, name: "Primary", role: "primary" });
    const blank = await service.getFlow(projectId, subflow.graphFlowId!);
    const read = (id: string) => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: "extract-list", parameters: {}, recordOutput: PROCESSED_OUTPUT } });
    await service.saveFlow({
      projectId,
      flow: {
        ...blank,
        nodes: [
          { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
          read("read"),
          read("read-more"),
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: [
          { id: "start.read", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "read", targetPortId: "in" },
          { id: "read.read-more", sourceNodeId: "read", sourcePortId: "success", targetNodeId: "read-more", targetPortId: "in" },
          { id: "read-more.end", sourceNodeId: "read-more", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
        ]
      }
    });
    await service.setFlowMapFallback({ projectId, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
    return flow;
  }

  it("processes a succeeded run's dataset before it returns: the answer is what every reader reads", { timeout: 120_000 }, async () => {
    const service = startPassService([[row("A"), row("B"), row("C")], [row("C"), row("D")]]);
    const project = await service.createProject({ name: "Datasets processed", domainId: "example" });
    const flow = await twoPassFlow(service, project.id, "flow.two-pass");
    const seen: ObservedBatch[] = [];
    observeBatches(service, seen);

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, adaptiveMode: "no_llm_intervention" });

    expect(run.status).toBe("succeeded");
    expect(seen.map((entry) => entry.batch.process)).toEqual([PROCESSED_OUTPUT.process, PROCESSED_OUTPUT.process]);
    const [summary] = await service.runDatasets.listRunDatasets({ projectId: project.id, runId: run.runId });
    expect(summary).toMatchObject({ datasetId: "pairs", recordCount: 4, processing: { collected: 5, duplicates: 1, kept: 4 } });
    const exported = await service.runDatasets.exportRunDataset({ projectId: project.id, runId: run.runId, datasetId: "pairs", format: "json" });
    expect(exported).toMatchObject({ tooLarge: false, rowCount: 4 });
    expect(JSON.parse((exported as { body: string }).body)).toEqual([row("D"), row("C"), row("B"), row("A")]);
  });

  it("processes a failed run's dataset too", { timeout: 120_000 }, async () => {
    // The second pass returns rows the schema refuses every one of, which fails its node and the run.
    const service = startPassService([[row("A"), row("B"), row("A")], [{ price: 2 }]]);
    const project = await service.createProject({ name: "Datasets processed, failed", domainId: "example" });
    const flow = await twoPassFlow(service, project.id, "flow.two-pass-failed");

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, adaptiveMode: "no_llm_intervention" });

    expect(run.status).toBe("failed");
    expect(run.trace?.attempts.find((entry) => entry.nodeId === "read-more")?.failure).toMatchObject({ code: "record_output.records_refused" });
    await expect(service.runDatasets.listRunDatasets({ projectId: project.id, runId: run.runId }))
      .resolves.toMatchObject([{ datasetId: "pairs", recordCount: 2, processing: { collected: 3, duplicates: 1, kept: 2 } }]);
  });

  it("ends the run as it would have, with its dataset unprocessed, when processing fails", { timeout: 120_000 }, async () => {
    const service = startPassService([[row("A"), row("B"), row("C")], [row("C"), row("D")]]);
    const project = await service.createProject({ name: "Datasets processing fails", domainId: "example" });
    const flow = await twoPassFlow(service, project.id, "flow.two-pass-unprocessed");
    const failure = `${ROW}-processing-failure`;
    (service.runDatasets as { processRunDatasets: unknown }).processRunDatasets = async () => { throw new Error(failure); };

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, adaptiveMode: "no_llm_intervention" });

    expect(run.status).toBe("succeeded");
    expect(JSON.stringify(run)).not.toContain(failure);
    const [summary] = await service.runDatasets.listRunDatasets({ projectId: project.id, runId: run.runId });
    expect(summary).toMatchObject({ recordCount: 5 });
    expect(summary).not.toHaveProperty("processing");
  });
});
