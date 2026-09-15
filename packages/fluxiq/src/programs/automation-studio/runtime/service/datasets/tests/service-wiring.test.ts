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
    let running: AutomationStudioService | undefined;
    const service = startService(async () => { await closeProjectStorage(running!); });
    running = service;
    const project = await service.createProject({ name: "Datasets fail closed", domainId: "example" });
    const flow = await extractionFlow(service, project.id, "flow.extract-closed");

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });

    expect(run.status).toBe("failed");
    const attempt = run.trace?.attempts.find((entry) => entry.nodeId === "extract");
    expect(attempt?.status).toBe("failed");
    expect(attempt?.failure).toEqual({ category: "action_failed", code: "record_output.persist_failed", retryable: false });
    expect(JSON.stringify(run.trace)).not.toContain(ROW);
  });
});
