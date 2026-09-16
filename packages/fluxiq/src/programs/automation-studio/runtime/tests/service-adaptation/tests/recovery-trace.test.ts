import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { adaptiveTrainingMetadata, createFailingCanonicalFlow, installPrimaryRouter } from "../../service-fixtures.ts";

// Phase 2.2 end to end, through the real service: the deterministic gate, the
// plan between diagnosis and patch, the patch request that no longer fires
// unconditionally, and the four recovery stages a run now records.

let tempRoot: string;
const services = new Set<AutomationStudioService>();

function createService(...args: ConstructorParameters<typeof AutomationStudioService>): AutomationStudioService {
  const service = new AutomationStudioService(...args);
  services.add(service);
  return service;
}

type TraceStage = Record<string, unknown>;

function traceStages(detail: { metadata?: JsonObject | undefined } | null | undefined): TraceStage[] {
  return ((detail?.metadata?.recoveryTrace as { stages?: TraceStage[] } | undefined)?.stages ?? []);
}

/** Small usage keeps the run budget from refusing the second call on reservation alone. */
const usage = { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.001 };

describe("AutomationStudioService runtime recovery stages", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-studio-recovery-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  // L5, first clause. A Flow naming a node with no implementation is a graph
  // problem: a person edits the Flow, and no amount of asking changes that. The
  // provider is not resolved and nothing is billed.
  it("calls no provider at all for a graph failure, and says so in the trace", async () => {
    const taskKinds: string[] = [];
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        metadata: { provider: "mock", model: "diagnosis-model" },
        runTask: async (request) => {
          taskKinds.push(request.taskKind);
          return { response: { kind: "diagnosis", summary: "Something went wrong." }, usage };
        }
      })
    });
    const project = await service.createProject({ name: "Graph failure" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.graph-failure", name: "Graph failure Flow" });
    await service.saveFlow({ projectId: project.id, flow: { ...flow, metadata: { ...(flow.metadata ?? {}), ...adaptiveTrainingMetadata() } } });
    await installPrimaryRouter(service, project.id, flow.flowId, {
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "broken", definitionId: "unknown.confirmation", parameterValues: {} }
      ],
      edges: [{ id: "start.broken", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "broken", targetPortId: "in" }]
    });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(run.status).toBe("failed");
    expect(taskKinds).toEqual([]);
    expect(detail?.metadata?.llmGate).toMatchObject({ invoked: false, requiredPriorAction: "manual_intervention" });
    expect(traceStages(detail).map((stage) => [stage.stage, stage.status, stage.providerCalled])).toEqual([
      ["diagnosis", "completed", false],
      ["recovery_plan", "completed", false],
      ["exploration", "skipped", false],
      ["resolution", "skipped", false]
    ]);
    expect(traceStages(detail)[0]?.detail).toMatchObject({ failureClass: "graph_validation_or_unknown_node", resolution: "manual_intervention" });
    expect(traceStages(detail)[3]?.detail).toMatchObject({ outcome: "manual_intervention_required" });
  });

  // The diagnosis call is the loop protocol's "gather" stage and the patch call
  // is "implement", with the plan between them costing no provider call. These
  // are the first production calls that name a stage at all, so the prompt
  // version each intervention records changes with them.
  it("stages the diagnosis as gather and the patch as implement, with a deterministic plan between them", async () => {
    const stages: Array<string | undefined> = [];
    const promptVersions: string[] = [];
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        metadata: { provider: "mock", model: "patch-model" },
        runTask: async (request) => {
          stages.push(request.context.stage);
          promptVersions.push(request.promptVersion);
          return request.taskKind === "runtime_patch"
            ? { response: { kind: "runtime_patch", summary: "Wait for the result.", riskLevel: "low", patches: [{ kind: "temporary_wait_retry", targetNodeId: "divide", timeoutMs: 1_000, retryCount: 1, reason: "Give the step longer." }] }, usage }
            : { response: { kind: "diagnosis", summary: "The step failed and a repair is needed." }, usage };
        }
      })
    });
    const project = await service.createProject({ name: "Staged" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.staged", metadata: adaptiveTrainingMetadata() });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(stages).toEqual(["gather", "implement"]);
    expect(promptVersions).toEqual(["automation-studio.runtime-diagnosis.v1+stage.gather", "automation-studio.runtime-patch.v1+stage.implement"]);
    expect(detail?.interventions.flatMap((intervention) => intervention.promptVersion ? [intervention.promptVersion] : [])).toEqual(promptVersions);
    expect(traceStages(detail).map((stage) => [stage.stage, stage.loopStage ?? null, stage.providerCalled])).toEqual([
      ["diagnosis", "gather", true],
      ["recovery_plan", "plan", false],
      ["exploration", null, false],
      ["resolution", "implement", true]
    ]);
  });

  // Phase D chained the patch on the diagnosis succeeding; this is that rule
  // still holding now that the plan sits between them.
  it("asks for no patch when the diagnosis call did not return a diagnosis", async () => {
    const taskKinds: string[] = [];
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        metadata: { provider: "mock", model: "diagnosis-model" },
        runTask: async (request) => {
          taskKinds.push(request.taskKind);
          return { response: { kind: "instruction_suggestion", summary: "Not a diagnosis.", instructions: [{ title: "Look again", body: "Check the inputs." }] }, usage };
        }
      })
    });
    const project = await service.createProject({ name: "Bad diagnosis" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.bad-diagnosis", metadata: adaptiveTrainingMetadata() });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(taskKinds).toEqual(["runtime_diagnosis"]);
    expect(detail?.metadata?.llmGate).toMatchObject({ patchSkipped: expect.stringContaining("diagnosis") });
    expect(traceStages(detail)[0]).toMatchObject({ stage: "diagnosis", status: "failed" });
    expect(traceStages(detail)[3]?.detail).toMatchObject({ outcome: "diagnosis_failed" });
  });

  // The pin on the closed channel. Core strips `metadata` from every structured
  // response, so a model cannot supply the structured diagnosis fields at all
  // today and the deterministic verdicts stand. When the `AS/runtime/llm/**`
  // diff in this phase's report lands, this fails and is updated deliberately.
  it("records the deterministic verdicts, and no model prose, because Core strips response metadata", async () => {
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        metadata: { provider: "mock", model: "diagnosis-model" },
        runTask: async () => ({
          response: { kind: "diagnosis", summary: "PRIVATE_MODEL_PROSE", confidence: 0.75, metadata: { observed: "PRIVATE_OBSERVED_TEXT", patchNeeded: false } },
          usage
        })
      })
    });
    const project = await service.createProject({ name: "Content free" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.content-free", metadata: adaptiveTrainingMetadata() });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(JSON.stringify(detail?.metadata?.recoveryTrace)).not.toContain("PRIVATE_OBSERVED_TEXT");
    expect(JSON.stringify(detail?.metadata?.recoveryTrace)).not.toContain("PRIVATE_MODEL_PROSE");
    expect(JSON.stringify(detail?.metadata?.llmGate)).not.toContain("PRIVATE_OBSERVED_TEXT");
    expect(detail?.metadata?.llmGate).toMatchObject({
      structuredDiagnosis: { source: "model", modelFields: [], describedFieldCount: 0, refusals: [], confidence: 0.75, patchNeeded: true }
    });
  });
});
