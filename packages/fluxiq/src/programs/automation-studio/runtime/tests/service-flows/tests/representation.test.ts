import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact, withAutomationStudioFlowRepresentation } from "../../../../model/index.ts";
import { generateFlowTypeScript } from "../../../../dsl/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE } from "../../../executor/index.ts";
import { AutomationStudioService } from "../../../service.ts";

describe("Automation Studio Flow representation boundary", () => {
  let dataDir: string;
  let service: AutomationStudioService;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-representation-"));
    service = new AutomationStudioService({ dataDir, seedFixture: false });
  });

  afterEach(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("rejects graph saves and patches on newly created orchestration Flows", async () => {
    const project = await service.createProject({ name: "Modern boundary" });
    const parent = await service.createFlow({ projectId: project.id, flowId: "flow.parent", name: "Parent" });

    await expect(service.saveFlow({
      projectId: project.id,
      flow: { ...parent, nodes: [{ id: "start", definitionId: "builtin.control.start" }] }
    })).rejects.toThrow("Top-level orchestration Flows cannot own Nodes");
    await expect(service.applyFlowGraphPatch({
      projectId: project.id,
      flowId: parent.flowId,
      baseRevision: 0,
      mutationId: "mutation.parent-node",
      operations: [{ op: "add_node", node: { nodeId: "start", flowId: parent.flowId, definitionId: "builtin.control.start", definitionVersion: "1.0.0", label: "Start", description: "", parameterValues: {}, x: 0, y: 0, width: 180, height: 80, zIndex: 0, disabled: false, metadata: {} } }]
    })).rejects.toThrow("apply graph patches to a Subflow graph Flow");

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: parent.flowId, adaptiveMode: "no_llm_intervention" });
    expect(run).toMatchObject({ status: "failed", trace: { message: expect.stringContaining("no Router-selected Subflow") } });
  });

  it("runs a dedicated owned Subflow graph through its parent Router and refuses graph hijacking", async () => {
    const project = await service.createProject({ name: "Owned graph" });
    const parent = await service.createFlow({ projectId: project.id, flowId: "flow.parent", name: "Parent" });
    const unrelated = await service.createFlow({ projectId: project.id, flowId: "flow.unrelated", name: "Unrelated" });
    await expect(service.saveFlowSubflow({
      schemaVersion: "0.1",
      projectId: project.id,
      flowId: parent.flowId,
      subflowId: "subflow.hijack",
      graphFlowId: unrelated.flowId,
      name: "Hijack",
      role: "utility",
      status: "active",
      createdAt: 1,
      updatedAt: 1
    })).rejects.toThrow("matching parent and Subflow ownership");

    const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: parent.flowId, name: "Primary", role: "primary" });
    const graph = await service.getFlow(project.id, subflow.graphFlowId!);
    const summaries = await service.listAutomationFlowSummaries(project.id);
    expect(summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ flowId: parent.flowId, flowRepresentationVersion: 1, flowRepresentationKind: "orchestration" }),
      expect.objectContaining({ flowId: graph.flowId, flowRepresentationVersion: 1, flowRepresentationKind: "subflow_graph" })
    ]));
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...graph,
        nodes: [
          { id: "start", definitionId: "builtin.control.start" },
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }]
      }
    });
    const now = Date.now();
    await service.saveFlowRouter({
      schemaVersion: "0.1",
      routerId: "router.parent",
      projectId: project.id,
      flowId: parent.flowId,
      name: "Parent Router",
      rules: [],
      fallback: { kind: "subflow", subflowId: subflow.subflowId },
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: parent.flowId, adaptiveMode: "no_llm_intervention" });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    expect(run.status).toBe("succeeded");
    expect(detail?.subflows).toEqual([expect.objectContaining({ subflowId: subflow.subflowId, metadata: expect.objectContaining({ graphFlowId: graph.flowId }) })]);
    await expect(service.updateFlowSubflow({ projectId: project.id, flowId: parent.flowId, subflowId: subflow.subflowId, graphFlowId: unrelated.flowId })).rejects.toThrow("cannot be reassigned");
  });

  it("retains parent and Subflow graph identity through generated source compilation and restart", async () => {
    const project = await service.createProject({ name: "Durable generated source" });
    const parent = await service.createFlow({ projectId: project.id, flowId: "flow.durable-parent", name: "Parent" });
    const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: parent.flowId, name: "Primary", role: "primary" });
    const graph = await service.getFlow(project.id, subflow.graphFlowId!);

    const compiledParent = await service.compileAndSaveFlowSource({
      projectId: project.id,
      flowId: parent.flowId,
      moduleId: "flows/parent.flow.ts",
      sourceText: generateFlowTypeScript(parent)
    });
    const compiledGraph = await service.compileAndSaveFlowSource({
      projectId: project.id,
      flowId: graph.flowId,
      moduleId: "flows/graph.flow.ts",
      sourceText: generateFlowTypeScript(graph)
    });
    expect(compiledParent.flow?.metadata).toMatchObject({ flowRepresentationVersion: 1, flowRepresentationKind: "orchestration" });
    expect(compiledGraph.flow?.metadata).toMatchObject({
      flowRepresentationVersion: 1,
      flowRepresentationKind: "subflow_graph",
      subflowGraph: true,
      parentFlowId: parent.flowId,
      parentSubflowId: subflow.subflowId
    });

    await service.close();
    service = new AutomationStudioService({ dataDir, seedFixture: false });
    await expect(service.getFlow(project.id, parent.flowId)).resolves.toMatchObject({
      metadata: { flowRepresentationVersion: 1, flowRepresentationKind: "orchestration" }
    });
    await expect(service.getFlow(project.id, graph.flowId)).resolves.toMatchObject({
      metadata: {
        flowRepresentationVersion: 1,
        flowRepresentationKind: "subflow_graph",
        subflowGraph: true,
        parentFlowId: parent.flowId,
        parentSubflowId: subflow.subflowId
      }
    });
  });

  it("preserves legacy execution and refuses a public representation downgrade", async () => {
    const project = await service.createProject({ name: "Legacy compatibility" });
    const forged = createBlankAutomationStudioFlowArtifact({ projectId: project.id, flowId: "flow.forged", name: "Forged", origin: "migrated" });
    await expect(service.saveFlow({
      projectId: project.id,
      flow: { ...forged, legacyProvenance: { kind: "task", artifactId: "task.forged" }, nodes: [{ id: "start", definitionId: "builtin.control.start" }] }
    })).rejects.toThrow("Top-level orchestration Flows cannot own Nodes");
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "task",
      artifact: { schemaVersion: "0.1", taskId: "task.legacy", name: "Legacy", recordingIds: [], createdAt: 1, updatedAt: 1 }
    });
    const migration = await service.migrateFlows(project.id);
    const saved = await service.getFlow(project.id, migration.outcomes[0]!.flowId);
    const run = await service.runRuntimeSession({ projectId: project.id, flowId: saved.flowId, adaptiveMode: "no_llm_intervention" });
    expect(run.metadata).toMatchObject({ compatibilityDiagnostics: [expect.objectContaining({ code: "flow.legacy_single_graph_execution" })] });

    const attemptedDowngrade = await service.saveFlow({
      projectId: project.id,
      flow: { ...saved, nodes: [], edges: [], metadata: withAutomationStudioFlowRepresentation(saved.metadata, "orchestration") }
    });
    expect(attemptedDowngrade.metadata).toMatchObject({ flowRepresentationVersion: 1, flowRepresentationKind: "legacy_single_graph" });
  });
  it("explicitly migrates a legacy parent into the requested owned Subflow graph and is idempotent", async () => {
    const project = await service.createProject({ name: "Explicit legacy migration" });
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "task",
      artifact: { schemaVersion: "0.1", taskId: "task.explicit", name: "Explicit", recordingIds: [], createdAt: 1, updatedAt: 1 }
    });
    const migration = await service.migrateFlows(project.id);
    const importedLegacy = await service.getFlow(project.id, migration.outcomes[0]!.flowId);
    const legacy = {
      ...importedLegacy,
      nodes: [{ id: "legacy-start", definitionId: "builtin.control.start" }]
    };
    await service.saveFlow({ projectId: project.id, flow: legacy });
    const subflow = await service.createFlowSubflow({
      projectId: project.id,
      flowId: legacy.flowId,
      name: "Requested target",
      role: "primary"
    });

    const blankTarget = await service.getFlow(project.id, subflow.graphFlowId!);
    await service.saveFlow({
      projectId: project.id,
      flow: { ...blankTarget, nodes: [{ id: "foreign", definitionId: "builtin.control.start" }] }
    });
    await expect(service.migrateLegacyFlowRepresentation({
      projectId: project.id,
      flowId: legacy.flowId,
      subflowId: subflow.subflowId
    })).rejects.toThrow("does not match it exactly");
    await service.saveFlow({
      projectId: project.id,
      flow: { ...await service.getFlow(project.id, subflow.graphFlowId!), nodes: [], edges: [] }
    });

    const result = await service.migrateLegacyFlowRepresentation({
      projectId: project.id,
      flowId: legacy.flowId,
      subflowId: subflow.subflowId
    });
    expect(result.parentFlow).toMatchObject({
      flowId: legacy.flowId,
      nodes: [],
      edges: [],
      metadata: { flowRepresentationVersion: 1, flowRepresentationKind: "orchestration" }
    });
    expect(result.graphFlow.nodes).toEqual(legacy.nodes);
    expect(result.graphFlow.edges).toEqual(legacy.edges);
    expect(await service.getFlowRouter(project.id, legacy.flowId)).toMatchObject({
      fallback: { kind: "subflow", subflowId: subflow.subflowId }
    });

    const repeated = await service.migrateLegacyFlowRepresentation({
      projectId: project.id,
      flowId: legacy.flowId,
      subflowId: subflow.subflowId
    });
    expect(repeated.parentFlow.metadata).toMatchObject({ flowRepresentationKind: "orchestration" });
    expect(repeated.graphFlow.flowId).toBe(subflow.graphFlowId);

    const { flowRepresentationKind: _kind, flowRepresentationVersion: _version, ...unmarkedMetadata } = repeated.parentFlow.metadata ?? {};
    await (service as any).repositories.flows.put({ ...repeated.parentFlow, metadata: unmarkedMetadata });
    const repaired = await service.migrateLegacyFlowRepresentation({
      projectId: project.id,
      flowId: legacy.flowId,
      subflowId: subflow.subflowId
    });
    expect(repaired.parentFlow.metadata).toMatchObject({
      flowRepresentationVersion: 1,
      flowRepresentationKind: "orchestration"
    });
    expect((await service.getFlow(project.id, legacy.flowId)).metadata).toMatchObject({
      flowRepresentationVersion: 1,
      flowRepresentationKind: "orchestration"
    });
  });
  it("finalizes an interrupted migration when the explicit legacy parent is already empty", async () => {
    const project = await service.createProject({ name: "Interrupted legacy migration" });
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "task",
      artifact: { schemaVersion: "0.1", taskId: "task.interrupted", name: "Interrupted", recordingIds: [], createdAt: 1, updatedAt: 1 }
    });
    const migration = await service.migrateFlows(project.id);
    const legacy = await service.getFlow(project.id, migration.outcomes[0]!.flowId);
    const subflow = await service.createFlowSubflow({
      projectId: project.id,
      flowId: legacy.flowId,
      name: "Interrupted target",
      role: "primary"
    });
    const blankTarget = await service.getFlow(project.id, subflow.graphFlowId!);
    const target = await service.saveFlow({
      projectId: project.id,
      flow: {
        ...blankTarget,
        nodes: [{ id: "migrated-start", definitionId: "builtin.control.start" }],
        edges: [],
        ...(legacy.evidenceReferences ? { evidenceReferences: legacy.evidenceReferences } : {}),
        ...(legacy.executionDefaults ? { executionDefaults: structuredClone(legacy.executionDefaults) } : {})
      }
    });
    await service.setFlowMapFallback({
      projectId: project.id,
      flowId: legacy.flowId,
      kind: "subflow",
      targetSubflowId: subflow.subflowId
    });
    const { executionDefaults: _executionDefaults, ...legacyWithoutExecutionDefaults } = legacy;
    await (service as any).repositories.flows.put({
      ...legacyWithoutExecutionDefaults,
      nodes: [],
      edges: []
    });

    const finalized = await service.migrateLegacyFlowRepresentation({
      projectId: project.id,
      flowId: legacy.flowId,
      subflowId: subflow.subflowId
    });

    expect(finalized.parentFlow).toMatchObject({
      nodes: [],
      edges: [],
      metadata: { flowRepresentationVersion: 1, flowRepresentationKind: "orchestration" }
    });
    expect(finalized.graphFlow.nodes).toEqual(target.nodes);
    expect(finalized.graphFlow.edges).toEqual(target.edges);
    expect(await service.getFlowRouter(project.id, legacy.flowId)).toMatchObject({
      fallback: { kind: "subflow", subflowId: subflow.subflowId }
    });
  });
});

// Obviously synthetic: every assertion below is that this string is absent from
// what the run persisted, so a realistic credential would itself be the leak.
const SUPPLIED_RUN_INPUT = "synthetic-run-input-that-must-never-be-persisted";

describe("Automation Studio run inputs at rest", () => {
  let dataDir: string;
  let service: AutomationStudioService;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-run-inputs-at-rest-"));
    service = new AutomationStudioService({ dataDir, seedFixture: false });
  });

  afterEach(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("persists each run input's key with its value withheld, in the session record and every runtime event chunk", async () => {
    const project = await service.createProject({ name: "Run inputs at rest" });
    const parent = await createRoutedFlowTypingBoundInput(service, project.id);

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: parent.flowId, inputs: { "web.secret.password": SUPPLIED_RUN_INPUT }, adaptiveMode: "no_llm_intervention" });

    await service.close();
    service = new AutomationStudioService({ dataDir, seedFixture: false });
    expect((await service.getRuntimeSession(project.id, run.runId))?.metadata?.inputs).toEqual({ "web.secret.password": AUTOMATION_STUDIO_WITHHELD_VALUE });
    const envelopes = (await runtimeEventChunks(dataDir, run.runId)).flatMap((chunk) => chunk.events.filter((event) => event.eventKind === "run_summary"));
    expect(envelopes.length).toBeGreaterThan(0);
    for (const envelope of envelopes) expect(envelope.payload?.inputs).toEqual({ "web.secret.password": AUTOMATION_STUDIO_WITHHELD_VALUE });
    expect(await filesHolding(dataDir, SUPPLIED_RUN_INPUT)).toEqual([]);
  });

  it("runs a queued session with the inputs its run request supplies, never the withheld values its record holds", async () => {
    const project = await service.createProject({ name: "Queued run inputs" });
    const parent = await createRoutedFlowTypingBoundInput(service, project.id);
    const queued = await service.startRuntimeSession({ projectId: project.id, flowId: parent.flowId, inputs: { note: "synthetic-queued-input" } });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: parent.flowId, runId: queued.runId, adaptiveMode: "no_llm_intervention" });

    expect(run.runId).toBe(queued.runId);
    expect(run.trace?.values).toBeDefined();
    expect(run.trace?.values).not.toHaveProperty("note");
  });
});

// Obviously synthetic, for the same reason as the run input above.
const LIVE_PATCH_NOTE = "synthetic-live-patch-input-that-must-never-be-persisted";

describe("Automation Studio live-patch reruns and run inputs", () => {
  let dataDir: string;
  let service: AutomationStudioService;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-live-patch-inputs-"));
    service = new AutomationStudioService({
      dataDir,
      seedFixture: false,
      llmProviderResolver: () => ({
        metadata: { provider: "mock", model: "patch-model" },
        runTask: async (request) => request.taskKind === "runtime_patch"
          ? {
            response: { kind: "runtime_patch", summary: "Retry the division.", riskLevel: "low", patches: [{ kind: "temporary_wait_retry", targetNodeId: "divide", retryCount: 1, reason: "Retry the division with the run's inputs." }] },
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.002 }
          }
          : { response: { kind: "diagnosis", summary: "The gate failed." }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 } }
      })
    });
  });

  afterEach(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  for (const representation of ["routed", "legacy single graph"] as const) {
    it(`seeds a rerun from the failed attempt as the run executed it, while the saved trace withholds its inputs (${representation})`, async () => {
      const project = await service.createProject({ name: `Live-patch rerun inputs, ${representation}` });
      const flowId = representation === "routed" ? await createRoutedGateFlow(service, project.id) : await createLegacyGateFlow(service, project.id);

      const run = await service.runRuntimeSession({ projectId: project.id, flowId, inputs: { left: 6, right: 3, note: LIVE_PATCH_NOTE } });
      if (representation !== "routed") expect(run.metadata).toMatchObject({ compatibilityDiagnostics: [expect.objectContaining({ code: "flow.legacy_single_graph_execution" })] });

      // The rerun starts at `divide`, which divides the run's inputs: 6 / 3
      // succeeds, while `[withheld]` reads as 0 and fails the division.
      const detail = await service.getFlowRunDetail(project.id, run.runId);
      // `traceStatus: "succeeded"` is what proves the rerun ran on the run's own
      // inputs rather than on `[withheld]`. The rerun restores nothing here,
      // because the failed attempt declared no expected state to compare it
      // against, and that is now recorded instead of being read as success.
      expect(detail?.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({
        kind: "temporary_wait_retry",
        traceStatus: "succeeded",
        restoredExpectedState: false,
        verification: { status: "unverifiable", reason: "no_expectation_declared" }
      })]);
      const saved = await service.getRuntimeSession(project.id, run.runId);
      expect(saved?.trace?.attempts.find((attempt) => attempt.nodeId === "gate")).toMatchObject({ status: "failed", inputs: { left: AUTOMATION_STUDIO_WITHHELD_VALUE, right: AUTOMATION_STUDIO_WITHHELD_VALUE, note: AUTOMATION_STUDIO_WITHHELD_VALUE } });
      expect(await filesHolding(dataDir, LIVE_PATCH_NOTE)).toEqual([]);
    });
  }
});

// `gate` fails because nothing answers its binding, with the run's inputs in its
// attempt; `divide` is disconnected until a patch starts a rerun there.
const gateNodes = [
  { id: "start", definitionId: "builtin.control.start" },
  { id: "gate", definitionId: "builtin.data.constant", parameterValues: { value: { $state: { path: "run.never-supplied" } } } },
  { id: "divide", definitionId: "builtin.math.divide", parameterValues: {} },
  { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
];
const gateEdges = [
  { id: "start.gate", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "gate", targetPortId: "in" },
  { id: "divide.end", sourceNodeId: "divide", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
];

function adaptiveMetadata(): JsonObject {
  return {
    adaptationModeVersion: 1,
    adaptationMode: "fully_adaptive",
    adaptationPolicySettings: { preset: "adaptive", proposalMode: "auto", allowRuntimeRecovery: true, allowCreateRecoveryPaths: true, allowModifySubflows: true, allowCreateSubflows: true, allowModifyRouter: true, allowModifyExpectations: true, allowModifyActionTargets: true },
    trainingModeSettings: {
      mode: "continuous_adaptive",
      allowLlmIntervention: true,
      allowRuntimeRecovery: true,
      allowAdaptationCreation: true,
      proposalApprovalMode: "auto",
      allowPromotion: true,
      requireFirstManualReviewBeforeAutoPromotion: false,
      budgets: { maxInterventionsPerRun: 2, maxTokensPerRun: 12000, maxCostUsdPerTrainingWindow: 5, exhaustedBehavior: "ask" }
    }
  };
}

async function createRoutedGateFlow(service: AutomationStudioService, projectId: string): Promise<string> {
  const parent = await service.createFlow({ projectId, flowId: "flow.live-patch-inputs", name: "Live-patch inputs" });
  await service.saveFlow({ projectId, flow: { ...parent, metadata: { ...(parent.metadata ?? {}), ...adaptiveMetadata() } } });
  const subflow = await service.createFlowSubflow({ projectId, flowId: parent.flowId, name: "Primary", role: "primary" });
  const graph = await service.getFlow(projectId, subflow.graphFlowId!);
  await service.saveFlow({ projectId, flow: { ...graph, nodes: gateNodes, edges: gateEdges } });
  await service.setFlowMapFallback({ projectId, flowId: parent.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  return parent.flowId;
}

async function createLegacyGateFlow(service: AutomationStudioService, projectId: string): Promise<string> {
  await service.saveProjectArtifact({
    projectId,
    kind: "task",
    artifact: { schemaVersion: "0.1", taskId: "task.live-patch-inputs", name: "Live-patch inputs", recordingIds: [], createdAt: 1, updatedAt: 1 }
  });
  const migration = await service.migrateFlows(projectId);
  const legacy = await service.getFlow(projectId, migration.outcomes[0]!.flowId);
  await service.saveFlow({ projectId, flow: { ...legacy, nodes: gateNodes, edges: gateEdges, metadata: { ...(legacy.metadata ?? {}), ...adaptiveMetadata() } } });
  return legacy.flowId;
}

async function createRoutedFlowTypingBoundInput(service: AutomationStudioService, projectId: string) {
  const parent = await service.createFlow({ projectId, flowId: "flow.run-inputs", name: "Run inputs" });
  const subflow = await service.createFlowSubflow({ projectId, flowId: parent.flowId, name: "Primary", role: "primary" });
  const graph = await service.getFlow(projectId, subflow.graphFlowId!);
  await service.saveFlow({
    projectId,
    flow: {
      ...graph,
      nodes: [
        { id: "start", definitionId: "builtin.control.start" },
        { id: "type", definitionId: "builtin.policy.action", parameterValues: { outputId: "web.dom.type", parameters: { selector: "#password", text: { $state: { path: "web.secret.password" } } } } }
      ],
      edges: [{ id: "start.type", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "type", targetPortId: "in" }]
    }
  });
  await service.setFlowMapFallback({ projectId, flowId: parent.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  return parent;
}

type RuntimeEventChunk = { schemaVersion: string; streamKind: string; streamId: string; events: Array<{ eventKind: string; payload?: Record<string, unknown> }> };

async function runtimeEventChunks(root: string, runId: string): Promise<RuntimeEventChunk[]> {
  const chunks: RuntimeEventChunk[] = [];
  for (const file of await filesUnder(root)) {
    if (!file.endsWith(".json")) continue;
    const document = JSON.parse(await readFile(file, "utf8")) as Partial<RuntimeEventChunk>;
    if (document.schemaVersion === "automation-studio.event-chunk.v1" && document.streamKind === "runtime" && document.streamId === runId) chunks.push(document as RuntimeEventChunk);
  }
  return chunks;
}

async function filesHolding(root: string, literal: string): Promise<string[]> {
  const needles = [Buffer.from(literal, "utf8"), Buffer.from(literal, "utf16le")];
  const holding: string[] = [];
  for (const file of await filesUnder(root)) {
    const bytes = await readFile(file);
    if (needles.some((needle) => bytes.includes(needle))) holding.push(path.relative(root, file));
  }
  return holding;
}

async function filesUnder(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}
