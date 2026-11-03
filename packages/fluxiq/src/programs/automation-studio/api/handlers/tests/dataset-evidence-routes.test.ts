// @fluxiq-test-group real-sql
// The tested cells of a processing condition's left-out rows are verification's
// evidence and leave the store through no public read (t841). A real run through
// the real service and API registry: every route a client reads a dataset by is
// asked, and the result check is shown what it needs. No model is called.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { IoRegistry } from "../../../../../io/index.ts";
import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";
import { registerAutomationStudioApi } from "../index.ts";
import { cacheActor } from "./test-actor.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../api-contracts/automation.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import { AutomationStudioService } from "../../../../../framework/automation-service/index.ts";

// Obviously synthetic. The kept and left-out labels may travel; the left-out row's tested cell may not.
const KEPT = "synthetic-kept-title";
const LEFT_OUT = "synthetic-left-out-title";
const LEFT_OUT_CELL = "synthetic-left-out-shelf-cell";
const DATASET = "catalogue";

const RECORD_OUTPUT: JsonObject = {
  datasetId: DATASET,
  label: "Catalogue",
  recordsPath: "rows",
  writeMode: "append",
  schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string", required: true }, { id: "shelf", label: "Shelf", valueType: "string" }] },
  process: { where: [{ field: "shelf", equals: "Available today" }] }
};

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-evidence-routes-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

/** The service a domain runs: one read, a scripted judge, and the domain's denied-keys declaration. */
function startService(judged: AutomationStudioLlmTaskRequest[]): AutomationStudioService {
  const io = new IoRegistry();
  io.registerOutput("example", {
    definition: { id: "extract-list", title: "Extract list" },
    mode: "request",
    dispatch: async (request) => ({ ok: true, domainId: "example", outputId: request.outputId, payload: { rows: [{ title: KEPT, shelf: "Available today" }, { title: LEFT_OUT, shelf: LEFT_OUT_CELL }] } })
  });
  const provider = {
    metadata: { provider: "mock", model: "scripted" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      if (request.taskKind === "loop_verification") judged.push(request);
      return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "yes", observed: 'Condition 1 carries out "Available today".' } }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
    }
  };
  const service = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: () => ({ provider, maxCallsPerRun: 4, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: { domainId: "example", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { looked: true }, effectApplied: false, targetsUnchanged: true }) }
  } as ConstructorParameters<typeof AutomationStudioService>[0]).bindIoRuntime(io, "example");
  services.add(service);
  return service;
}

/** A Flow whose primary Subflow reads once, and a finished run of it. */
async function finishedRun(service: AutomationStudioService) {
  const project = await service.createProject({ name: "Evidence routes", domainId: "example" });
  const flow = await service.createFlow({ projectId: project.id, flowId: "flow.read", name: "flow.read" });
  const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
  const blank = await service.getFlow(project.id, subflow.graphFlowId!);
  await service.saveFlow({ projectId: project.id, flow: { ...blank,
    nodes: [
      { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
      { id: "extract", definitionId: "builtin.policy.action", parameterValues: { outputId: "extract-list", parameters: {}, recordOutput: RECORD_OUTPUT } },
      { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
    ],
    edges: [
      { id: "start.extract", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "extract", targetPortId: "in" },
      { id: "extract.end", sourceNodeId: "extract", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
    ] } });
  await service.setFlowMapFallback({ projectId: project.id, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  await service.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: "List the catalogue's titles with shelf status Available today." });
  const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, llmExecution: { actorUserId: "user.test", actorSessionId: "session.test", intent: "explore_and_adapt" } });
  return { projectId: project.id, flowId: run.flowId, runId: run.runId, run };
}

function apiOf(service: AutomationStudioService) {
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service);
  const actor = cacheActor("user.reader");
  return async (endpoint: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await registry.call({ programId: "automation-studio", endpoint, scope: { domainId: "example" }, actor, payload }) as { ok: boolean; payload?: Record<string, unknown>; error?: unknown };
    expect(response.ok, `${endpoint}: ${JSON.stringify(response.error)}`).toBe(true);
    return response.payload!;
  };
}

/** Nothing of verification's evidence in `account`, and the left-out row's own label still said: the route still answers what it answered. */
function expectPublicAccount(route: string, account: unknown): void {
  const said = JSON.stringify(account);
  expect(said, route).not.toContain('"tested"');
  expect(said, route).not.toContain('"evaluation"');
  expect(said, route).not.toContain(LEFT_OUT_CELL);
  expect((account as { conditions: Array<{ leftOutOnlyByThis: unknown }> }).conditions[0]!.leftOutOnlyByThis, route).toEqual([{ field: "title", label: LEFT_OUT }]);
}

describe("a processed dataset's tested cells, after a real run", () => {
  it("leave through no list or detail route, and verification still receives them", { timeout: 180_000 }, async () => {
    const judged: AutomationStudioLlmTaskRequest[] = [];
    const service = startService(judged);
    const { projectId, flowId, runId } = await finishedRun(service);
    const call = apiOf(service);
    const scope = { projectId, runId };
    const dataset = { ...scope, datasetId: DATASET };
    const accountIn = (entry: unknown): unknown => (entry as { processing: unknown }).processing;

    const listed = await call(AUTOMATION_STUDIO_ENDPOINTS.listRunDatasets, scope);
    expectPublicAccount("list-run-datasets", accountIn((listed.datasets as unknown[])[0]));

    const page = await call(AUTOMATION_STUDIO_ENDPOINTS.getRunDatasetPage, dataset);
    expectPublicAccount("get-run-dataset-page", accountIn((page.dataset as { summary: unknown }).summary));
    expect(JSON.stringify((page.dataset as { rows: unknown }).rows)).toContain(KEPT);
    expect(JSON.stringify((page.dataset as { rows: unknown }).rows)).not.toContain(LEFT_OUT_CELL);

    const runs = await call(AUTOMATION_STUDIO_ENDPOINTS.listDatasetRuns, { projectId, flowId, datasetId: DATASET });
    expectPublicAccount("list-dataset-runs", accountIn((runs.runs as unknown[])[0]));

    for (const compact of [false, true]) {
      const detail = await call(AUTOMATION_STUDIO_ENDPOINTS.getFlowRunDetail, { ...scope, compact });
      expect(JSON.stringify(detail), `whole detail compact=${compact}`).not.toContain(LEFT_OUT_CELL);
      expectPublicAccount(`get-flow-run-detail compact=${compact}`, accountIn((detail.runDetail as { datasets: unknown[] }).datasets[0]));
    }

    const audit = await call(AUTOMATION_STUDIO_ENDPOINTS.exportFlowRunAudit, scope);
    const auditedDetail = (audit.audit as { detail?: { datasets?: unknown[] }; runDetail?: { datasets?: unknown[] } });
    const audited = (auditedDetail.detail ?? auditedDetail.runDetail)?.datasets?.[0];
    if (audited !== undefined) expectPublicAccount("export-flow-run-audit", accountIn(audited));
    expect(JSON.stringify(audit)).not.toContain('"tested"');

    // The Data window's other read holds no account at all.
    const project = await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectDatasets, { projectId });
    expect(JSON.stringify(project)).not.toContain("leftOutOnlyByThis");

    // An export is the answer's rows, in either format.
    for (const format of ["csv", "json"]) {
      const exported = await call(AUTOMATION_STUDIO_ENDPOINTS.exportRunDataset, { ...dataset, format });
      const said = JSON.stringify(exported);
      expect(said, format).toContain(KEPT);
      expect(said, format).not.toContain(LEFT_OUT);
      expect(said, format).not.toContain(LEFT_OUT_CELL);
    }

    // Verification's own read carries the evidence, and the result check was shown it screened and settled.
    const forVerification = await service.runDatasets.listRunDatasetsForVerification(scope);
    const condition = forVerification[0]!.processing!.conditions![0]!;
    expect(condition.evaluation?.condition).toEqual({ field: "shelf", equals: "Available today" });
    expect(condition.leftOutOnlyByThis).toEqual([{ field: "title", label: LEFT_OUT, tested: { state: "present", value: LEFT_OUT_CELL } }]);
    expect(judged.length).toBeGreaterThan(0);
    const shown = judged[0]!.context.resultSummary!.recordSets[0]!.processing!.conditions![0]!;
    expect(shown.leftOutSettled).toEqual([LEFT_OUT]);
    expect(shown.leftOutObservations).toEqual([{ state: "present", value: LEFT_OUT_CELL }]);
  });
});
