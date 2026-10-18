import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION } from "../../../../nodes/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../../../flow-bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { summarizeAutomationStudioRunResult } from "../../../result-verification/index.ts";
import { AutomationStudioService } from "../../../service.ts";

// No browser or provider: native outputs return deterministic records through
// real dispatch/capture, the actual compiler builds the row loop, and the
// service persists the Flow, attempts and answer in its real project database.
const rows: JsonObject[] = [{ name: "synthetic-alpha" }, { name: "synthetic-beta" }];
function output(datasetId: string, intermediate = false): JsonObject {
  const declaration: JsonObject = { datasetId, writeMode: "append",
    schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }] } };
  if (intermediate) declaration.purpose = "intermediate";
  return declaration;
}
const services = new Set<AutomationStudioService>();
let root: string | undefined;
afterEach(async () => {
  for (const service of services) await service.close();
  services.clear();
  if (root) {
    const target = path.resolve(root);
    if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith("fluxiq-intermediate-output-")) throw new Error("Refusing cleanup outside this test's owned temporary directory.");
    await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  }
});

function start(dataDir: string, actedOn: unknown[]) {
  const fixture = webDomainNodeDefinitionsFixture();
  const read = fixture.find((definition) => definition.id === "web.output.dom-extract_list")!;
  const act = fixture.find((definition) => definition.id === "web.output.dom-click")!;
  const runtime = new AutomationStudioNativeNodeRuntime({ permissions: ["web-automation.action"], runtimeCapabilities: ["web.actions"] });
  runtime.register({
    schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "@fluxiq-web-extension/domain", packageVersion: "1.0.0", domainId: "web-automation",
    nodes: [read, { ...act, inputs: [...act.inputs, { id: "item", label: "Item", valueType: "any", role: "data" }] }]
  }, {
    packageId: "@fluxiq-web-extension/domain", packageVersion: "1.0.0",
    implementations: {
      "web.dom.extract_list": ({ parameters }) => {
        const declaration: JsonObject = parameters.recordOutput as JsonObject;
        return {
        status: "success", route: "success", outputs: {},
        effects: [{ type: "policy.output.dispatch", payload: {
          outputId: "web.dom.extract_list", parameters: parameters.extractList ?? {},
          recordOutput: { ...declaration, recordsPath: "result.extracted" }
        } }]
        };
      },
      "web.dom.click": ({ inputs }) => {
        actedOn.push(inputs.item);
        return { status: "success", route: "success", outputs: {} };
      }
    }
  });
  const io = new IoRegistry();
  io.registerOutput("web-automation", {
    definition: { id: "web.dom.extract_list", title: "Read deterministic records" }, mode: "request",
    dispatch: async (request) => {
      const working = (request.payload as JsonObject).item !== ".answer";
      const extracted = working ? rows : rows.slice(0, 1);
      const extraction: JsonObject = {
        recordCount: extracted.length, pagesRead: 1, truncated: false, fieldNames: ["name"], missingFields: [], itemsSeen: working ? 3 : 1
      };
      if (working) extraction.conditions = { applied: 3, kept: 2, rejected: [1], unfiltered: false };
      return { ok: true, domainId: "web-automation", outputId: request.outputId, payload: {
        result: { extracted, extraction }
      } };
    }
  });
  const service = new AutomationStudioService({ dataDir }).bindNativeNodeRuntime(runtime).bindIoRuntime(io, "web-automation");
  services.add(service);
  return { service, runtime };
}

it.each([false, true])("keeps compiled intermediate loops/read evidence and reopened answers (same-ID replace: %s)", { timeout: 120_000 }, async (sameId) => {
  root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-intermediate-output-"));
  const actedOn: unknown[] = [];
  const { service, runtime } = start(root, actedOn);
  const answer = ["step answer: Read the answer", "  node: web.dom.extract_list",
    '  extractList: {"item":".answer","fields":{"name":".name"}}', `  recordOutput: ${JSON.stringify(output("answer"))}`];
  const workingOutput = output(sameId ? "answer" : "working", true);
  workingOutput.writeMode = "replace";
  const accepted = acceptAutomationStudioFlowBootstrapResult({
    registry: runtime.sdk.nodes,
    resolution: runtime.getRegistryResolution({ kind: "domain", domainId: "web-automation" }),
    result: { flow: [
      "flow: Process a working list and save the answer",
      ...(sameId ? answer : []),
      "step working: Read the working list", "  node: web.dom.extract_list",
      '  extractList: {"item":".row","fields":{"name":".name"},"where":[{"field":"name","is":"present"}]}',
      `  recordOutput: ${JSON.stringify(workingOutput)}`,
      "step act: Process this row", "  node: web.dom.click", "  selector: .control", "  consequences: none",
      "  repeat over: working",
      ...(sameId ? [] : answer)
    ].join("\n") }
  });
  expect(accepted.ok).toBe(true);
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
  const compiled = accepted.plan.subflows[0]!;
  expect(compiled.nodes.find((node) => node.parameters?.recordOutput && (node.parameters.recordOutput as JsonObject).purpose === "intermediate")?.parameters?.recordOutput)
    .toMatchObject({ purpose: "intermediate" });
  const project = await service.createProject({ name: "Intermediate ownership", domainId: "web-automation" });
  const parent = await service.createFlow({ projectId: project.id, flowId: "flow.intermediate", name: "Working list" });
  const part = await service.createFlowSubflow({ projectId: project.id, flowId: parent.flowId, name: "Primary", role: "primary" });
  const blank = await service.getFlow(project.id, part.graphFlowId!);
  const graph = { ...blank,
    nodes: compiled.nodes.map((node) => ({ id: node.key, definitionId: node.definitionId, parameterValues: node.parameters ?? {} })),
    edges: compiled.edges.map((edge) => ({ id: edge.key, sourceNodeId: edge.source.nodeKey, sourcePortId: edge.source.portId, targetNodeId: edge.target.nodeKey, targetPortId: edge.target.portId }))
  };
  await service.saveFlow({ projectId: project.id, flow: graph });
  await service.setFlowMapFallback({ projectId: project.id, flowId: parent.flowId, kind: "subflow", targetSubflowId: part.subflowId });
  await service.saveFlowGenerationInstruction({ projectId: project.id, flowId: parent.flowId, instruction: "Process each working row and save the answer table." });

  async function evidence(owner: AutomationStudioService, runId: string) {
    const datasets = await owner.runDatasets.listRunDatasets({ projectId: project.id, runId });
    expect(datasets.map((dataset) => dataset.datasetId)).toEqual(["answer"]);
    const page = await owner.runDatasets.getRunDatasetPage({ projectId: project.id, runId, datasetId: "answer" });
    expect(page?.rows).toEqual(rows.slice(0, 1));
    const detail = await owner.getFlowRunDetail(project.id, runId);
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasets[0]!, schema: page!.schema, rows: page!.rows }],
      flowNodes: graph.nodes, flowEdges: graph.edges, actionAttempts: detail!.actionAttempts,
      sessionAttempts: (await owner.getRuntimeSession(project.id, runId))?.trace?.attempts,
      deniedEvidenceKeys: []
    });
    expect(summary.recordSets?.map((set) => set.datasetId)).toEqual(["answer"]);
    expect(summary.reads).toHaveLength(2);
    expect(summary.reads?.map((read) => read.kept)).toEqual(sameId ? [1, 2] : [2, 1]);
    expect(summary.reads?.find((read) => read.kept === 2)?.conditions).toHaveLength(1);
    expect(summary.flowShape.find((step) => step.definitionId === "web.output.dom-click")?.rowsActedOn).toEqual(rows);
    expect(detail?.actionAttempts?.filter((attempt) => attempt.definitionId === "web.output.dom-click")).toHaveLength(2);
    return summary.reads;
  }
  const first = await service.runRuntimeSession({ projectId: project.id, flowId: parent.flowId, adaptiveMode: "no_llm_intervention" });
  expect(first.status, JSON.stringify(first.trace?.attempts.filter((attempt) => attempt.status === "failed"))).toBe("succeeded");
  expect(actedOn).toEqual(rows);
  const before = await evidence(service, first.runId);
  await service.close();
  services.delete(service);
  const reopened = start(root, actedOn).service;
  expect(await evidence(reopened, first.runId)).toEqual(before);
  expect((await reopened.getFlow(project.id, graph.flowId)).nodes).toEqual(graph.nodes);
  const again = await reopened.runRuntimeSession({ projectId: project.id, flowId: parent.flowId, adaptiveMode: "no_llm_intervention" });
  expect(again.status).toBe("succeeded");
  await evidence(reopened, again.runId);
  expect(actedOn).toEqual([...rows, ...rows]);
});
