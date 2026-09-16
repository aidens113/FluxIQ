import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { IoRegistry } from "../../../../io/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../nodes/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../native-node-runtime.ts";
import { AutomationStudioService } from "../service.ts";

// A domain's importer node, not only `builtin.policy.action`, can save the rows
// its output returns: it declares a `records` output and puts a record output
// in its dispatch. This runs such a node through the service and reads the
// stored dataset back, so the whole path -- the native result boundary, the
// IO dispatch, record capture, and the run's dataset store -- is exercised.

const EXCLUDED = "synthetic-excluded-field-value";

const RECORD_OUTPUT: JsonObject = {
  datasetId: "products",
  label: "Products",
  recordsPath: "result.extracted",
  writeMode: "replace",
  schema: {
    schemaVersion: "0.1",
    fields: [
      { id: "name", label: "Name", valueType: "string", required: true },
      { id: "price", label: "Price", valueType: "number" },
      { id: "internal", label: "Internal", valueType: "string", handling: "exclude" }
    ]
  }
};

const EXTRACT: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1",
  id: "example.output.extract-list",
  version: "1.0.0",
  label: "Extract list",
  description: "Reads every item of a list.",
  category: "action",
  source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "extract-list" },
  availability: { kind: "domain", domainId: "example" },
  capabilities: { executable: true },
  outputAction: { fixedOutputId: "extract-list" },
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" },
    { id: "records", label: "Records", valueType: "array", role: "data" }
  ],
  parameters: [{ id: "recordOutput", label: "Save records", valueType: "json", allowStateBinding: false, ui: { control: "record-output" } }]
};

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-importer-record-capture-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

function startService(): AutomationStudioService {
  const io = new IoRegistry();
  io.registerOutput("example", {
    definition: { id: "extract-list", title: "Extract list" },
    mode: "request",
    dispatch: async (request) => ({
      ok: true,
      domainId: "example",
      outputId: request.outputId,
      // `recordsPath` is read inside this payload.
      payload: { result: { extracted: [{ name: "Lamp", price: 12, internal: EXCLUDED }, { name: "Desk" }] } }
    })
  });
  const native = new AutomationStudioNativeNodeRuntime().register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [EXTRACT] },
    {
      packageId: "example.package",
      packageVersion: "1.0.0",
      implementations: {
        "extract-list": ({ parameters }) => ({
          status: "success",
          outputs: { success: true },
          effects: [{ type: "policy.output.dispatch", payload: { outputId: "extract-list", parameters: {}, recordOutput: parameters.recordOutput ?? null } }]
        })
      }
    }
  );
  const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(native);
  services.add(service);
  return service;
}

async function extractionFlow(service: AutomationStudioService, projectId: string) {
  const flow = await service.createFlow({ projectId, flowId: "flow.importer-extract", name: "Importer extract" });
  const subflow = await service.createFlowSubflow({ projectId, flowId: flow.flowId, name: "Primary", role: "primary" });
  const blank = await service.getFlow(projectId, subflow.graphFlowId!);
  await service.saveFlow({
    projectId,
    flow: {
      ...blank,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "extract", definitionId: EXTRACT.id, definitionVersion: EXTRACT.version, parameterValues: { recordOutput: RECORD_OUTPUT } },
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

describe("an importer node that declares its records", () => {
  it("stores the rows its output returned as a run dataset", { timeout: 120_000 }, async () => {
    const service = startService();
    const project = await service.createProject({ name: "Importer datasets", domainId: "example" });
    const flow = await extractionFlow(service, project.id);

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });

    expect(run.status).toBe("succeeded");
    const page = await service.runDatasets.getRunDatasetPage({ projectId: project.id, runId: run.runId, datasetId: "products" });
    expect(page?.rows).toEqual([{ name: "Lamp", price: 12 }, { name: "Desk" }]);
    expect(page?.schema.fields.map((field) => field.id)).toEqual(["name", "price"]);
    await expect(service.runDatasets.listRunDatasets({ projectId: project.id, runId: run.runId }))
      .resolves.toMatchObject([{ datasetId: "products", label: "Products", nodeIds: ["extract"], recordCount: 2, invalidCount: 0, truncated: false }]);
    for (const held of [JSON.stringify(page), JSON.stringify(run.trace)]) expect(held).not.toContain(EXCLUDED);
  });
});
