import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAutomationStudioFlowExpansionFixture, createAutomationStudioLargeProjectFixture, createCallFlowNode, stateValue, type StateSnapshot } from "../model/index.ts";
import { generateFlowTypeScript } from "../dsl/index.ts";
import { AutomationStudioService } from "./service.ts";
import { AutomationStudioNativeNodeRuntime } from "./native-node-runtime.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioImporterSdkManifest } from "../nodes/index.ts";
import { IoRegistry, createEnvelope } from "../../../io/index.ts";
import type { JsonObject } from "../../../core/index.ts";
import { SQLiteRepository } from "../../database-manager/storage/sqlite-repository.ts";

let tempRoot: string;
const services = new Set<AutomationStudioService>();

function createService(...args: ConstructorParameters<typeof AutomationStudioService>): AutomationStudioService {
  const service = new AutomationStudioService(...args);
  services.add(service);
  return service;
}

function stateFixture(id: string, timestamp: number, title: string): StateSnapshot {
  return {
    id,
    timestamp,
    namespaces: {
      web: {
        schemaId: "web",
        schemaVersion: "0.1",
        values: { title: { type: "string", value: title, observedAt: timestamp } }
      }
    }
  };
}

async function createRunnableCanonicalFlow(
  service: AutomationStudioService,
  projectId: string,
  input: { flowId: string; metadata?: JsonObject }
) {
  const flow = await service.createFlow({ projectId, flowId: input.flowId, name: input.flowId });
  const runnable = {
    ...flow,
    metadata: { ...(flow.metadata ?? {}), ...(input.metadata ?? {}) },
    nodes: [
      { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
      { id: "constant", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } },
      { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
    ],
    edges: [
      { id: "start.constant", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "constant", targetPortId: "in" },
      { id: "constant.end", sourceNodeId: "constant", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
    ]
  };
  await service.saveFlow({ projectId, flow: runnable });
  return runnable;
}

async function createFailingCanonicalFlow(
  service: AutomationStudioService,
  projectId: string,
  input: { flowId: string; metadata?: JsonObject }
) {
  const flow = await service.createFlow({ projectId, flowId: input.flowId, name: input.flowId });
  const failing = {
    ...flow,
    metadata: { ...(flow.metadata ?? {}), ...(input.metadata ?? {}) },
    nodes: [
      { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
      { id: "divide", definitionId: "builtin.math.divide", parameterValues: {} }
    ],
    edges: [
      { id: "start.divide", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "divide", targetPortId: "in" }
    ]
  };
  await service.saveFlow({ projectId, flow: failing });
  return failing;
}

function adaptiveTrainingMetadata(): JsonObject {
  return {
    trainingModeSettings: {
      mode: "continuous_adaptive",
      allowLlmIntervention: true,
      allowRuntimeRecovery: true,
      allowAdaptationCreation: true,
      proposalApprovalMode: "auto",
      allowPromotion: true,
      budgets: { maxInterventionsPerRun: 2, maxTokensPerRun: 12000, maxCostUsdPerTrainingWindow: 5, exhaustedBehavior: "ask" }
    }
  };
}

describe("AutomationStudioService recording persistence", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-studio-service-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("does not seed demo fixture recordings by default", async () => {
    const service = createService({ dataDir: tempRoot });

    await expect(service.listRecordingSessions()).resolves.toEqual([]);
    await expect(service.snapshot()).resolves.toMatchObject({
      canonical: {
        recordingSessions: [],
        normalizedTimelines: [],
        signalRegistries: [],
        learnedTaskModels: [],
        policyGraphs: []
      }
    });
  });

  it("keeps lightweight snapshots free of canonical recording payloads", async () => {
    const service = createService({ dataDir: tempRoot });
    const project = await service.createProject({ name: "Snapshot bounds", domainId: "example" });
    await service.createRecording({
      projectId: project.id,
      recordingId: "recording.snapshot-bound",
      domainId: "example",
      initialState: { timestamp: 1, namespaces: {} }
    });

    const lightweight = await service.snapshot("example", { includeCanonical: false });
    const compatible = await service.snapshot("example");

    expect(lightweight.canonical?.recordingSessions).toEqual([]);
    expect(lightweight.canonical?.normalizedTimelines).toEqual([]);
    expect(compatible.canonical?.recordingSessions.map((recording) => recording.recordingId)).toContain("recording.snapshot-bound");
  });

  it("normalizes recorded action element targets before storage", async () => {
    const service = createService({ dataDir: tempRoot });
    const project = await service.createProject({ name: "Element targets", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.element-target", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: {
        type: "action",
        actionType: "click",
        parameters: {},
        target: { type: "client-target", metadata: { visibleText: "Save changes", testId: "save", selector: "button[data-testid='save']", token: "secret" } },
        origin: "operator",
        startedAt: 2,
        timestamp: 2
      }
    });
    const stored = await service.getRecordingSession(recording.recordingId, project.id);
    const action = stored.timeline.find((entry) => entry.type === "action");
    expect(action).toMatchObject({
      type: "action",
      target: { elementTarget: { kind: "element", fingerprint: { visibleText: "Save changes", testId: "save", selector: "button[data-testid='save']" } } },
      parameters: { target: { kind: "element", fingerprint: { testId: "save" } } }
    });
    expect((action as any)?.target?.elementTarget?.fingerprint?.metadata).toBeUndefined();
  });

  it("normalizes mapper element targets in recording Flow proposals", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, {
      packageId: "example.importer",
      packageVersion: "1.0.0",
      implementations: {},
      recordingMappers: {
        "click-mapper": () => ({
          outputId: "click",
          parameters: { target: { selector: "button[data-testid='save']", visibleText: "Save", testId: "save" } },
          confidence: 0.9
        })
      }
    });
    const service = createService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Mapped element target", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.mapper-element-target", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: {}, timestamp: 2 } });
    const { proposals: [proposal] } = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    expect(proposal?.candidates[0]?.parameters.target).toMatchObject({
      kind: "element",
      source: "mapper",
      fingerprint: { selector: "button[data-testid='save']", visibleText: "Save", testId: "save" }
    });
  });

  it("turns mapped observations into reviewed Flow actions without making action inputs policy state", async () => {
    const io = new IoRegistry();
    let dispatches = 0;
    io.registerInput("example", { definition: { id: "clicked", title: "Clicked", role: "action", outputId: "click" }, mode: "stream", subscribe: (handler) => { queueMicrotask(() => handler(createEnvelope({ domainId: "example", ioId: "clicked", payload: { ok: true } }))); return () => undefined; } });
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => { dispatches += 1; return { ok: true, domainId: "example", outputId: request.outputId, payload: { done: true } }; } });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }] };
    let mapperSawElementMatcher = false;
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": (observation, context) => { mapperSawElementMatcher = typeof context.elementMatcher.bestCandidate === "function"; return observation.type === "observation" ? { outputId: "click", parameters: { target: "submit" }, sourceInputIds: ["clicked"], expectedConfirmation: { inputId: "clicked", timeoutMs: 100 }, confidence: 0.9 } : null; } } });
    const service = createService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Mapped recording", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.mapped", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } } });
    const { proposals: [proposal], issues } = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    expect(issues).toEqual([]);
    expect(mapperSawElementMatcher).toBe(true);
    expect(proposal?.candidates[0]).toMatchObject({ actionEntryId: proposal?.candidates[0]?.sourceObservationIds[0], outputId: "click", sourceInputIds: ["clicked"], policyStateEligible: false, expectedConfirmation: { inputId: "clicked" } });
    expect(proposal?.candidates[0]?.evidence).toEqual([{ layer: "recording", artifactId: recording.recordingId, entryId: proposal?.candidates[0]?.sourceObservationIds[0] }]);
    expect(proposal?.review).toBeUndefined();
    const reviewed = await service.reviewRecordingFlowProposal({
      projectId: project.id,
      proposalId: proposal!.proposalId,
      decision: "approved",
      destination: { kind: "flow", name: "Approved clicks" }
    });
    expect(reviewed.flow?.nodes[0]).toMatchObject({ definitionId: "builtin.policy.action", parameterValues: { outputId: "click", confirmationInputId: "clicked" }, metadata: { actionEntryId: proposal?.candidates[0]?.actionEntryId, timelineEntryId: proposal?.candidates[0]?.actionEntryId, rawEvidenceImmutable: true } });
    const savedEdit = await service.saveFlow({ projectId: project.id, flow: { ...reviewed.flow!, nodes: reviewed.flow!.nodes.map((node) => ({ ...node, label: "Edited click", metadata: { ...(node.metadata ?? {}), sourceObservationIds: ["forged"] } })) } });
    expect(savedEdit.nodes[0]).toMatchObject({ label: "Edited click", metadata: { sourceObservationIds: proposal!.candidates[0]!.sourceObservationIds, manualProvenance: [{ changedFields: ["label"] }] } });
    const session = await service.runRuntimeSession({ projectId: project.id, flowId: reviewed.flow!.flowId });
    expect(session.status).toBe("succeeded");
    expect(dispatches).toBe(1);

    const withoutConfirmation = new IoRegistry();
    withoutConfirmation.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    service.bindIoRuntime(withoutConfirmation, "example");
    const confirmationInvalidated = (await service.listPipelineArtifacts(project.id, { revalidateRecordingFlowProposals: true })).recordingFlowProposals.find((item) => item.proposalId === proposal!.proposalId);
    expect(confirmationInvalidated?.status).toBe("invalidated");
    expect(confirmationInvalidated?.invalidation?.reasons).toEqual(expect.arrayContaining([expect.stringContaining("Confirmation input clicked")]));

    const changedManifest = { ...manifest, packageVersion: "2.0.0", recordingMappers: [{ ...manifest.recordingMappers![0]!, version: "2.0.0" }] };
    const changedRuntime = new AutomationStudioNativeNodeRuntime().register(changedManifest, { packageId: "example.importer", packageVersion: "2.0.0", implementations: {}, recordingMappers: { "click-mapper": () => null } });
    service.bindNativeNodeRuntime(changedRuntime);
    const invalidated = (await service.listPipelineArtifacts(project.id, { revalidateRecordingFlowProposals: true })).recordingFlowProposals.find((item) => item.proposalId === proposal!.proposalId);
    expect(invalidated).toMatchObject({ status: "invalidated", invalidation: { affectedFlowIds: [reviewed.flow!.flowId] } });
  });

  it("generates multiple proposal attempts and deletes one without deleting the recording", async () => {
    const io = new IoRegistry();
    io.registerInput("example", { definition: { id: "clicked", title: "Clicked", role: "action", outputId: "click" }, mode: "stream", subscribe: (handler) => { queueMicrotask(() => handler(createEnvelope({ domainId: "example", ioId: "clicked", payload: { ok: true } }))); return () => undefined; } });
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": () => ({ outputId: "click", parameters: { target: "submit" }, sourceObservationIds: ["entry.shared-state"], confidence: 0.9 }) } });
    const service = createService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Proposal attempts", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.attempts", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const first = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });
    const second = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "llm_assisted", title: "Clean checkout", instructions: "Prefer one reusable click action." });
    const firstProposalId = first.recordingFlowProposals![0]!.proposalId;
    const secondProposalId = second.recordingFlowProposals![0]!.proposalId;
    const firstCandidate = first.recordingFlowProposals![0]!.candidates[0]!;

    expect(firstProposalId).not.toBe(secondProposalId);
    expect(firstCandidate.actionEntryId).toBe(firstCandidate.sourceObservationIds[0]);
    expect(firstCandidate.sourceObservationIds).toContain("entry.shared-state");
    expect(second.recordingFlowProposals![0]!.metadata).toMatchObject({ generationMode: "llm_assisted", title: "Clean checkout", instructions: "Prefer one reusable click action." });
    expect((await service.listPipelineArtifacts(project.id)).recordingFlowProposals.map((proposal) => proposal.proposalId)).toEqual(expect.arrayContaining([firstProposalId, secondProposalId]));

    await service.deleteProposal({ projectId: project.id, proposalId: firstProposalId });

    const artifacts = await service.listPipelineArtifacts(project.id);
    expect(artifacts.recordingFlowProposals.map((proposal) => proposal.proposalId)).toContain(secondProposalId);
    expect(artifacts.recordingFlowProposals.map((proposal) => proposal.proposalId)).not.toContain(firstProposalId);
    await expect(service.getRecordingSession(recording.recordingId, project.id)).resolves.toMatchObject({ recordingId: recording.recordingId });
  }, 15_000);

  it("returns lightweight project workspace summaries for sidebar loading", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": () => ({ outputId: "click", parameters: { target: "submit" }, confidence: 0.9 }) } });
    const service = createService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Workspace summary", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.summary", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId });
    const generated = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });
    await service.createFlow({ projectId: project.id, flowId: "flow.summary", name: "Summary flow" });

    const summary = await service.getProjectWorkspaceSummary(project.id);

    expect(summary.project).toMatchObject({ projectId: project.id, counts: { recordings: 1, proposals: 1, flows: 1 } });
    expect(summary.recordings).toEqual([expect.objectContaining({ recordingId: recording.recordingId, proposalCount: 1 })]);
    expect(summary.recordings[0]).not.toHaveProperty("timeline");
    expect(summary.proposals).toEqual([expect.objectContaining({ proposalId: generated.recordingFlowProposals![0]!.proposalId, recordingId: recording.recordingId, kind: "recording_flow" })]);
    expect(summary.flows).toEqual([expect.objectContaining({ flowId: "flow.summary", nodeCount: 0, edgeCount: 0 })]);
  });

  it("creates Flows with default settings metadata", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Default settings" });

    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.defaults", name: "Default settings Flow" });

    expect(flow.metadata).toMatchObject({
      trainingMode: "continuous_adaptive",
      proposalMode: "auto",
      proposalApprovalMode: "auto",
      llmProvider: "host",
      adaptationPolicyId: "policy.default",
      budgetExhaustedBehavior: "ask",
      adaptationPolicySettings: {
        preset: "adaptive",
        proposalMode: "auto",
        allowRuntimeRecovery: true,
        allowCreateRecoveryPaths: true,
        allowModifySubflows: true,
        allowCreateSubflows: true,
        allowModifyRouter: true,
        allowModifyExpectations: true,
        allowModifyActionTargets: true,
        allowDeleteOrDisableBehavior: false,
        allowExternalSideEffects: false,
        requireApprovalForDestructiveChanges: true,
        requireApprovalForExternalSideEffects: true,
        maxInterventionsPerRun: 3,
        maxEstimatedCostUsdPerRun: 1
      },
      trainingModeSettings: {
        mode: "continuous_adaptive",
        trainForRunCount: 3,
        minimumStabilityScore: 0.9,
        allowLlmIntervention: true,
        allowRuntimeRecovery: true,
        allowAdaptationCreation: true,
        proposalApprovalMode: "auto",
        allowPromotion: true,
        budgets: {
          maxInterventionsPerRun: 2,
          maxTokensPerRun: 12000,
          maxCostUsdPerTrainingWindow: 5,
          exhaustedBehavior: "ask"
        }
      }
    });
  });

  it("lists persisted Flow metadata from the project SQL index", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Flow metadata page" });
    await service.createFlow({ projectId: project.id, flowId: "flow.metadata.1", name: "First metadata Flow" });
    await service.createFlow({ projectId: project.id, flowId: "flow.metadata.2", name: "Second metadata Flow" });

    const page = await service.listFlowMetadataPage({ projectId: project.id, limit: 10 });

    expect(page.items.map((item) => item.flowId)).toEqual(expect.arrayContaining(["flow.metadata.1", "flow.metadata.2"]));
    expect(page.items[0]).not.toHaveProperty("nodes");
    expect(page.items[0]).not.toHaveProperty("edges");
  });
  it("resolves runtime adaptation behavior into Flow run detail metadata", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Runtime adaptation context" });
    const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.runtime-context" });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(detail?.metadata).toMatchObject({
      trainingMode: "continuous_adaptive",
      trainingBehavior: {
        invokeLlm: true,
        runRecovery: true,
        createAdaptations: true,
        promoteAdaptations: true
      },
      runtimeAdaptationContext: {
        flowId: flow.flowId,
        mode: "continuous_adaptive",
        policyId: "policy.default",
        policyPreset: "adaptive",
        approvalMode: "auto",
        runsCompleted: 0,
        budget: { ok: true },
        diagnostics: []
      }
    });
  });

  it("resolves configured recovery limits into the runtime adaptation context", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Recovery limits" });
    const flow = await createRunnableCanonicalFlow(service, project.id, {
      flowId: "flow.recovery-limits",
      metadata: {
        trainingModeSettings: {
          mode: "continuous_adaptive",
          allowLlmIntervention: true,
          allowRuntimeRecovery: true,
          allowAdaptationCreation: true,
          proposalApprovalMode: "auto",
          allowPromotion: true,
          recoveryBudget: { maxRetriesPerAction: 4, maxRecoveryAttemptsPerSubflow: 5, maxReroutesPerRun: 6 },
          budgets: { maxInterventionsPerRun: 2, maxTokensPerRun: 12000, maxCostUsdPerTrainingWindow: 5, exhaustedBehavior: "ask" }
        }
      }
    });

    await expect(service.resolveRuntimeAdaptationContext({ projectId: project.id, flow })).resolves.toMatchObject({
      settings: { recoveryBudget: { maxRetriesPerAction: 4, maxRecoveryAttemptsPerSubflow: 5, maxReroutesPerRun: 6 } }
    });
  });
  it("activates train-for-runs only for runs inside the training window", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Train for runs" });
    const flow = await createRunnableCanonicalFlow(service, project.id, {
      flowId: "flow.train-for-runs",
      metadata: {
        trainingModeSettings: {
          mode: "train_for_runs",
          trainForRunCount: 1,
          allowLlmIntervention: true,
          allowRuntimeRecovery: true,
          allowAdaptationCreation: true,
          proposalApprovalMode: "auto",
          allowPromotion: true,
          budgets: { maxInterventionsPerRun: 2, maxTokensPerRun: 12000, maxCostUsdPerTrainingWindow: 5, exhaustedBehavior: "ask" }
        }
      }
    });

    const first = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const second = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });

    await expect(service.getFlowRunDetail(project.id, first.runId)).resolves.toMatchObject({
      metadata: { trainingBehavior: { invokeLlm: true, createAdaptations: true, promoteAdaptations: true }, runtimeAdaptationContext: { runsCompleted: 0 } }
    });
    await expect(service.getFlowRunDetail(project.id, second.runId)).resolves.toMatchObject({
      metadata: { trainingBehavior: { invokeLlm: false, createAdaptations: false, promoteAdaptations: false }, runtimeAdaptationContext: { runsCompleted: 1 } }
    });
  });

  it("resolves stable and continuous adaptive modes plus budget exhaustion", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Adaptive modes" });
    const stableFlow = await createRunnableCanonicalFlow(service, project.id, {
      flowId: "flow.train-until-stable",
      metadata: {
        trainingModeSettings: {
          mode: "train_until_stable",
          minimumStabilityScore: 0.5,
          allowLlmIntervention: true,
          allowRuntimeRecovery: true,
          allowAdaptationCreation: true,
          proposalApprovalMode: "auto",
          allowPromotion: true,
          budgets: { maxInterventionsPerRun: 2, maxTokensPerRun: 12000, maxCostUsdPerTrainingWindow: 5, exhaustedBehavior: "ask" }
        }
      }
    });
    const continuousFlow = await createRunnableCanonicalFlow(service, project.id, {
      flowId: "flow.continuous",
      metadata: {
        trainingModeSettings: {
          mode: "continuous_adaptive",
          allowLlmIntervention: true,
          allowRuntimeRecovery: true,
          allowAdaptationCreation: true,
          proposalApprovalMode: "auto",
          allowPromotion: true,
          budgets: { maxInterventionsPerRun: 2, maxTokensPerRun: 12000, maxCostUsdPerTrainingWindow: 0.001, exhaustedBehavior: "stop" }
        }
      }
    });
    await service.saveFlowRunDetail({
      schemaVersion: "0.1",
      summary: {
        schemaVersion: "0.1",
        projectId: project.id,
        flowId: stableFlow.flowId,
        runId: "run.stable.previous",
        status: "succeeded",
        startedAt: 1,
        finishedAt: 2,
        updatedAt: 2,
        routeDecisionCount: 0,
        subflowEntryCount: 0,
        actionAttemptCount: 0,
        interventionCount: 0,
        adaptationCount: 0
      },
      routeDecisions: [],
      subflows: [],
      interventions: [],
      adaptationIds: [],
      changeProposalIds: []
    });
    await service.saveFlowRunDetail({
      schemaVersion: "0.1",
      summary: {
        schemaVersion: "0.1",
        projectId: project.id,
        flowId: continuousFlow.flowId,
        runId: "run.cost.previous",
        status: "succeeded",
        startedAt: 1,
        finishedAt: 2,
        updatedAt: 2,
        routeDecisionCount: 0,
        subflowEntryCount: 0,
        actionAttemptCount: 0,
        interventionCount: 1,
        adaptationCount: 0,
        tokenUsage: { estimatedCostUsd: 0.01 }
      },
      routeDecisions: [],
      subflows: [],
      interventions: [],
      adaptationIds: [],
      changeProposalIds: []
    });

    const stableRun = await service.runRuntimeSession({ projectId: project.id, flowId: stableFlow.flowId });
    const continuousRun = await service.runRuntimeSession({ projectId: project.id, flowId: continuousFlow.flowId });

    await expect(service.getFlowRunDetail(project.id, stableRun.runId)).resolves.toMatchObject({
      metadata: { trainingBehavior: { invokeLlm: false, createAdaptations: false, promoteAdaptations: false }, runtimeAdaptationContext: { runsCompleted: 1 } }
    });
    await expect(service.getFlowRunDetail(project.id, continuousRun.runId)).resolves.toMatchObject({
      metadata: {
        trainingBehavior: { invokeLlm: true, createAdaptations: true, promoteAdaptations: true },
        runtimeAdaptationContext: {
          budget: { ok: false, behavior: "stop", exhausted: ["max cost per training window"] },
          diagnostics: expect.arrayContaining(["Training budget exhausted: max cost per training window."])
        }
      }
    });
  });

  it("records a missing-provider runtime diagnosis intervention when adaptive policy allows LLM", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Missing provider" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.missing-provider", metadata: adaptiveTrainingMetadata() });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    const harnessIntervention = detail?.interventions.find((intervention) => intervention.promptVersion === "automation-studio.runtime-diagnosis.v1");

    expect(run.status).toBe("failed");
    expect(harnessIntervention).toMatchObject({
      kind: "diagnosis",
      validation: { ok: true, issues: [expect.stringContaining("llm.provider_missing")] }
    });
    expect(detail?.metadata).toMatchObject({
      llmGate: {
        invoked: false,
        providerConfigured: false,
        ok: false
      }
    });
  });

  it("runs a configured runtime diagnosis provider and rolls usage into run summary", async () => {
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        metadata: { provider: "mock", model: "diagnosis-model" },
        runTask: async () => ({
          response: { kind: "diagnosis", summary: "Division failed because denominator is zero.", confidence: 0.9 },
          usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18, estimatedCostUsd: 0.002 }
        })
      })
    });
    const project = await service.createProject({ name: "Mock provider" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.mock-provider", metadata: adaptiveTrainingMetadata() });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    const harnessIntervention = detail?.interventions.find((intervention) => intervention.provider === "mock");

    expect(harnessIntervention).toMatchObject({
      provider: "mock",
      model: "diagnosis-model",
      tokenUsage: { totalTokens: 18 },
      structuredResult: { kind: "diagnosis", summary: "Division failed because denominator is zero." }
    });
    expect(detail?.summary).toMatchObject({
      interventionCount: 3,
      tokenUsage: { inputTokens: 22, outputTokens: 14, totalTokens: 36, estimatedCostUsd: 0.004 }
    });
  });

  it("tests runtime patch responses and persists resulting adaptation evidence", async () => {
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        metadata: { provider: "mock", model: "patch-model" },
        runTask: async (request) => request.taskKind === "runtime_patch"
          ? {
            response: {
              kind: "runtime_patch",
              summary: "Route around the broken confirmation node.",
              riskLevel: "medium",
              patches: [{ kind: "temporary_reroute", fromNodeId: "broken", toNodeId: "end", reason: "The confirmation node implementation is missing." }]
            },
            usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.004 }
          }
          : {
            response: { kind: "diagnosis", summary: "The confirmation node has no runtime implementation." },
            usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.001 }
          }
      })
    });
    const project = await service.createProject({ name: "Runtime patch" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.runtime-patch", name: "Runtime patch Flow" });
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...flow,
        metadata: { ...(flow.metadata ?? {}), ...adaptiveTrainingMetadata() },
        nodes: [
          { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
          { id: "constant", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } },
          { id: "broken", definitionId: "unknown.confirmation", parameterValues: {} },
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: [
          { id: "start.constant", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "constant", targetPortId: "in" },
          { id: "constant.broken", sourceNodeId: "constant", sourcePortId: "success", targetNodeId: "broken", targetPortId: "in" }
        ]
      }
    });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(detail?.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({
      kind: "temporary_reroute",
      preflightOk: true,
      restoredExpectedState: true,
      adaptationId: expect.stringContaining("adaptation."),
      changeProposalId: expect.stringContaining("proposal.")
    })]);
    expect(detail?.adaptationIds).toHaveLength(1);
    expect(detail?.changeProposalIds).toHaveLength(1);
    await expect(service.getFlowAdaptation(project.id, flow.flowId, detail!.adaptationIds[0]!)).resolves.toMatchObject({
      status: "validated",
      proposalId: detail?.changeProposalIds[0],
      patch: [{ kind: "edit_router", targetId: "broken" }],
      metadata: {
        approvalDecision: {
          mode: "auto",
          autoApply: false,
          requiresManualApproval: true,
          reason: "Structural adaptations require manual review before durable promotion."
        }
      }
    });
  });

  it("auto-applies validated low-risk runtime adaptations and records approval decisions", async () => {
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        metadata: { provider: "mock", model: "patch-model" },
        runTask: async (request) => request.taskKind === "runtime_patch"
          ? {
            response: {
              kind: "runtime_patch",
              summary: "Retry after state settles.",
              riskLevel: "low",
              patches: [{ kind: "temporary_wait_retry", targetNodeId: "constant", retryCount: 2, timeoutMs: 250, reason: "Retry the stable constant node." }]
            },
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.002 }
          }
          : {
            response: { kind: "diagnosis", summary: "The divide node failed, but a deterministic retry candidate exists." },
            usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 }
          }
      })
    });
    const project = await service.createProject({ name: "Runtime auto promote" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.runtime-auto-promote", name: "Runtime auto promote Flow" });
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...flow,
        metadata: { ...(flow.metadata ?? {}), ...adaptiveTrainingMetadata() },
        nodes: [
          { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
          { id: "divide", definitionId: "builtin.math.divide", parameterValues: {} },
          { id: "constant", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } },
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: [
          { id: "start.divide", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "divide", targetPortId: "in" },
          { id: "constant.end", sourceNodeId: "constant", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
        ]
      }
    });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    const adaptation = await service.getFlowAdaptation(project.id, flow.flowId, detail!.adaptationIds[0]!);

    expect(adaptation).toMatchObject({
      status: "applied",
      patch: [{ kind: "edit_expectation", targetId: "constant" }],
      metadata: {
        approvalDecision: {
          autoApply: true,
          requiresManualApproval: false,
          reason: "Validated low-risk non-structural adaptation can be applied automatically."
        },
        applicationRecord: { durable: true }
      }
    });
    await expect(service.getFlow(project.id, flow.flowId)).resolves.toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ id: "constant", parameterValues: { value: "ok", timeoutMs: 250, retryCount: 2 } })])
    });
    expect(detail?.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({
      kind: "temporary_wait_retry",
      approvalDecision: expect.objectContaining({ autoApply: true })
    })]);
  });

  it("completes an adaptive runtime loop and makes the next run deterministic", async () => {
    let llmCalls = 0;
    const manifest: AutomationStudioImporterSdkManifest = {
      schemaVersion: "0.1",
      sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
      packageId: "example.adaptive",
      packageVersion: "1.0.0",
      domainId: "example",
      nodes: [{
        schemaVersion: "0.1",
        id: "example.drift-action",
        version: "1.0.0",
        label: "Drift Action",
        description: "Fails until a retry parameter is durably learned.",
        category: "custom",
        source: { kind: "importer", domainId: "example", packageId: "example.adaptive", implementationKey: "drift" },
        availability: { kind: "domain", domainId: "example" },
        capabilities: { executable: true, retryable: true, stateAware: true },
        requiredRuntimeCapabilities: ["example.host"],
        inputs: [],
        outputs: [{ id: "done", label: "Done", valueType: "boolean" }],
        parameters: []
      }]
    };
    const nativeRuntime = new AutomationStudioNativeNodeRuntime({ runtimeCapabilities: ["example.host"] }).register(manifest, {
      packageId: "example.adaptive",
      packageVersion: "1.0.0",
      implementations: {
        drift: ({ parameters }) => parameters.retryCount === 2
          ? { status: "success", route: "success", outputs: { done: true } }
          : { status: "failed", route: "failed", outputs: { error: "Target drift was not recovered." } }
      }
    });
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        metadata: { provider: "mock", model: "adaptive-loop" },
        runTask: async (request) => {
          llmCalls += 1;
          return request.taskKind === "runtime_patch"
            ? {
              response: {
                kind: "runtime_patch",
                summary: "Retry the drift action once the state settles.",
                riskLevel: "low",
                patches: [{ kind: "temporary_wait_retry", targetNodeId: "drift", retryCount: 2, timeoutMs: 100, reason: "The action succeeds after a deterministic retry setting." }]
              },
              usage: { inputTokens: 10, outputTokens: 6, totalTokens: 16, estimatedCostUsd: 0.002 }
            }
            : {
              response: { kind: "diagnosis", summary: "The drift action needs a retry setting." },
              usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 }
            };
        }
      })
    }).bindNativeNodeRuntime(nativeRuntime);
    const project = await service.createProject({ name: "Adaptive Loop", domainId: "example" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.adaptive-loop", name: "Adaptive Loop Flow" });
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...flow,
        metadata: { ...(flow.metadata ?? {}), ...adaptiveTrainingMetadata() },
        nodes: [
          { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
          { id: "drift", definitionId: "example.drift-action", parameterValues: {} },
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: [
          { id: "start.drift", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "drift", targetPortId: "in" },
          { id: "drift.end", sourceNodeId: "drift", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
        ]
      }
    });

    const first = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const firstDetail = await service.getFlowRunDetail(project.id, first.runId);
    const learnedFlow = await service.getFlow(project.id, flow.flowId);
    const second = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const secondDetail = await service.getFlowRunDetail(project.id, second.runId);

    expect(first.status).toBe("succeeded");
    expect(firstDetail?.metadata).toMatchObject({ adaptiveRetry: { attempted: true, status: "succeeded" } });
    expect(firstDetail?.metadata?.adaptiveMetrics).toMatchObject({
      durableBehaviorChanged: true,
      deterministicSuccessAfterAdaptation: true,
      adaptationApplyCount: 1
    });
    expect(firstDetail?.interventions.map((intervention) => intervention.kind)).toEqual(["diagnosis", "diagnosis", "runtime_patch"]);
    expect(firstDetail?.adaptationIds).toHaveLength(1);
    await expect(service.getFlowAdaptation(project.id, flow.flowId, firstDetail!.adaptationIds[0]!)).resolves.toMatchObject({
      status: "applied",
      metadata: { approvalDecision: { autoApply: true }, applicationRecord: { durable: true } }
    });
    expect(learnedFlow.nodes.find((node) => node.id === "drift")?.parameterValues).toMatchObject({ retryCount: 2, timeoutMs: 100 });
    expect(second.status).toBe("succeeded");
    expect(secondDetail?.interventions).toEqual([]);
    expect(llmCalls).toBe(2);
  });

  it("ignores stale object-backed proposal artifacts during proposal refresh", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": () => ({ outputId: "click", parameters: { target: "submit", payload: "x".repeat(300_000) }, confidence: 0.9 }) } });
    const service = createService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Stale proposal object", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.stale-proposal-object", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId });
    const generated = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });
    const staleProposalId = generated.recordingFlowProposals![0]!.proposalId;
    const sharedObjectDir = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "objects", "shared");
    const sharedObjects = await readdir(sharedObjectDir).catch(() => []);
    await Promise.all(sharedObjects.map((fileName) => rm(path.join(sharedObjectDir, fileName), { force: true })));

    const artifacts = await service.listPipelineArtifacts(project.id);
    expect(artifacts.recordingFlowProposals.map((proposal) => proposal.proposalId)).toContain(staleProposalId);

    const regenerated = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });
    expect(regenerated.recordingFlowProposals?.[0]?.proposalId).toBeTruthy();
  });

  it("reports when direct generation produces no proposal artifact", async () => {
    const service = createService({ dataDir: tempRoot });
    const project = await service.createProject({ name: "Empty proposal generation", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.empty-proposal", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const result = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });

    expect(result.proposal).toBeUndefined();
    expect(result.recordingFlowProposals).toBeUndefined();
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("reports when proposal mapping has state snapshots but no actions", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": () => null } });
    const service = createService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "State-only proposal generation", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.state-only-proposal", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "client.state_snapshot", payload: { state: { timestamp: 2, namespaces: {} } } } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const result = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });

    expect(result.recordingFlowProposals).toBeUndefined();
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("No mapper-visible entries remained"),
      expect.stringContaining("No proposal artifact was generated")
    ]));
  });

  it("creates proposal candidates directly from normalized action entries when mapper does not remap them", async () => {
    const io = new IoRegistry();
    io.registerInput("example", { definition: { id: "clicked", title: "Clicked", role: "action", outputId: "click" }, mode: "stream", subscribe: () => () => undefined });
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": () => null } });
    const service = createService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Direct action proposals", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.direct-action-proposal", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: {
        type: "action",
        actionType: "click",
        outputId: "click",
        confirmationInputId: "clicked",
        parameters: { target: "submit" },
        origin: "operator",
        startedAt: 2,
        completedAt: 2,
        metadata: { inputId: "clicked", policyEligible: true }
      }
    });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const result = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });

    expect(result.recordingFlowProposals?.[0]?.candidates[0]).toMatchObject({
      outputId: "click",
      parameters: { target: "submit" },
      sourceInputIds: ["clicked"],
      expectedConfirmation: { inputId: "clicked" }
    });
  });

  it("uses action events as mapper inputs and leaves state snapshots as linked context", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const seenObservationIds: string[] = [];
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, {
      packageId: "example.importer",
      packageVersion: "1.0.0",
      implementations: {},
      recordingMappers: {
        "click-mapper": (observation) => {
          seenObservationIds.push(observation.observationId);
          return observation.type === "action"
            ? { outputId: "click", parameters: { target: "submit" }, confidence: 0.9 }
            : null;
        }
      }
    });
    const service = createService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Compacted mapper recording", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.mapper-compaction", domainId: "example", startedAt: 0, initialState: { timestamp: 0, namespaces: {} } });
    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: [
        ...[100, 500, 900].map((offset) => ({
          id: `snapshot.${offset}`,
          type: "observation",
          observationType: "client.state_snapshot",
          timestamp: offset,
          payload: { state: { timestamp: offset, namespaces: { web: { schemaId: "web", schemaVersion: "0.1", values: { frame: stateValue("integer", offset, offset) } } } } }
        } as any)),
        { id: "action.click", type: "action", actionType: "click", parameters: {}, origin: "operator", timestamp: 1_000, monotonicOffsetMs: 1_000, startedAt: 1_000 } as any,
        ...[1_100, 1_500, 2_000].map((offset) => ({
          id: `snapshot.${offset}`,
          type: "observation",
          observationType: "client.state_snapshot",
          timestamp: offset,
          payload: { state: { timestamp: offset, namespaces: { web: { schemaId: "web", schemaVersion: "0.1", values: { frame: stateValue("integer", offset, offset) } } } } }
        } as any))
      ]
    });

    const { proposals, issues } = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });
    const review = await service.createNormalizationReview({ projectId: project.id, recordingId: recording.recordingId });

    expect(proposals).toHaveLength(1);
    expect(seenObservationIds).toEqual(["action.click"]);
    expect(issues).not.toContain("Compacted 2 high-frequency state entries before mapper proposal generation. Raw recording data was preserved.");
    expect(review.mappings).toHaveLength(2);
    expect(review.mappings).toContainEqual(expect.objectContaining({
      rawEntryId: `compacted.high-frequency-state.${recording.recordingId}`,
      status: "dropped",
      reason: "6 high-frequency state entries were preserved in the raw recording but omitted from proposal review mappings."
    }));
    await expect(service.getRecordingSession(recording.recordingId, project.id)).resolves.toMatchObject({ timeline: expect.arrayContaining([expect.objectContaining({ id: "snapshot.500" }), expect.objectContaining({ id: "snapshot.1500" })]) });
  });

  it("processes extension recordings into recording Flow proposals instead of blank policy proposals", async () => {
    const io = new IoRegistry();
    io.registerInput("example", { definition: { id: "clicked", title: "Clicked", role: "action", outputId: "click" }, mode: "stream", subscribe: () => () => undefined });
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": (observation) => observation.type === "observation" ? { outputId: "click", parameters: { target: "submit" }, sourceInputIds: ["clicked"], expectedConfirmation: { inputId: "clicked", timeoutMs: 100 }, confidence: 0.9 } : null } });
    const service = createService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Extension Process", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.extension-process", domainId: "example", startedAt: 100, initialState: { timestamp: 100, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" }, timestamp: 200, monotonicOffsetMs: 100 } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 300 });

    const processed = await service.processFinalizedRecording({ projectId: project.id, recordingId: recording.recordingId });
    const artifacts = await service.listPipelineArtifacts(project.id);

    expect(processed.status).toBe("processed");
    expect(processed.proposal).toBeUndefined();
    expect(processed.recordingFlowProposals?.[0]?.candidates[0]).toMatchObject({ outputId: "click", policyStateEligible: false });
    expect(artifacts.policyProposals.filter((proposal) => proposal.metadata?.recordingId === recording.recordingId)).toEqual([]);
    expect(artifacts.recordingFlowProposals.filter((proposal) => proposal.recordingId === recording.recordingId)).toHaveLength(1);
    expect(artifacts.normalizationReviews.filter((review) => review.recordingId === recording.recordingId)).toEqual([]);
    expect(artifacts.miningRuns.filter((run) => run.metadata?.recordingId === recording.recordingId)).toEqual([]);
  });

  it("reuses current recording Flow proposals without remapping unchanged recordings", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    let mapperCalls = 0;
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, {
      packageId: "example.importer",
      packageVersion: "1.0.0",
      implementations: {},
      recordingMappers: {
        "click-mapper": (observation) => {
          mapperCalls += 1;
          return observation.type === "observation" ? { outputId: "click", parameters: { target: "submit" }, confidence: 0.9 } : null;
        }
      }
    });
    const service = createService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Cached mapper proposal", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.cached-mapper", domainId: "example", startedAt: 100, initialState: { timestamp: 100, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" }, timestamp: 200, monotonicOffsetMs: 100 } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 300 });

    const first = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    const callsAfterFirst = mapperCalls;
    const second = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    const callsAfterSecond = mapperCalls;
    const forced = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId, force: true });

    expect(first.proposals).toHaveLength(1);
    expect(second.proposals.map((proposal) => proposal.proposalId)).toEqual(first.proposals.map((proposal) => proposal.proposalId));
    expect(callsAfterSecond).toBe(callsAfterFirst);
    expect(mapperCalls - callsAfterSecond).toBe(1);
    expect(forced.proposals[0]?.proposalId).not.toBe(first.proposals[0]?.proposalId);
  });

  it("stores project state image assets as digest-addressed object references", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "State assets" });
    const content = Buffer.from("png-bytes");
    const sha256 = createHash("sha256").update(content).digest("hex");

    const asset = await service.writeProjectObjectAsset({
      projectId: project.id,
      recordingId: "recording.capture",
      content,
      mediaType: "image/png",
      expectedSha256: sha256
    });

    expect(asset).toEqual({
      sha256,
      size: content.byteLength,
      mediaType: "image/png",
      contentRef: `automation-object://project/${encodeURIComponent(project.id)}/${sha256}`,
      apiPath: `/api/programs/automation-studio/state-assets/${encodeURIComponent(project.id)}/${sha256}`
    });
    await expect(service.readProjectObjectAsset(project.id, sha256)).resolves.toMatchObject({
      sha256,
      size: content.byteLength,
      mediaType: "image/png",
      content
    });
    await expect(readFile(path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", "recording.capture", "objects", `${sha256}.png`))).resolves.toEqual(content);
  });

  it("rejects state image assets whose bytes do not match the requested digest", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "State asset mismatch" });

    await expect(service.writeProjectObjectAsset({
      projectId: project.id,
      content: Buffer.from("different-bytes"),
      mediaType: "image/png",
      expectedSha256: "0".repeat(64)
    })).rejects.toThrow("digest does not match");
  });

  it("deletes recording-owned state image assets when no remaining recording references them", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Recording asset cleanup" });
    const content = Buffer.from("recording-screenshot");
    const sha256 = createHash("sha256").update(content).digest("hex");
    const asset = await service.writeProjectObjectAsset({ projectId: project.id, recordingId: "recording.with-screenshot", content, mediaType: "image/png", expectedSha256: sha256 });
    const orphanContent = Buffer.from("old-orphan-screenshot");
    const orphanSha256 = createHash("sha256").update(orphanContent).digest("hex");
    await service.writeProjectObjectAsset({ projectId: project.id, recordingId: "recording.with-screenshot", content: orphanContent, mediaType: "image/png", expectedSha256: orphanSha256 });
    const state = {
      timestamp: 1,
      namespaces: {},
      presentation: {
        defaultFrameId: "screen",
        visualFrames: [{
          id: "screen",
          coordinateSpace: { width: 100, height: 100, unit: "px" },
          layers: [{ id: "image", kind: "image", contentRef: asset.contentRef, bounds: { x: 0, y: 0, width: 100, height: 100 } }]
        }]
      }
    } satisfies StateSnapshot;
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.with-screenshot", initialState: { timestamp: 0, namespaces: {} } });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "observation", observationType: "client.state_snapshot", payload: { state } }
    });

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });

    await expect(service.readProjectObjectAsset(project.id, sha256)).rejects.toThrow("not found");
    await expect(service.readProjectObjectAsset(project.id, orphanSha256)).rejects.toThrow("not found");
    await expect(readFile(path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", recording.recordingId, "objects", `${sha256}.png`))).rejects.toThrow();
  });

  it("deletes unindexed files left under the recording session directory", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Recording directory cleanup" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.with-leftovers", initialState: { timestamp: 0, namespaces: {} } });
    const sessionDir = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", recording.recordingId);
    await mkdir(path.join(sessionDir, "objects"), { recursive: true });
    await mkdir(path.join(sessionDir, "derived", "custom"), { recursive: true });
    await writeFile(path.join(sessionDir, "objects", "unindexed.png"), "stale image", "utf8");
    await writeFile(path.join(sessionDir, "derived", "custom", "leftover.json"), JSON.stringify({ recordingId: recording.recordingId }), "utf8");
    const oldDeletedSessionDir = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", "recording.old-deleted");
    await mkdir(path.join(oldDeletedSessionDir, "objects"), { recursive: true });
    await writeFile(path.join(oldDeletedSessionDir, "objects", "leftover.png"), "old stale image", "utf8");

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });

    await expect(readdir(sessionDir)).rejects.toThrow();
    await expect(readdir(oldDeletedSessionDir)).rejects.toThrow();
  });

  it("deletes stale shared pipeline artifacts owned by the deleted recording", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Shared pipeline cleanup" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.shared-artifacts", initialState: { timestamp: 0, namespaces: {} } });
    const projectDir = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id);
    const sharedFact = path.join(projectDir, "pipeline", "shared", "evidence", "facts", "fact.stale.json");
    const pipelineIndex = path.join(projectDir, "indexes", "pipeline.json");
    await mkdir(path.dirname(sharedFact), { recursive: true });
    await mkdir(path.dirname(pipelineIndex), { recursive: true });
    await writeFile(sharedFact, JSON.stringify({ factId: "fact.stale", recordingId: recording.recordingId, value: true }), "utf8");
    await writeFile(pipelineIndex, JSON.stringify({
      pipelines: [],
      normalizationReviews: [],
      miningRuns: [],
      evidenceFacts: [{ factId: "fact.stale", generatedAt: 1, recordingId: recording.recordingId }],
      evidenceObservations: [],
      stateActionCorrelations: [],
      evidenceClaims: [],
      learnedTaskModels: [],
      policyProposals: [],
      recordingFlowProposals: [],
      replayResults: []
    }, null, 2), "utf8");

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });

    await expect(readFile(sharedFact, "utf8")).rejects.toThrow();
    const index = JSON.parse(await readFile(pipelineIndex, "utf8")) as { evidenceFacts: unknown[] };
    expect(index.evidenceFacts).toEqual([]);
  });

  it("deletes recording batches with one index and pipeline cleanup pass", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Batch cleanup" });
    const first = await service.createRecording({ projectId: project.id, recordingId: "recording.batch-a", initialState: { timestamp: 0, namespaces: {} } });
    const second = await service.createRecording({ projectId: project.id, recordingId: "recording.batch-b", initialState: { timestamp: 0, namespaces: {} } });
    const kept = await service.createRecording({ projectId: project.id, recordingId: "recording.batch-kept", initialState: { timestamp: 0, namespaces: {} } });
    const projectDir = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    const sharedFactsDir = path.join(projectDir, "pipeline", "shared", "evidence", "facts");
    await mkdir(sharedFactsDir, { recursive: true });
    await writeFile(path.join(sharedFactsDir, "fact.batch-a.json"), JSON.stringify({ factId: "fact.batch-a", recordingId: first.recordingId }), "utf8");
    await writeFile(path.join(sharedFactsDir, "fact.batch-b.json"), JSON.stringify({ factId: "fact.batch-b", recordingId: second.recordingId }), "utf8");
    await writeFile(path.join(sharedFactsDir, "fact.batch-kept.json"), JSON.stringify({ factId: "fact.batch-kept", recordingId: kept.recordingId }), "utf8");

    const deleted = await service.deleteRecordings({ projectId: project.id, recordingIds: [first.recordingId, second.recordingId] });
    expect(deleted).toEqual({
      deletedRecordingIds: [first.recordingId, second.recordingId],
      deletedProposalIds: []
    });

    await expect(readdir(path.join(projectDir, "recordings", first.recordingId))).rejects.toThrow();
    await expect(readdir(path.join(projectDir, "recordings", second.recordingId))).rejects.toThrow();
    await expect(readdir(path.join(projectDir, "recordings", kept.recordingId))).resolves.toBeTruthy();
    await expect(readFile(path.join(sharedFactsDir, "fact.batch-a.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(sharedFactsDir, "fact.batch-b.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(sharedFactsDir, "fact.batch-kept.json"), "utf8")).resolves.toContain("fact.batch-kept");
  });

  it("keeps deleted recording assets that are still referenced by another recording", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Shared asset cleanup" });
    const content = Buffer.from("shared-screenshot");
    const sha256 = createHash("sha256").update(content).digest("hex");
    const asset = await service.writeProjectObjectAsset({ projectId: project.id, content, mediaType: "image/png", expectedSha256: sha256 });
    const state = {
      timestamp: 1,
      namespaces: {},
      presentation: {
        visualFrames: [{
          id: "screen",
          coordinateSpace: { width: 100, height: 100, unit: "px" },
          layers: [{ id: "image", kind: "image", contentRef: asset.contentRef, bounds: { x: 0, y: 0, width: 100, height: 100 } }]
        }]
      }
    } satisfies StateSnapshot;
    const deleted = await service.createRecording({ projectId: project.id, recordingId: "recording.deleted", initialState: state });
    await service.createRecording({ projectId: project.id, recordingId: "recording.kept", initialState: state });

    await service.deleteRecording({ projectId: project.id, recordingId: deleted.recordingId });

    await expect(service.readProjectObjectAsset(project.id, sha256)).resolves.toMatchObject({ sha256, content });
  });

  it("approves edited recording Flow proposal graphs into Flows", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": (observation) => observation.type === "observation" ? { outputId: "click", parameters: { target: "submit" }, confidence: 0.9 } : null } });
    const service = createService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Edited Mapper Approval", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.edited-mapper", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } } });
    const { proposals: [proposal] } = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });

    const reviewed = await service.reviewRecordingFlowProposal({
      projectId: project.id,
      proposalId: proposal!.proposalId,
      decision: "approved",
      destination: { kind: "flow", name: "Edited mapped flow" },
      policyOverride: {
        schemaVersion: "0.1",
        version: "1.0.0",
        policyId: "policy.edited-recording-proposal",
        taskId: "task.edited-recording-proposal",
        sourceEvidence: [{ layer: "raw_recording", artifactId: recording.recordingId }],
        generatedMetadata: { generatedBy: "user", generatedAt: 2, confidence: 0.8 },
        nodes: [{
          id: "node.edited-click",
          label: "Edited click proposal",
          description: "Edited before approval.",
          eligibility: { type: "all", conditions: [] },
          actions: [{ id: "action.edited-click", actionType: "click", outputId: "click", parameters: { target: "submit" } }],
          successConditions: { type: "all", conditions: [] },
          failureConditions: { type: "none", conditions: [] },
          timeout: { timeoutMs: 5000 },
          retry: { maxAttempts: 1, backoffMs: 500 },
          recovery: { strategy: "pause" },
          outgoingEdges: [],
          sourceEvidence: [{ layer: "raw_recording", artifactId: recording.recordingId, entryId: "entry.1" }],
          generatedMetadata: { generatedBy: "user", generatedAt: 2, confidence: 0.8 }
        }],
        edges: []
      }
    });

    expect(reviewed.flow?.nodes[0]).toMatchObject({ label: "Edited click proposal", definitionId: "builtin.policy.action", parameterValues: { outputId: "click" } });

    const reapplied = await service.reviewRecordingFlowProposal({
      projectId: project.id,
      proposalId: proposal!.proposalId,
      decision: "approved",
      destination: { kind: "flow", flowId: reviewed.flow!.flowId },
      policyOverride: {
        schemaVersion: "0.1",
        version: "1.0.0",
        policyId: "policy.edited-recording-proposal",
        taskId: "task.edited-recording-proposal",
        sourceEvidence: [{ layer: "raw_recording", artifactId: recording.recordingId }],
        generatedMetadata: { generatedBy: "user", generatedAt: 3, confidence: 0.8 },
        nodes: [{
          id: "node.reapplied-click",
          label: "Reapplied click proposal",
          description: "Reapplied without regenerating.",
          eligibility: { type: "all", conditions: [] },
          actions: [{ id: "action.reapplied-click", actionType: "click", outputId: "click", parameters: { target: "submit" } }],
          successConditions: { type: "all", conditions: [] },
          failureConditions: { type: "none", conditions: [] },
          timeout: { timeoutMs: 5000 },
          retry: { maxAttempts: 1, backoffMs: 500 },
          recovery: { strategy: "pause" },
          outgoingEdges: [],
          sourceEvidence: [{ layer: "raw_recording", artifactId: recording.recordingId, entryId: "entry.1" }],
          generatedMetadata: { generatedBy: "user", generatedAt: 3, confidence: 0.8 }
        }],
        edges: []
      }
    });

    expect(reapplied.proposal.status).toBe("approved");
    expect(reapplied.flow?.flowId).toBe(reviewed.flow!.flowId);
    expect(reapplied.flow?.nodes[0]).toMatchObject({ label: "Reapplied click proposal", definitionId: "builtin.policy.action" });
  });

  it("explains mapper miss diagnostics when no recording Flow candidates are accepted", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "empty-mapper", version: "1.0.0", description: "Does not map this recording", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "empty-mapper": () => null } });
    const service = createService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Mapper Miss", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.mapper-miss", domainId: "example", startedAt: 100, initialState: { timestamp: 100, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" }, timestamp: 200, monotonicOffsetMs: 100 } });

    const result = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });

    expect(result.proposals).toEqual([]);
    expect(result.issues[0]).toContain("saw 1 entries (observation: 1), matched 0, emitted 0 raw candidates");
  });

  it("stores project recordings and normalized timelines in project folders", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "State Framework" });
    await expect(service.listProjectArtifacts(project.id)).resolves.toMatchObject({
      tasks: [],
      flows: []
    });
    const initialState: StateSnapshot = {
      timestamp: 1,
      namespaces: {
        runtime: {
          schemaId: "runtime",
          schemaVersion: "0.1",
          values: {
            phase: stateValue("string", "idle", 1)
          }
        }
      }
    };

    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.service-test",
      taskId: "task.service-test",
      initialState
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: {
        type: "marker",
        label: "Started"
      }
    });
    const normalized = await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const reloaded = createService({ dataDir: tempRoot, seedFixture: false });
    const recordings = await reloaded.listRecordingSessions(project.id);

    expect(recordings.map((item) => item.recordingId)).toContain("recording.service-test");
    expect(normalized.recordingId).toBe("recording.service-test");

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "recordings", "recording.service-test", "recording.json"), "utf8")).resolves.toContain("\"recordingId\": \"recording.service-test\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.service-test", "timeline.jsonl"), "utf8")).resolves.toContain("\"type\":\"marker\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.service-test", "derived", "index.json"), "utf8")).resolves.toContain("\"recordingId\": \"recording.service-test\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.service-test", "derived", "normalization", "timelines", `${normalized.normalizedTimelineId}.json`), "utf8")).resolves.toContain("\"normalizedTimelineId\"");
    await expect(readFile(path.join(projectRoot, "indexes", "recordings.json"), "utf8")).resolves.toContain("\"normalizedTimelineId\"");
  });

  it("persists rapid recording event bursts without colliding JSON temp files", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Event Burst" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.event-burst",
      taskId: "task.event-burst",
      initialState: {
        timestamp: 1,
        namespaces: {}
      }
    });

    await Promise.all(Array.from({ length: 32 }, (_, index) => service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: {
        id: `marker.${index}`,
        type: "marker",
        label: `Burst ${index}`,
        timestamp: 1 + index
      }
    })));

    const stored = await service.getRecordingSession(recording.recordingId, project.id);

    expect(stored.timeline).toHaveLength(32);
  });

  it("lists project recording summaries without returning screenshot-heavy timelines", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Recording summaries" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.summary-list",
      taskId: "task.summary-list",
      initialState: { timestamp: 1, namespaces: {} }
    });
    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: Array.from({ length: 8 }, (_, index) => ({
        id: `snapshot.${index}`,
        type: "observation",
        observationType: "client.state_snapshot",
        payload: {
          state: {
            timestamp: index + 2,
            namespaces: {},
            presentation: {
              visualFrames: [{
                id: "screen",
                coordinateSpace: { width: 100, height: 100, unit: "px" },
                layers: [{ id: "image", kind: "image", contentRef: `automation-object://project/${project.id}/${String(index).padStart(64, "0")}`, bounds: { x: 0, y: 0, width: 100, height: 100 } }]
              }]
            }
          }
        }
      }))
    });
    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    const recordingFile = path.join(projectRoot, "recordings", recording.recordingId, "recording.json");
    const activePersisted = JSON.parse(await readFile(recordingFile, "utf8")) as any;

    const summaries = await service.listRecordingSessionSummaries(project.id);
    const full = await service.getRecordingSession(recording.recordingId, project.id);

    expect(activePersisted.recording?.timeline ?? activePersisted.timeline ?? []).toHaveLength(0);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ recordingId: recording.recordingId, metadata: { summaryOnly: true, eventCount: 8 } });
    expect(summaries[0]?.timeline).toEqual([]);
    expect(full.timeline).toHaveLength(8);

    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 20 });
    const finalizedTimeline = await readFile(path.join(projectRoot, "recordings", recording.recordingId, "timeline.jsonl"), "utf8");
    expect(finalizedTimeline.trim().split(/\r?\n/)).toHaveLength(8);
  });

  it("stores client state snapshots as recording-scoped object refs and hydrates them when opened", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Snapshot refs" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.snapshot-refs",
      initialState: { timestamp: 1, namespaces: {} }
    });
    const state = {
      id: "snapshot.large",
      timestamp: 2,
      namespaces: {
        web: {
          schemaId: "web",
          schemaVersion: "0.1",
          values: { title: { type: "string", value: "Dashboard", observedAt: 2 } }
        }
      }
    } satisfies StateSnapshot;

    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: {
        type: "observation",
        observationType: "client.state_snapshot",
        correlationId: "snapshot.large",
        payload: { state, metadata: { viewportWidth: 1280 } }
      }
    });

    const raw = await service.listRecordingSessions(project.id);
    const rawEntry = raw.find((item) => item.recordingId === recording.recordingId)?.timeline[0];
    const rawPayload = rawEntry?.type === "observation" ? rawEntry.payload as any : null;
    const hydrated = await service.getRecordingSession(recording.recordingId, project.id);
    const hydratedPayload = hydrated.timeline[0]?.type === "observation" ? hydrated.timeline[0].payload as any : null;

    expect(rawPayload?.state).toBeUndefined();
    expect(rawPayload?.stateRef).toMatch(/^automation-object:\/\/project\//);
    expect(rawPayload?.metadata).toMatchObject({ viewportWidth: 1280, stateSnapshotSize: expect.any(Number) });
    expect(hydratedPayload?.state).toMatchObject({ id: "snapshot.large", namespaces: { web: { values: { title: { value: "Dashboard" } } } } });
  });

  it("writes recording state indexes with distinct action state links", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Indexed states" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.indexed-states",
      initialState: { timestamp: 1, namespaces: {} }
    });

    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: [
        { type: "observation", observationType: "client.state_snapshot", payload: { state: stateFixture("state.one", 10, "Before") as unknown as JsonObject } },
        { type: "action", actionType: "click", outputId: "click.first", parameters: {}, timestamp: 11, startedAt: 11, origin: "operator" },
        { type: "observation", observationType: "client.state_snapshot", payload: { state: stateFixture("state.two", 20, "After") as unknown as JsonObject } },
        { type: "action", actionType: "click", outputId: "click.second", parameters: {}, timestamp: 21, startedAt: 21, origin: "operator" }
      ]
    });

    const indexPath = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", recording.recordingId, "index.json");
    const index = JSON.parse(await readFile(indexPath, "utf8")) as any;
    expect(Object.keys(index.states)).toEqual(["state.one", "state.two"]);
    expect(Object.values(index.actions).map((action: any) => action.stateAtActionId)).toEqual(["state.one", "state.two"]);
    expect(index.states["state.one"].stateRef).not.toEqual(index.states["state.two"].stateRef);
  });

  it("uses referenced action entries for mapper candidate state links", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps observed clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, {
      packageId: "example.importer",
      packageVersion: "1.0.0",
      implementations: {},
      recordingMappers: {
        "click-mapper": (observation) => observation.observationId === "entry.mapper"
          ? { outputId: "click", parameters: { target: "submit" }, sourceObservationIds: ["entry.action"], confidence: 0.9 }
          : null
      }
    });
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Mapper action state", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.mapper-action-state", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: [
        { id: "entry.state.before", type: "observation", observationType: "client.state_snapshot", timestamp: 1, payload: { state: stateFixture("state.before", 1, "Before") as unknown as JsonObject } },
        { id: "entry.action", type: "action", actionType: "click", outputId: "click", parameters: {}, timestamp: 50, startedAt: 50, origin: "operator", metadata: { policyEligible: false } },
        { id: "entry.state.after", type: "observation", observationType: "client.state_snapshot", timestamp: 51, payload: { state: stateFixture("state.after", 51, "After") as unknown as JsonObject } },
        { id: "entry.mapper", type: "observation", observationType: "input.event", timestamp: 52, payload: { latestEvidence: true } }
      ]
    });

    const result = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    const candidate = result.proposals[0]?.candidates[0];

    expect(candidate).toMatchObject({
      actionEntryId: "entry.action",
      sourceObservationIds: ["entry.mapper", "entry.action"],
      stateLink: { actionEntryId: "entry.action", stateSnapshotId: "state.after" }
    });
  });

  it("resolves recording entry state from the recording index without guessing another state", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Indexed state lookup" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.indexed-state-lookup",
      initialState: { timestamp: 1, namespaces: {} }
    });

    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: [
        { type: "observation", observationType: "client.state_snapshot", payload: { state: stateFixture("state.lookup", 10, "Lookup") as unknown as JsonObject } },
        { type: "action", actionType: "click", outputId: "click.lookup", parameters: {}, timestamp: 11, startedAt: 11, origin: "operator" }
      ]
    });

    const raw = await service.listRecordingSessions(project.id);
    const actionEntry = raw.find((item) => item.recordingId === recording.recordingId)?.timeline.find((entry) => entry.type === "action");
    expect(actionEntry).toBeDefined();
    const resolved = await service.getRecordingEntryState({
      projectId: project.id,
      recordingId: recording.recordingId,
      entryId: actionEntry!.id,
      includeState: true
    });

    expect(resolved.resolved).toMatchObject({ stateSnapshotId: "state.lookup", stateRef: expect.stringMatching(/^automation-object:\/\//) });
    expect(resolved.state).toMatchObject({ id: "state.lookup", namespaces: { web: { values: { title: { value: "Lookup" } } } } });
    await expect(service.getRecordingEntryState({
      projectId: project.id,
      recordingId: recording.recordingId,
      entryId: "entry.missing"
    })).resolves.toMatchObject({ resolved: null, reason: "Entry entry.missing is not indexed for recording recording.indexed-state-lookup." });
  });

  it("resolves unlinked timeline events to the latest prior state snapshot", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Timeline event state lookup" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.timeline-event-state",
      initialState: { timestamp: 1, namespaces: {} }
    });

    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: [
        { id: "entry.state.before", type: "observation", observationType: "client.state_snapshot", timestamp: 10, payload: { state: stateFixture("state.before", 10, "Before") as unknown as JsonObject } },
        { id: "entry.event.middle", type: "observation", observationType: "input.event", timestamp: 15, payload: { event: "middle" } },
        { id: "entry.state.after", type: "observation", observationType: "client.state_snapshot", timestamp: 20, payload: { state: stateFixture("state.after", 20, "After") as unknown as JsonObject } },
        { id: "entry.event.later", type: "observation", observationType: "input.event", timestamp: 25, payload: { event: "later" } }
      ]
    });

    await expect(service.getRecordingEntryState({
      projectId: project.id,
      recordingId: recording.recordingId,
      entryId: "entry.event.middle",
      includeState: true
    })).resolves.toMatchObject({
      resolved: { stateSnapshotId: "state.before" },
      state: { id: "state.before" }
    });
    await expect(service.getRecordingEntryState({
      projectId: project.id,
      recordingId: recording.recordingId,
      entryId: "entry.event.later",
      includeState: true
    })).resolves.toMatchObject({
      resolved: { stateSnapshotId: "state.after" },
      state: { id: "state.after" }
    });
  });

  it("repairs stale prior-state links before indexed state lookup", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Repair stale state links" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.stale-state-link",
      initialState: { timestamp: 1, namespaces: {} }
    });

    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: [
        { type: "observation", observationType: "client.state_snapshot", timestamp: 1, payload: { state: stateFixture("state.old", 1, "Old") as unknown as JsonObject } },
        { type: "action", actionType: "click", outputId: "click.target", parameters: {}, timestamp: 50, startedAt: 50, origin: "operator" },
        { type: "observation", observationType: "client.state_snapshot", timestamp: 51, payload: { state: stateFixture("state.closest", 51, "Closest") as unknown as JsonObject } }
      ]
    });

    const raw = await service.listRecordingSessions(project.id);
    const actionEntry = raw.find((item) => item.recordingId === recording.recordingId)?.timeline.find((entry) => entry.type === "action");
    expect(actionEntry).toBeDefined();
    const indexPath = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", recording.recordingId, "index.json");
    const poisoned = JSON.parse(await readFile(indexPath, "utf8")) as any;
    const action = Object.values(poisoned.actions)[0] as any;
    action.stateAtActionId = "state.old";
    poisoned.entries[action.entryId].stateSnapshotId = "state.old";
    await writeFile(indexPath, JSON.stringify(poisoned, null, 2), "utf8");

    const resolved = await service.getRecordingEntryState({
      projectId: project.id,
      recordingId: recording.recordingId,
      entryId: actionEntry!.id,
      includeState: true
    });

    expect(resolved.resolved?.stateSnapshotId).toBe("state.closest");
    expect(resolved.state).toMatchObject({ id: "state.closest" });
  });

  it("does not hydrate missing state refs while appending to recordings", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Missing state refs" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.missing-state-ref",
      initialState: { timestamp: 1, namespaces: {} }
    });
    const state = {
      id: "snapshot.missing",
      timestamp: 2,
      namespaces: { web: { schemaId: "web", schemaVersion: "0.1", values: { ready: { type: "boolean", value: true, observedAt: 2 } } } }
    } satisfies StateSnapshot;

    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "observation", observationType: "client.state_snapshot", payload: { state } }
    });
    const raw = await service.listRecordingSessions(project.id);
    const rawEntry = raw.find((item) => item.recordingId === recording.recordingId)?.timeline[0];
    const stateRef = rawEntry?.type === "observation" && typeof rawEntry.payload?.stateRef === "string" ? rawEntry.payload.stateRef : "";
    const sha256 = /\/([a-f0-9]{64})$/i.exec(stateRef)?.[1] ?? "";
    await rm(path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", recording.recordingId, "objects", `${sha256}.json`), { force: true });

    await expect(service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } }
    })).resolves.toMatchObject({ timeline: expect.arrayContaining([expect.objectContaining({ observationType: "clicked" })]) });

    const hydrated = await service.getRecordingSession(recording.recordingId, project.id);
    const payload = hydrated.timeline[0]?.type === "observation" ? hydrated.timeline[0].payload as any : null;
    expect(payload?.state).toBeUndefined();
    expect(payload?.metadata).toMatchObject({ missingStateRef: stateRef, stateRefHydrationError: expect.any(String) });
  });

  it("stores project artifacts and runtime sessions in project folders", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Runtime Project" });
    const flow = await service.createDefaultFlow({ projectId: project.id, ownerKind: "routine", ownerId: "routine.runtime", name: "Runtime Flow" });
    const runnableFlow = {
      ...flow,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "constant", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [
        { id: "start.constant", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "constant", targetPortId: "in" },
        { id: "constant.end", sourceNodeId: "constant", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    };
    await service.saveProjectArtifact({ projectId: project.id, kind: "flow", artifact: runnableFlow });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const reloaded = createService({ dataDir: tempRoot, seedFixture: false });
    const artifacts = await reloaded.listProjectArtifacts(project.id);
    const runs = await reloaded.listRuntimeSessions(project.id);

    expect(artifacts.flows).toHaveLength(1);
    expect(run.status).toBe("succeeded");
    expect(runs[0]).toMatchObject({ runId: run.runId, status: "succeeded" });

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "flows", flow.flowId, "flow.json"), "utf8")).resolves.toContain("\"flowId\"");
    await expect(readFile(path.join(projectRoot, "runtime", "indexes", "sessions.json"), "utf8")).resolves.toContain(run.runId);
  });

  it("pages runtime run summaries from the runtime SQL index without loading traces", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Runtime Pages" });
    const flow = await service.createDefaultFlow({ projectId: project.id, ownerKind: "routine", ownerId: "routine.runtime-pages", name: "Runtime Pages Flow" });
    const runnableFlow = {
      ...flow,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "constant", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [
        { id: "start.constant", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "constant", targetPortId: "in" },
        { id: "constant.end", sourceNodeId: "constant", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    };
    await service.saveProjectArtifact({ projectId: project.id, kind: "flow", artifact: runnableFlow });
    const first = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const third = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });

    const page = await service.listRuntimeSessionSummaries(project.id, { limit: 2, offset: 1 });

    expect(page).toMatchObject({ total: 3, limit: 2, offset: 1 });
    expect(page.runs).toHaveLength(2);
    expect(page.runs.map((run) => run.runId)).toEqual([second.runId, first.runId]);
    expect(page.runs[0]).toMatchObject({ status: "succeeded", attemptCount: 3, effectCount: 0 });
    expect(page.runs[0]).not.toHaveProperty("trace");
    expect(third.status).toBe("succeeded");
  });

  it("idempotently returns the same runtime run for duplicate idempotency keys", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Runtime Idempotency" });
    const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.runtime-idempotency" });

    const first = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, idempotencyKey: "submit:123" });
    const second = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, idempotencyKey: "submit:123" });

    expect(first).toMatchObject({ status: "succeeded" });
    expect(second.runId).toBe(first.runId);
    expect((await service.listRuntimeSessionSummaries(project.id)).total).toBe(1);
  });

  it("cancels queued runtime runs and recovers missing run detail from the session record", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Runtime Cancellation" });
    const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.runtime-cancel" });
    const queued = await service.startRuntimeSession({ projectId: project.id, flowId: flow.flowId });

    const cancelled = await service.cancelRuntimeSession(project.id, queued.runId, "Operator stopped the run.");
    const rerun = await service.runRuntimeSession({ projectId: project.id, runId: queued.runId, flowId: flow.flowId });
    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await rm(path.join(projectRoot, "runtime", "runs", queued.runId, "run.json"), { force: true });
    const recovered = await service.getFlowRunDetail(project.id, queued.runId);

    expect(cancelled).toMatchObject({ status: "cancelled", metadata: { cancellation: { reason: "Operator stopped the run." } } });
    expect(rerun.status).toBe("cancelled");
    expect(recovered).toMatchObject({ summary: { runId: queued.runId, status: "cancelled" }, metadata: { partialWriteRecovery: { source: "runtime-session" } } });
  });

  it("blocks a second active adaptive runtime run in the same project", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Adaptive Runtime Concurrency" });
    const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.runtime-concurrency", metadata: adaptiveTrainingMetadata() });
    await service.startRuntimeSession({ projectId: project.id, flowId: flow.flowId, metadata: { adaptiveRuntime: true } });

    await expect(service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, adaptiveMode: "default" })).rejects.toThrow("Only one adaptive runtime run can be active per project.");
  });

  it("persists compact action comparisons and recovery ladder records in Flow run detail", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Runtime Recovery Detail" });
    const flow = await service.createDefaultFlow({ projectId: project.id, ownerKind: "routine", ownerId: "routine.runtime-recovery", name: "Runtime Recovery Flow" });
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "flow",
      artifact: {
        ...flow,
        nodes: [
          { id: "divide", definitionId: "builtin.math.divide", parameterValues: {} },
          { id: "recover", definitionId: "builtin.policy.recovery", parameterValues: { strategy: "retry" } },
          { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } }
        ],
        edges: [
          { id: "divide.recover", sourceNodeId: "divide", sourcePortId: "failed", targetNodeId: "recover", targetPortId: "failure" },
          { id: "recover.end", sourceNodeId: "recover", sourcePortId: "recovered", targetNodeId: "end", targetPortId: "in" }
        ]
      }
    });

    const session = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 } });
    const detail = await service.getFlowRunDetail(project.id, session.runId);

    expect(detail?.actionAttempts?.[0]).toMatchObject({
      attemptId: "divide.attempt.1",
      nodeId: "divide",
      comparisonStatus: "action_failed",
      metadata: {
        adaptiveFailure: {
          failureClass: "action_failed",
          candidateKind: "recovery_path_or_reroute",
          deterministicRecoveryCandidateCount: 2,
          llmEligibility: { eligible: false, knownRecoveryAvailable: true }
        }
      }
    });
    expect(detail?.recoveryAttempts?.[0]).toMatchObject({
      attemptId: "divide.attempt.1",
      selectedKind: "deterministic_path",
      selectedTargetNodeId: "recover",
      selectedEdgeId: "divide.recover",
      status: "selected"
    });
    expect(detail?.summary.metadata).toMatchObject({ recoveryAttemptCount: 1 });
    expect(detail).not.toHaveProperty("trace");
  });

  it("persists host state refs in run detail without hydrating summaries", async () => {
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      hostRuntime: {
        capabilities: ["state-snapshot", "state-diff"],
        captureStateSnapshot: ({ attemptId, point }) => ({ stateSnapshotId: `${attemptId}.${point}`, stateRef: `state://${attemptId}/${point}`, capturedAt: point === "before_action" ? 10 : 20 }),
        inspectStateDiff: () => ({ changed: true })
      }
    });
    const project = await service.createProject({ name: "Host State Refs" });
    const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.host-state-refs" });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    const page = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, limit: 1, offset: 0 });

    expect(detail?.actionAttempts?.[0]?.metadata).toMatchObject({
      hostCapabilities: ["state-diff", "state-snapshot"],
      stateRefs: {
        beforeAction: { stateRef: "state://start.attempt.1/before_action" },
        afterAction: { stateRef: "state://start.attempt.1/after_action" },
        stateDiff: { changed: true }
      }
    });
    expect(page.runs[0]).not.toHaveProperty("actionAttempts");
    expect(JSON.stringify(page.runs[0])).not.toContain("state://");
  });

  it("mutates Flow Map route groups and routes through validated router writes", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Flow Map Mutations" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.flow-map-mutations", name: "Flow Map Mutations" });
    const primary = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Main Task", role: "primary" });
    const fallback = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Fallback Task", role: "fallback" });

    const grouped = await service.upsertFlowMapRouteGroup({ projectId: project.id, flowId: flow.flowId, name: "Checkout", order: 10 });
    const group = (grouped.metadata?.routeGroups as any[])[0];
    expect(group).toMatchObject({ name: "Checkout", order: 10, status: "active" });

    const routed = await service.upsertFlowMapRoute({
      projectId: project.id,
      flowId: flow.flowId,
      name: "Primary Checkout",
      targetSubflowId: primary.subflowId,
      groupId: group.groupId,
      order: 5,
      conditionSummary: "User intent is checkout",
      conditionSignalPath: "inputs.intent",
      conditionOperator: "equals",
      conditionExpected: "checkout"
    });
    expect(routed.rules).toHaveLength(1);
    expect(routed.rules[0]).toMatchObject({
      name: "Primary Checkout",
      order: 5,
      target: { kind: "subflow", subflowId: primary.subflowId },
      condition: { signalPath: "inputs.intent", operator: "equals", expected: "checkout" },
      metadata: { groupId: group.groupId, conditionSummary: "User intent is checkout" }
    });

    const always = await service.upsertFlowMapRoute({
      projectId: project.id,
      flowId: flow.flowId,
      ruleId: routed.rules[0]!.ruleId,
      name: "Primary Checkout",
      targetSubflowId: primary.subflowId,
      clearCondition: true
    });
    expect(always.rules[0]?.condition).toBeUndefined();
    expect(always.rules[0]?.metadata?.conditionSummary).toBeUndefined();
    const withFallback = await service.upsertFlowMapRoute({ projectId: project.id, flowId: flow.flowId, name: "Fallback Route", targetSubflowId: fallback.subflowId, setAsFallback: true });
    expect(withFallback.fallback).toEqual({ kind: "subflow", subflowId: fallback.subflowId });

    const duplicated = await service.mutateFlowMapRoute({ projectId: project.id, flowId: flow.flowId, ruleId: routed.rules[0]!.ruleId, action: "duplicate" });
    const copy = duplicated.rules.find((rule) => rule.name === "Primary Checkout copy");
    expect(copy).toBeDefined();
    expect(duplicated.rules.map((rule) => rule.order)).toEqual([0, 10, 20]);

    const moved = await service.mutateFlowMapRoute({ projectId: project.id, flowId: flow.flowId, ruleId: copy!.ruleId, action: "move_up" });
    expect(moved.rules[0]?.ruleId).toBe(copy!.ruleId);

    const toggled = await service.mutateFlowMapRoute({ projectId: project.id, flowId: flow.flowId, ruleId: routed.rules[0]!.ruleId, action: "toggle" });
    expect(toggled.rules.find((rule) => rule.ruleId === routed.rules[0]!.ruleId)?.status).toBe("disabled");

    const removedCopy = await service.mutateFlowMapRoute({ projectId: project.id, flowId: flow.flowId, ruleId: copy!.ruleId, action: "delete" });
    expect(removedCopy.rules.some((rule) => rule.ruleId === copy!.ruleId)).toBe(false);
    const stoppedFallback = await service.setFlowMapFallback({ projectId: project.id, flowId: flow.flowId, kind: "fail", message: "No supported request matched." });
    expect(stoppedFallback.fallback).toEqual({ kind: "fail", message: "No supported request matched." });
    expect(stoppedFallback.rules).toHaveLength(2);

    const directFallback = await service.setFlowMapFallback({ projectId: project.id, flowId: flow.flowId, kind: "subflow", targetSubflowId: primary.subflowId });
    expect(directFallback.fallback).toEqual({ kind: "subflow", subflowId: primary.subflowId });
    expect(directFallback.rules).toHaveLength(2);

    const ungrouped = await service.deleteFlowMapRouteGroup({ projectId: project.id, flowId: flow.flowId, groupId: group.groupId });
    expect(ungrouped.metadata?.routeGroups).toEqual([]);
    expect(ungrouped.rules.find((rule) => rule.name === "Primary Checkout")?.metadata?.groupId).toBeUndefined();

    const withoutRoute = await service.deleteFlowMapRoute({ projectId: project.id, flowId: flow.flowId, ruleId: routed.rules[0]!.ruleId });
    expect(withoutRoute.rules.map((rule) => rule.name)).toEqual(["Fallback Route"]);
  });
  it("persists Flow expansion summaries with paged run and adaptation detail reads", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Expansion Pages" });
    const flow = await service.createDefaultFlow({ projectId: project.id, ownerKind: "routine", ownerId: "routine.expansion-pages", name: "Expansion Pages Flow" });
    const fixture = createAutomationStudioFlowExpansionFixture(10_000);
    const subflows = fixture.subflows.map((subflow) => ({ ...subflow, projectId: project.id, flowId: flow.flowId }));
    await service.saveFlowRouter({ ...fixture.router, projectId: project.id, flowId: flow.flowId, rules: fixture.router.rules.map((rule) => ({ ...rule, target: { kind: "subflow", subflowId: subflows[0]!.subflowId } })) });
    for (const subflow of subflows) await service.saveFlowSubflow(subflow);
    await service.saveFlowInstruction(project.id, { ...fixture.instructions[0]!, scope: { kind: "flow", projectId: project.id, flowId: flow.flowId } });
    await service.saveFlowChangeProposal({ ...fixture.changeProposal, projectId: project.id, flowId: flow.flowId, subflowId: subflows[1]!.subflowId });
    const { proposalId: _missingProposalId, ...adaptationWithoutProposal } = fixture.adaptation;
    await expect(service.saveFlowAdaptation({ ...adaptationWithoutProposal, projectId: project.id, flowId: flow.flowId, subflowId: subflows[1]!.subflowId })).resolves.toMatchObject({
      adaptationId: fixture.adaptation.adaptationId,
      status: "validated"
    });

    for (let index = 0; index < 35; index += 1) {
      const runId = `run.expansion.${index}`;
      await service.saveFlowRunDetail({
        ...fixture.runDetail,
        summary: {
          ...fixture.runSummary,
          projectId: project.id,
          flowId: flow.flowId,
          runId,
          updatedAt: 20_000 + index,
          routeDecisionCount: 1,
          subflowEntryCount: 1,
          actionAttemptCount: index
        },
        routeDecisions: [{ ...fixture.runDetail.routeDecisions[0]!, decisionId: `decision.${index}`, selectedSubflowId: subflows[0]!.subflowId }],
        subflows: [{ ...fixture.runDetail.subflows[0]!, entryId: `entry.${index}`, subflowId: subflows[0]!.subflowId }],
        interventions: [],
        actionAttempts: Array.from({ length: index }, (_, actionIndex) => ({ ...(fixture.runDetail.actionAttempts ?? [])[0]!, attemptId: `attempt.${index}.${actionIndex}`, order: actionIndex }))
      });
    }

    for (let index = 0; index < 12; index += 1) {
      await service.saveFlowAdaptation({
        ...fixture.adaptation,
        projectId: project.id,
        flowId: flow.flowId,
        subflowId: subflows[1]!.subflowId,
        adaptationId: `adaptation.expansion.${index}`,
        updatedAt: 30_000 + index,
        trigger: `Observed drift ${index}`
      });
    }

    const runPage = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, limit: 5, offset: 10 });
    expect(runPage).toMatchObject({ total: 35, limit: 5, offset: 10 });
    expect(runPage.runs.map((run) => run.runId)).toEqual(["run.expansion.24", "run.expansion.23", "run.expansion.22", "run.expansion.21", "run.expansion.20"]);
    expect(runPage.runs[0]).not.toHaveProperty("routeDecisions");
    const searchedRunId = runPage.runs[0]!.runId;
    const searchedRuns = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, search: searchedRunId.toUpperCase(), limit: 25, offset: 0 });
    expect(searchedRuns).toMatchObject({ total: 1, limit: 25, offset: 0 });
    expect(searchedRuns.runs.map((run) => run.runId)).toEqual([searchedRunId]);
    const selectedStatus = runPage.runs[0]!.status;
    const statusRuns = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, status: selectedStatus, sort: "status", direction: "asc", limit: 100, offset: 0 });
    expect(statusRuns.total).toBeGreaterThan(0);
    expect(statusRuns.runs.every((run) => run.status === selectedStatus)).toBe(true);
    const actionSortedRuns = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, sort: "actions", direction: "desc", limit: 100, offset: 0 });
    expect(actionSortedRuns.runs.every((run, index, runs) => index === 0 || runs[index - 1]!.actionAttemptCount >= run.actionAttemptCount)).toBe(true);
    const actionPage = await service.listFlowRunActions({ projectId: project.id, runId: "run.expansion.24", limit: 5, offset: 10 });
    expect(actionPage).toMatchObject({ total: 24, limit: 5, offset: 10 });
    expect(actionPage.actions.map((action) => action.attemptId)).toEqual(["attempt.24.10", "attempt.24.11", "attempt.24.12", "attempt.24.13", "attempt.24.14"]);
    expect(actionPage.actions.every((action) => action.order >= 10 && action.order <= 14)).toBe(true);
    const selectedRun = await service.getFlowRunDetail(project.id, "run.expansion.24");
    expect(selectedRun?.routeDecisions).toEqual([expect.objectContaining({ decisionId: "decision.24" })]);

    const adaptationPage = await service.listFlowAdaptationSummaries({ projectId: project.id, flowId: flow.flowId, subflowId: subflows[1]!.subflowId, limit: 4, offset: 3 });
    expect(adaptationPage).toMatchObject({ total: 13, limit: 4, offset: 3 });
    expect(adaptationPage.adaptations.map((adaptation) => adaptation.adaptationId)).toEqual(["adaptation.expansion.8", "adaptation.expansion.7", "adaptation.expansion.6", "adaptation.expansion.5"]);
    expect(await service.getFlowAdaptation(project.id, flow.flowId, "adaptation.expansion.8")).toMatchObject({ trigger: "Observed drift 8" });

    await expect(service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId })).resolves.toMatchObject({ total: 2 });
    await expect(service.getFlowInstructionSet({ projectId: project.id, flowId: flow.flowId })).resolves.toHaveLength(1);
    await expect(service.getFlowChangeProposal(project.id, flow.flowId, fixture.changeProposal.proposalId)).resolves.toMatchObject({ proposalId: fixture.changeProposal.proposalId });
  });

  it("streams a bounded deep page from a persisted 10,000-action run", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Ten Thousand Actions" });
    const flow = await service.createDefaultFlow({ projectId: project.id, ownerKind: "routine", ownerId: "routine.ten-thousand-actions", name: "Ten Thousand Actions Flow" });
    const fixture = createAutomationStudioFlowExpansionFixture(75_000);
    const actions = Array.from({ length: 10_000 }, (_, index) => ({
      ...(fixture.runDetail.actionAttempts ?? [])[0]!,
      attemptId: `attempt.large.${String(index).padStart(5, "0")}`,
      order: index,
      nodeId: `node.${index % 25}`,
      inputs: { index },
      outputs: { next: index + 1 }
    }));
    await service.saveFlowRunDetail({
      ...fixture.runDetail,
      summary: { ...fixture.runSummary, projectId: project.id, flowId: flow.flowId, runId: "run.large.10000", actionAttemptCount: actions.length, updatedAt: 75_000 },
      routeDecisions: [],
      subflows: [],
      recoveryAttempts: [],
      interventions: [],
      adaptationIds: [],
      changeProposalIds: [],
      actionAttempts: actions
    });

    const startedAt = performance.now();
    const page = await service.listFlowRunActions({ projectId: project.id, runId: "run.large.10000", limit: 50, offset: 9_950 });
    const elapsedMs = performance.now() - startedAt;

    expect(page).toMatchObject({ total: 10_000, limit: 50, offset: 9_950 });
    expect(page.actions).toHaveLength(50);
    expect(page.actions[0]).toMatchObject({ attemptId: "attempt.large.09950", order: 9_950 });
    expect(page.actions[49]).toMatchObject({ attemptId: "attempt.large.09999", order: 9_999 });
    expect(JSON.stringify(page).length).toBeLessThan(100_000);
    expect(elapsedMs).toBeLessThan(1_500);
  });
  it("keeps large project summary pages free of hydrated detail payloads", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Large Summary Guard" });
    const fixture = createAutomationStudioLargeProjectFixture({
      projectId: project.id,
      flowCount: 2,
      subflowsPerFlow: 6,
      runsPerFlow: 18,
      adaptationsPerFlow: 8,
      instructionsPerFlow: 10,
      recordingCount: 4,
      nowMs: 60_000
    });
    const [flow] = fixture.flows;
    if (!flow) throw new Error("Large fixture did not create a flow.");

    for (const artifact of fixture.flows) await service.saveProjectArtifact({ projectId: project.id, kind: "flow", artifact });
    for (const router of fixture.routers) await service.saveFlowRouter(router);
    for (const subflow of fixture.subflows) await service.saveFlowSubflow(subflow);
    for (const instruction of fixture.instructions) await service.saveFlowInstruction(project.id, instruction);
    for (const proposal of fixture.changeProposals) await service.saveFlowChangeProposal(proposal);
    for (const adaptation of fixture.adaptations) await service.saveFlowAdaptation(adaptation);
    for (const detail of fixture.runDetails) await service.saveFlowRunDetail(detail);


    const subflowPage = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 5, offset: 2 });
    const instructionPage = await service.listFlowInstructionSummaries({ projectId: project.id, flowId: flow.flowId, limit: 5, offset: 4 });
    const proposalPage = await service.listFlowChangeProposalSummaries({ projectId: project.id, flowId: flow.flowId, limit: 5, offset: 1 });
    const runPage = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, limit: 5, offset: 10 });
    const adaptationPage = await service.listFlowAdaptationSummaries({ projectId: project.id, flowId: flow.flowId, limit: 5, offset: 3 });

    expect(subflowPage).toMatchObject({ total: 6, limit: 5, offset: 2 });
    const filteredSubflows = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, role: subflowPage.subflows[0]!.role, search: subflowPage.subflows[0]!.name, sort: "name", direction: "asc", limit: 25, offset: 0 });
    expect(filteredSubflows.total).toBeGreaterThan(0);
    expect(filteredSubflows.subflows.every((subflow) => subflow.flowId === flow.flowId && subflow.role === subflowPage.subflows[0]!.role)).toBe(true);

    expect(instructionPage).toMatchObject({ total: 10, limit: 5, offset: 4 });
    const selectedInstructionSummary = instructionPage.instructions[0]!;
    const filteredInstructions = await service.listFlowInstructionSummaries({ projectId: project.id, flowId: flow.flowId, status: selectedInstructionSummary.status, scopeKind: selectedInstructionSummary.scopeKind, requirement: selectedInstructionSummary.requirement, search: selectedInstructionSummary.title, sort: "priority", direction: "asc", limit: 25, offset: 0 });
    expect(filteredInstructions.instructions).toContainEqual(expect.objectContaining({ instructionId: selectedInstructionSummary.instructionId, summaryVersion: 2 }));
    expect(proposalPage).toMatchObject({ limit: 5, offset: 1 });
    expect(runPage).toMatchObject({ total: 18, limit: 5, offset: 10 });
    expect(adaptationPage).toMatchObject({ total: 8, limit: 5, offset: 3 });
    const selectedAdaptationSummary = adaptationPage.adaptations[0]!;
    const filteredAdaptations = await service.listFlowAdaptationSummaries({
      projectId: project.id,
      flowId: flow.flowId,
      risk: selectedAdaptationSummary.riskLevel,
      search: selectedAdaptationSummary.trigger.toUpperCase(),
      sort: "trigger",
      direction: "asc",
      limit: 25,
      offset: 0
    });
    expect(filteredAdaptations.adaptations).toContainEqual(expect.objectContaining({ adaptationId: selectedAdaptationSummary.adaptationId, riskLevel: selectedAdaptationSummary.riskLevel }));
    expect(filteredAdaptations.adaptations.every((adaptation) => adaptation.riskLevel === selectedAdaptationSummary.riskLevel)).toBe(true);
    const riskSortedAdaptations = await service.listFlowAdaptationSummaries({ projectId: project.id, flowId: flow.flowId, sort: "risk", direction: "desc", limit: 100, offset: 0 });
    const riskRank = (value: string) => value === "destructive" ? 4 : value === "high" ? 3 : value === "medium" ? 2 : 1;
    expect(riskSortedAdaptations.adaptations.every((adaptation, index, adaptations) => index === 0 || riskRank(adaptations[index - 1]!.riskLevel) >= riskRank(adaptation.riskLevel))).toBe(true);

    expect(subflowPage.subflows[0]).not.toHaveProperty("inputMapping");
    expect(instructionPage.instructions[0]).not.toHaveProperty("body");
    expect(proposalPage.changeProposals[0]).not.toHaveProperty("patches");
    expect(runPage.runs[0]).not.toHaveProperty("routeDecisions");
    const searchedRunId = runPage.runs[0]!.runId;
    const searchedRuns = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, search: searchedRunId.toUpperCase(), limit: 25, offset: 0 });
    expect(searchedRuns).toMatchObject({ total: 1, limit: 25, offset: 0 });
    expect(searchedRuns.runs.map((run) => run.runId)).toEqual([searchedRunId]);
    const selectedStatus = runPage.runs[0]!.status;
    const statusRuns = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, status: selectedStatus, sort: "status", direction: "asc", limit: 100, offset: 0 });
    expect(statusRuns.total).toBeGreaterThan(0);
    expect(statusRuns.runs.every((run) => run.status === selectedStatus)).toBe(true);
    const actionSortedRuns = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, sort: "actions", direction: "desc", limit: 100, offset: 0 });
    expect(actionSortedRuns.runs.every((run, index, runs) => index === 0 || runs[index - 1]!.actionAttemptCount >= run.actionAttemptCount)).toBe(true);
    expect(runPage.runs[0]).not.toHaveProperty("interventions");
    const interventionRun = runPage.runs.find((run) => (run.interventionSummaries ?? []).length > 0);
    expect(interventionRun?.tokenUsage).toEqual({ inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.002 });
    expect(interventionRun?.interventionSummaries?.[0]).toMatchObject({
      kind: "diagnosis",
      reason: "Large fixture diagnostic sample.",
      promptVersion: "diagnosis_only_report.v1",
      provider: "fixture",
      model: "fixture",
      tokenUsage: { totalTokens: 30, estimatedCostUsd: 0.002 }
    });
    expect(adaptationPage.adaptations[0]).not.toHaveProperty("patch");
    expect(adaptationPage.adaptations[0]).not.toHaveProperty("validationResults");

    await expect(service.getFlowInstruction(project.id, instructionPage.instructions[0]!.instructionId)).resolves.toHaveProperty("body");
    await expect(service.getFlowRunDetail(project.id, runPage.runs[0]!.runId)).resolves.toHaveProperty("routeDecisions");
    await expect(service.getFlowAdaptation(project.id, flow.flowId, adaptationPage.adaptations[0]!.adaptationId)).resolves.toHaveProperty("patch");

    await rm(path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "flows", flow.flowId, "instructions"), { recursive: true, force: true });
    const metadataOnlyInstructions = await service.listFlowInstructionSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 });
    expect(metadataOnlyInstructions.instructions).toContainEqual(expect.objectContaining({ instructionId: selectedInstructionSummary.instructionId, title: selectedInstructionSummary.title }));
    expect(metadataOnlyInstructions.instructions[0]).not.toHaveProperty("body");
  }, 15_000);

  it("pages and filters 10,000 Subflow summaries within the local directory budget", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Subflow SQL Scale" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.subflow-scale", name: "Subflow Scale" });
    const repository = new SQLiteRepository<JsonObject>({
      rootDir: path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "runtime", "sqlite"),
      kind: "flow.subflows",
      layoutVersion: 1
    });
    await repository.transaction({}, async (transaction) => {
      for (let index = 0; index < 10_000; index += 1) {
        const subflowId = `subflow.scale.${String(index).padStart(5, "0")}`;
        const data = {
          subflowId,
          summaryVersion: 2,
          graphFlowId: `${flow.flowId}.${subflowId}.graph`,
          flowId: flow.flowId,
          projectId: project.id,
          name: index === 9_999 ? "Needle Recovery" : `Subflow ${String(index).padStart(5, "0")}`,
          role: index === 9_999 ? "recovery" : "utility",
          status: index % 7 === 0 ? "disabled" : "active",
          updatedAt: 100_000 + index
        };
        await transaction.run(`insert into ${repository.tableName} (id, kind, data, created_at_ms, updated_at_ms) values (?, ?, ?, ?, ?)`, [subflowId, "flow.subflows", JSON.stringify(data), data.updatedAt, data.updatedAt]);
      }
    });

    const pageStartedAt = performance.now();
    const page = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 50, offset: 9_950, sort: "updated", direction: "asc" });
    const pageElapsedMs = performance.now() - pageStartedAt;
    const searchStartedAt = performance.now();
    const filtered = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, status: "active", role: "recovery", search: "needle", limit: 50, offset: 0 });
    const searchElapsedMs = performance.now() - searchStartedAt;

    expect(page).toMatchObject({ total: 10_000, limit: 50, offset: 9_950 });
    expect(page.subflows).toHaveLength(50);
    expect(page.subflows[0]).not.toHaveProperty("inputMapping");
    expect(filtered.subflows).toEqual([expect.objectContaining({ subflowId: "subflow.scale.09999", name: "Needle Recovery", role: "recovery", status: "active" })]);
    expect(pageElapsedMs).toBeLessThan(500);
    expect(searchElapsedMs).toBeLessThan(500);
  });

  it("filters adaptations by status and records review/promotion transitions", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Adaptation Review" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.adaptation-review", name: "Adaptation Review Flow" });
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...flow,
        nodes: [
          { id: "expect.ready", definitionId: "builtin.policy.expectation", parameterValues: { timeoutMs: 100 } },
          { id: "action.submit", definitionId: "builtin.policy.action", parameterValues: { target: { selector: "#old" } } }
        ],
        edges: []
      }
    });
    const base = {
      schemaVersion: "0.1" as const,
      flowId: flow.flowId,
      projectId: project.id,
      trigger: "Expected state changed",
      patch: [{ kind: "edit_expectation" as const, targetId: "expect.ready", summary: "Wait for ready state.", after: { timeoutMs: 500, retryCount: 3 } }],
      validationResults: [{ runId: "run.validation.1", status: "succeeded" as const, checkedAt: 20 }],
      author: "runtime" as const,
      riskLevel: "low" as const,
      createdAt: 10,
      updatedAt: 10
    };
    await service.saveFlowAdaptation({ ...base, adaptationId: "adaptation.apply", status: "validated" });
    await service.saveFlowAdaptation({ ...base, adaptationId: "adaptation.reject", status: "proposed" });
    await service.saveFlowAdaptation({ ...base, adaptationId: "adaptation.disable", status: "proposed" });
    await service.saveFlowAdaptation({ ...base, adaptationId: "adaptation.supersede", status: "validated" });
    await service.saveFlowAdaptation({ ...base, adaptationId: "adaptation.manual", status: "validated" });

    const validated = await service.listFlowAdaptationSummaries({ projectId: project.id, flowId: flow.flowId, status: "validated", limit: 10 });
    expect(validated.adaptations.map((adaptation) => adaptation.adaptationId).sort()).toEqual(["adaptation.apply", "adaptation.manual", "adaptation.supersede"]);

    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.apply", action: "apply", reason: "Validation passed." })).resolves.toMatchObject({
      status: "applied",
      appliedTo: [{ kind: "expectation", id: "expect.ready" }],
      metadata: { applicationRecord: { reversible: true, durable: true } }
    });
    await expect(service.getFlow(project.id, flow.flowId)).resolves.toMatchObject({
      metadata: { appliedAdaptationIds: ["adaptation.apply"] },
      nodes: expect.arrayContaining([expect.objectContaining({ id: "expect.ready", parameterValues: { timeoutMs: 500, retryCount: 3 } })])
    });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.apply", action: "revert" })).resolves.toMatchObject({ status: "reverted" });
    await expect(service.getFlow(project.id, flow.flowId)).resolves.toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ id: "expect.ready", parameterValues: { timeoutMs: 100 } })])
    });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.reject", action: "reject", reason: "Conflicts with operator instruction." })).resolves.toMatchObject({ status: "rejected" });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.disable", action: "disable" })).resolves.toMatchObject({ status: "disabled" });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.supersede", action: "supersede", supersededByAdaptationId: "adaptation.apply" })).resolves.toMatchObject({ status: "superseded", metadata: { supersededByAdaptationId: "adaptation.apply" } });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.manual", action: "switch_manual" })).resolves.toMatchObject({ status: "proposed", metadata: { proposalModeOverride: "manual" } });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.reject", action: "apply" })).rejects.toThrow("rejected adaptations cannot be applied");
  });

  it("applies and reverts durable action target and structural adaptation patches", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Durable Adaptations" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.durable-adaptations", name: "Durable Adaptations Flow" });
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...flow,
        nodes: [
          { id: "action.submit", definitionId: "builtin.policy.action", parameterValues: { target: { selector: "#old" } } },
          { id: "broken", definitionId: "builtin.math.divide", parameterValues: {} },
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: []
      }
    });

    const base = {
      schemaVersion: "0.1" as const,
      flowId: flow.flowId,
      projectId: project.id,
      trigger: "Runtime drift",
      validationResults: [{ runId: "run.validation.1", status: "succeeded" as const, checkedAt: 20 }],
      author: "runtime" as const,
      riskLevel: "low" as const,
      createdAt: 10,
      updatedAt: 10
    };

    await service.saveFlowAdaptation({
      ...base,
      adaptationId: "adaptation.target",
      status: "validated",
      patch: [{ kind: "edit_action_target", targetId: "action.submit", summary: "Use the new submit target.", after: { selector: "#new" } }]
    });
    await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.target", action: "apply" });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.target", action: "apply" })).resolves.toMatchObject({
      status: "applied",
      metadata: { idempotentApply: { reason: "Adaptation was already applied." } }
    });
    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, adaptiveMode: "deterministic" });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    expect(detail).toBeTruthy();
    await service.saveFlowRunDetail({ ...detail!, adaptationIds: ["adaptation.target"] });
    await expect(service.exportFlowRunAudit(project.id, run.runId)).resolves.toMatchObject({
      runId: run.runId,
      manifest: { actionCount: expect.any(Number), recoveryCount: expect.any(Number), routeDecisionCount: expect.any(Number), interventionCount: expect.any(Number), adaptationCount: 1 },
      integrity: { algorithm: "sha256", runDetailHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
      retention: { rawPromptsRetained: false, compactContextRetained: true, sensitiveValuesRedacted: true },
      adaptations: [expect.objectContaining({
        adaptationId: "adaptation.target",
        validationResults: [{ runId: "run.validation.1", status: "succeeded", checkedAt: 20 }],
        mutationEvidence: expect.arrayContaining([expect.objectContaining({
          patchKind: "edit_action_target",
          before: expect.any(Object),
          after: expect.any(Object),
          rollback: expect.any(Object)
        })])
      })]
    });
    await expect(service.getFlow(project.id, flow.flowId)).resolves.toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ id: "action.submit", parameterValues: { target: { selector: "#new" } } })])
    });
    await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.target", action: "revert" });
    await expect(service.getFlow(project.id, flow.flowId)).resolves.toMatchObject({
      nodes: expect.arrayContaining([expect.objectContaining({ id: "action.submit", parameterValues: { target: { selector: "#old" } } })])
    });

    await service.saveFlowChangeProposal({
      schemaVersion: "0.1",
      proposalId: "proposal.reroute",
      flowId: flow.flowId,
      projectId: project.id,
      mode: "auto",
      status: "auto_approved",
      riskLevel: "low",
      patches: [{ kind: "edit_router", targetId: "broken", summary: "Route failures to the end node.", after: { toNodeId: "end" } }],
      createdBy: "runtime",
      createdAt: 30,
      updatedAt: 30
    });
    await service.saveFlowAdaptation({
      ...base,
      adaptationId: "adaptation.reroute",
      status: "validated",
      proposalId: "proposal.reroute",
      patch: [{ kind: "edit_router", targetId: "broken", summary: "Route failures to the end node.", after: { toNodeId: "end" } }]
    });
    const appliedRouter = await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.reroute", action: "apply" });
    expect(appliedRouter.metadata?.applicationRecord).toMatchObject({ durable: true, mutations: expect.any(Array) });
    expect((await service.getFlow(project.id, flow.flowId)).edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceNodeId: "broken", sourcePortId: "failed", targetNodeId: "end" })
    ]));
    await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.reroute", action: "revert" });
    expect((await service.getFlow(project.id, flow.flowId)).edges).toEqual([]);
  });

  it("rolls back created subflows and rejects invalid durable mutations", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Durable Subflow Rollback" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.subflow-rollback", name: "Subflow Rollback Flow" });
    const base = {
      schemaVersion: "0.1" as const,
      flowId: flow.flowId,
      projectId: project.id,
      trigger: "Needs recovery path",
      validationResults: [{ runId: "run.validation.1", status: "succeeded" as const, checkedAt: 20 }],
      author: "llm" as const,
      riskLevel: "low" as const,
      createdAt: 10,
      updatedAt: 10
    };

    await service.saveFlowChangeProposal({
      schemaVersion: "0.1",
      proposalId: "proposal.create-subflow",
      flowId: flow.flowId,
      projectId: project.id,
      mode: "auto",
      status: "auto_approved",
      riskLevel: "low",
      patches: [{ kind: "create_subflow", summary: "Create a recovery path.", after: { name: "Recovery path", role: "recovery" } }],
      createdBy: "llm",
      createdAt: 30,
      updatedAt: 30
    });
    await service.saveFlowAdaptation({
      ...base,
      adaptationId: "adaptation.create-subflow",
      status: "validated",
      proposalId: "proposal.create-subflow",
      patch: [{ kind: "create_subflow", summary: "Create a recovery path.", after: { name: "Recovery path", role: "recovery" } }]
    });
    const applied = await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.create-subflow", action: "apply" });
    const createdSubflowId = applied.appliedTo?.[0]?.id;
    expect(createdSubflowId).toEqual(expect.stringContaining("subflow."));
    await expect(service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId })).resolves.toMatchObject({ total: 1 });
    await service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.create-subflow", action: "revert" });
    await expect(service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId })).resolves.toMatchObject({ total: 0 });

    await service.saveFlowAdaptation({
      ...base,
      adaptationId: "adaptation.invalid-target",
      status: "validated",
      author: "runtime",
      patch: [{ kind: "edit_action_target", targetId: "missing", summary: "Retarget a missing node.", after: { selector: "#nope" } }]
    });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.invalid-target", action: "apply" })).rejects.toThrow("Unknown Flow node");
    await expect(service.getFlow(project.id, flow.flowId)).resolves.toMatchObject({ nodes: [] });

    await service.saveFlowAdaptation({
      ...base,
      adaptationId: "adaptation.destructive",
      status: "validated",
      riskLevel: "destructive",
      patch: [{ kind: "edit_expectation", targetId: "missing", summary: "Dangerous edit.", after: { timeoutMs: 1 } }]
    });
    await expect(service.reviewFlowAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: "adaptation.destructive", action: "apply" })).rejects.toThrow("destructive adaptations require manual proposal review");
  });

  it("routes canonical Flow runtime sessions through the selected subflow and records run detail", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Routed Runtime" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.routed-runtime", name: "Routed Flow" });
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...flow,
        nodes: [
          { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }]
      }
    });
    const now = 50_000;
    const subflow = {
      schemaVersion: "0.1" as const,
      subflowId: "subflow.routed.primary",
      flowId: flow.flowId,
      projectId: project.id,
      name: "Primary path",
      role: "primary" as const,
      status: "active" as const,
      graphFlowId: flow.flowId,
      createdAt: now,
      updatedAt: now
    };
    await service.saveFlowSubflow(subflow);
    await service.saveFlowRouter({
      schemaVersion: "0.1",
      routerId: "router.routed",
      flowId: flow.flowId,
      projectId: project.id,
      name: "Routed Flow Router",
      rules: [{
        schemaVersion: "0.1",
        ruleId: "rule.primary",
        routerId: "router.routed",
        name: "Primary mode",
        target: { kind: "subflow", subflowId: subflow.subflowId },
        order: 1,
        status: "active",
        condition: { signalPath: "inputs.mode", operator: "equals", expected: "primary" },
        createdAt: now,
        updatedAt: now
      }],
      fallback: { kind: "fail", message: "No route." },
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { mode: "primary" } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(run.status).toBe("succeeded");
    expect(detail).not.toBeNull();
    expect(detail?.routeDecisions).toEqual([expect.objectContaining({ selectedRuleId: "rule.primary", selectedSubflowId: subflow.subflowId })]);
    const routeDecisionId = detail!.routeDecisions[0]?.decisionId;
    expect(detail?.subflows).toEqual([expect.objectContaining({ subflowId: subflow.subflowId, status: "succeeded", metadata: expect.objectContaining({ graphFlowId: flow.flowId, routeDecisionId }) })]);
  });

  it("creates, updates, duplicates, disables, and archives Flow subflows", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Subflow CRUD" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.subflow-crud", name: "Subflow CRUD Flow" });

    const created = await service.createFlowSubflow({
      projectId: project.id,
      flowId: flow.flowId,
      name: "Checkout",
      role: "primary",
      routeTags: ["checkout", "cart"]
    });
    const subflowGraph = await service.getFlow(project.id, created.graphFlowId!);
    const renamed = await service.renameFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId, name: "Checkout happy path" });
    const updated = await service.updateFlowSubflow({
      projectId: project.id,
      flowId: flow.flowId,
      subflowId: created.subflowId,
      inputMapping: [{ flowInputId: "accountId", subflowInputId: "accountId", required: true }],
      outputMapping: [{ subflowOutputId: "receiptId", flowOutputId: "receiptId" }],
      localInstructionIds: ["instruction.checkout"],
      proposalModeOverride: "manual"
    });
    const inheritedApproval = await service.updateFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId, proposalModeOverride: null });
    const duplicated = await service.duplicateFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId, name: "Checkout retry path" });
    const disabled = await service.disableFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId });
    const archived = await service.archiveFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: duplicated.subflowId });
    const enabled = await service.enableFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId });
    const duplicateGraph = await service.getFlow(project.id, duplicated.graphFlowId!);
    const deleted = await service.deleteFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: duplicated.subflowId });
    const page = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId });
    const flowSummaries = await service.listAutomationFlowSummaries(project.id);

    expect(subflowGraph).toMatchObject({ flowId: created.graphFlowId, metadata: { parentFlowId: flow.flowId, parentSubflowId: created.subflowId, subflowGraph: true } });
    expect(flowSummaries).toContainEqual(expect.objectContaining({
      flowId: created.graphFlowId,
      subflowGraph: true,
      parentFlowId: flow.flowId,
      parentSubflowId: created.subflowId
    }));
    expect(renamed.name).toBe("Checkout happy path");
    expect(updated.inputMapping).toEqual([{ flowInputId: "accountId", subflowInputId: "accountId", required: true }]);
    expect(updated.proposalModeOverride).toBe("manual");
    expect(inheritedApproval.proposalModeOverride).toBeUndefined();
    expect(duplicated.metadata).toMatchObject({ duplicatedFromSubflowId: created.subflowId });
    expect(duplicated.graphFlowId).not.toBe(created.graphFlowId);
    expect(duplicateGraph.metadata).toMatchObject({ parentSubflowId: duplicated.subflowId, duplicatedFromFlowId: created.graphFlowId });
    expect(disabled.status).toBe("disabled");
    expect(archived.status).toBe("archived");
    expect(enabled.status).toBe("active");
    expect(deleted).toEqual({ deletedSubflowId: duplicated.subflowId, deletedGraphFlowId: duplicated.graphFlowId });
    expect(page.subflows.map((item) => item.subflowId)).toEqual([created.subflowId]);
    expect(page.subflows[0]).toMatchObject({ summaryVersion: 2, graphFlowId: created.graphFlowId });
  });

  it("rejects stale Subflow Settings revisions without overwriting canonical data", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Subflow settings conflict" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.subflow-conflict", name: "Conflict Flow" });
    const created = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Original" });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const current = await service.updateFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId, name: "Current" });

    await expect(service.updateFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId, expectedUpdatedAt: created.updatedAt, name: "Stale overwrite" })).rejects.toThrow("SUBFLOW_SAVE_CONFLICT");
    await expect(service.getFlowSubflow(project.id, flow.flowId, created.subflowId)).resolves.toMatchObject({ name: "Current", updatedAt: current.updatedAt });
  });

  it("uses subflow summaries as the canonical Flow hierarchy source", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Canonical Subflow Sidebar" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.canonical-subflows", name: "Canonical" });
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...flow,
        metadata: { ...(flow.metadata ?? {}), subflowCategories: [{ id: "category.live", name: "Live", parentId: null }] }
      } as any
    });
    const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Live Path", parentCategoryId: "category.live" });
    const staleParent = await service.getFlow(project.id, flow.flowId);
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...staleParent,
        expansion: { subflowIds: [{ subflowId: "subflow.stale", name: "Stale Path", metadata: { subflowCategoryId: "category.live" } }] }
      } as any
    });

    const summaries = await service.listAutomationFlowSummaries(project.id);
    const parentSummary = summaries.find((summary) => summary.flowId === flow.flowId);

    expect(parentSummary?.hierarchySubflows).toEqual([{ subflowId: subflow.subflowId, name: "Live Path", graphFlowId: subflow.graphFlowId, parentCategoryId: "category.live" }]);
    await expect(service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId })).resolves.toMatchObject({
      subflows: [expect.objectContaining({ subflowId: subflow.subflowId, parentCategoryId: "category.live" })]
    });
  });

  it("rolls back a generated graph Flow when subflow creation fails before canonical membership is written", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Subflow Create Rollback" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.subflow-rollback", name: "Rollback" });

    await expect(service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Broken", parentCategoryId: "category.missing" })).rejects.toThrow();

    const summaries = await service.listAutomationFlowSummaries(project.id);
    const subflows = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId });
    expect(subflows.subflows).toEqual([]);
    expect(summaries.some((summary) => summary.parentFlowId === flow.flowId || summary.hierarchySubflows?.some((item) => item.name === "Broken"))).toBe(false);
  });
  it("repairs stale subflow ownership and hierarchy metadata before returning Flow summaries", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Stale Subflow Summary" });
    const parent = await service.createFlow({ projectId: project.id, flowId: "flow.stale-parent", name: "Test" });
    const subflow = await service.createFlowSubflow({
      projectId: project.id,
      flowId: parent.flowId,
      name: "Checkout",
      role: "primary"
    });
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...parent,
        expansion: { subflowIds: [{ subflowId: subflow.subflowId, name: "Checkout", metadata: { subflowCategoryId: "category.checkout" } }] },
        metadata: { ...(parent.metadata ?? {}), subflowCategories: [{ id: "category.checkout", name: "Checkout paths", parentId: null }] }
      } as any
    });
    const indexFile = path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "indexes", "flows.json");
    const staleEnvelope = JSON.parse(await readFile(indexFile, "utf8")) as {
      version: 1;
      data: {
        schemaVersion: "0.1";
        ownershipMetadataVersion?: 1;
        hierarchyMetadataVersion?: 1;
        flows: Array<Record<string, unknown>>;
      };
    };
    delete staleEnvelope.data.ownershipMetadataVersion;
    delete staleEnvelope.data.hierarchyMetadataVersion;
    for (const summary of staleEnvelope.data.flows) {
      delete summary.subflowGraph;
      delete summary.parentFlowId;
      delete summary.parentSubflowId;
      delete summary.hierarchySubflows;
      delete summary.subflowCategories;
    }
    await writeFile(indexFile, JSON.stringify(staleEnvelope, null, 2), "utf8");

    const reloaded = createService({ dataDir: tempRoot, seedFixture: false });
    const summaries = await reloaded.listAutomationFlowSummaries(project.id);
    const repairedEnvelope = JSON.parse(await readFile(indexFile, "utf8")) as {
      data: {
        ownershipMetadataVersion?: number;
        hierarchyMetadataVersion?: number;
        flows: Array<Record<string, unknown>>;
      };
    };
    const repairedIndex = repairedEnvelope.data;

    expect(summaries).toContainEqual(expect.objectContaining({
      flowId: subflow.graphFlowId,
      subflowGraph: true,
      parentFlowId: parent.flowId,
      parentSubflowId: subflow.subflowId
    }));
    expect(summaries).toContainEqual(expect.objectContaining({
      flowId: parent.flowId,
      hierarchySubflows: [{ subflowId: subflow.subflowId, name: "Checkout", graphFlowId: subflow.graphFlowId, parentCategoryId: "category.checkout" }],
      subflowCategories: [{ id: "category.checkout", name: "Checkout paths" }]
    }));
    expect(repairedIndex.ownershipMetadataVersion).toBe(1);
    expect(repairedIndex.hierarchyMetadataVersion).toBe(1);
    expect(repairedIndex.flows).toContainEqual(expect.objectContaining({
      flowId: subflow.graphFlowId,
      subflowGraph: true,
      parentFlowId: parent.flowId,
      parentSubflowId: subflow.subflowId
    }));
  });
  it("deletes saved project artifacts and owned flow files from project folders", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Deletion Project" });
    const now = Date.now();
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "task",
      artifact: {
        schemaVersion: "0.1",
        taskId: "task.delete-me",
        name: "Delete Me",
        policyFlowId: "task.task.delete-me.policy-flow",
        recordingIds: [],
        createdAt: now,
        updatedAt: now,
        metadata: {
          policyId: "policy.task.delete-me.saved"
        }
      }
    });
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "flow",
      artifact: {
        schemaVersion: "0.1",
        flowId: "task.task.delete-me.policy-flow",
        ownerKind: "task",
        ownerId: "task.delete-me",
        name: "Delete Me",
        nodes: [],
        edges: [],
        createdAt: now,
        updatedAt: now
      }
    });

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "tasks", "task.delete-me", "task.json"), "utf8")).resolves.toContain("\"taskId\"");
    await expect(readFile(path.join(projectRoot, "flows", "task.task.delete-me.policy-flow", "flow.json"), "utf8")).resolves.toContain("\"flowId\"");

    const deleted = await service.deleteProjectArtifact({ projectId: project.id, kind: "task", artifactId: "task.delete-me", deleteOwnedArtifacts: true });
    const artifacts = await service.listProjectArtifacts(project.id);

    expect(deleted.deletedArtifactIds).toEqual(expect.arrayContaining(["task:task.delete-me", "flow:task.task.delete-me.policy-flow", "policy:policy.task.delete-me.saved"]));
    expect(artifacts.tasks.map((item) => item.taskId)).not.toContain("task.delete-me");
    expect(artifacts.flows.map((item) => item.flowId)).not.toContain("task.task.delete-me.policy-flow");
    await expect(readFile(path.join(projectRoot, "tasks", "task.delete-me", "task.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(projectRoot, "flows", "task.task.delete-me.policy-flow", "flow.json"), "utf8")).rejects.toThrow();
  });

  it("persists recording pipeline artifacts through proposal approval and replay", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Pipeline Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.pipeline-test",
      taskId: "task.pipeline",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.step-started", outputId: "output.step-started", parameters: { step: 1 }, origin: "operator", startedAt: 300, timestamp: 300 }
    });
    await service.appendRecordingMarkerEntry({ projectId: project.id, recordingId: recording.recordingId, label: "Goal", monotonicOffsetMs: 1000 });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.step-completed", outputId: "output.step-completed", parameters: { step: 1 }, origin: "operator", startedAt: 1300, timestamp: 1300 }
    });
    await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const review = await service.createNormalizationReview({ projectId: project.id, recordingId: recording.recordingId });
    const miningRun = await service.mineRecordingEvidence({ projectId: project.id, recordingId: recording.recordingId });
    const model = await service.learnTaskModel({ projectId: project.id, taskId: "task.pipeline", miningRunId: miningRun.miningRunId });
    const proposal = await service.proposePolicyFromModel({ projectId: project.id, learnedTaskModelId: model.learnedTaskModelId });
    const approved = await service.approvePolicyProposal({ projectId: project.id, proposalId: proposal.proposalId });
    const replay = await service.replayPolicyAgainstRecording({ projectId: project.id, recordingId: recording.recordingId, policyId: approved.policy.policyId });
    const artifacts = await service.listPipelineArtifacts(project.id);
    const approvedFlow = await service.getFlow(project.id, String(approved.metadata?.approvedFlowId));

    expect(review.waitClips[0]).toMatchObject({ waitMs: 800 });
    expect(proposal.patch).toMatchObject({ targetTaskId: "task.pipeline", mergeStrategy: "append_or_branch" });
    expect(artifacts.miningRuns.map((item) => item.miningRunId)).toContain(miningRun.miningRunId);
    expect(artifacts.evidenceFacts.length).toBeGreaterThan(0);
    expect(artifacts.evidenceObservations.length).toBeGreaterThan(0);
    expect(artifacts.evidenceClaims.length).toBeGreaterThan(0);
    expect(artifacts.learnedTaskModels.map((item) => item.learnedTaskModelId)).toContain(model.learnedTaskModelId);
    expect(artifacts.policyProposals[0]).toMatchObject({ proposalId: proposal.proposalId, status: "approved" });
    expect(replay.policyId).toBe(approved.policy.policyId);
    expect(approvedFlow).toMatchObject({ flowId: "flow.task.pipeline", origin: "recorded", metadata: { policyId: approved.policy.policyId } });
    expect(approvedFlow.nodes.length).toBe(approved.policy.nodes.length);

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "indexes", "pipeline.json"), "utf8")).resolves.toContain(proposal.proposalId);
    await expect(readFile(path.join(projectRoot, "recordings", "recording.pipeline-test", "derived", "index.json"), "utf8")).resolves.toContain(proposal.proposalId);
    await expect(readFile(path.join(projectRoot, "recordings", "recording.pipeline-test", "derived", "evidence", "claims", `${artifacts.evidenceClaims[0]!.claimId}.json`), "utf8")).resolves.toContain("\"claimId\"");
    await expect(readFile(path.join(projectRoot, "proposals", "recording.pipeline-test", proposal.proposalId, "proposal.json"), "utf8")).resolves.toContain("\"proposalId\"");
    await expect(readFile(path.join(projectRoot, "policies", `${approved.policy.policyId}.json`), "utf8")).resolves.toContain("\"policyId\"");
    await expect(readFile(path.join(projectRoot, "tasks", "task.pipeline", "task.json"), "utf8")).rejects.toThrow();

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });
    await expect(readFile(path.join(projectRoot, "recordings", "recording.pipeline-test", "derived", "index.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(projectRoot, "proposals", "recording.pipeline-test", proposal.proposalId, "proposal.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(projectRoot, "recordings", "recording.pipeline-test", "derived", "evidence", "claims", `${artifacts.evidenceClaims[0]!.claimId}.json`), "utf8")).rejects.toThrow();
    expect((await service.listPipelineArtifacts(project.id)).policyProposals).toEqual([]);
  });

  it("proposes a task directly from recording-owned mined evidence", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    service.registerRecordingDomain({
      domainId: "example.direct",
      label: "Direct proposal domain",
      schemaVersion: "0.1",
      events: [{
        eventType: "step.completed",
        label: "Step completed",
        payloadSchema: { type: "object" },
        stateReducer: ({ event, previousState }) => ({
          state: {
            timestamp: event.timestamp ?? Date.now(),
            namespaces: {
              ...previousState.namespaces,
              task: {
                schemaId: "example.direct",
                schemaVersion: "0.1",
                values: {
                  status: stateValue("string", "completed", event.timestamp ?? Date.now())
                }
              }
            }
          }
        })
      }],
      statePaths: [{
        namespace: "task",
        path: "status",
        type: "string",
        elementKind: "status",
        label: "Task status",
        stableAcrossSessions: false
      }]
    });
    const project = await service.createProject({ name: "Direct Proposal Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.direct-proposal",
      taskId: "task.direct",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingDomainEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      domainId: "example.direct",
      eventType: "step.completed",
      timestamp: 300,
      payload: { step: 1 }
    });
    await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });
    const miningRun = await service.mineRecordingEvidence({ projectId: project.id, recordingId: recording.recordingId });

    await expect(service.proposePolicyFromModel({ projectId: project.id, recordingId: recording.recordingId })).rejects.toThrow(/No executable output-bound actions/);
    const projectArtifacts = await service.listProjectArtifacts(project.id);

    expect(miningRun.correlations?.[0]).toMatchObject({ statePath: "task.status", elementKind: "status", descriptor: { label: "Task status" } });
    expect(projectArtifacts.tasks).toEqual([]);
    expect(projectArtifacts.flows).toEqual([]);

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "recordings", "recording.direct-proposal", "derived", "evidence", "mining-runs", `${miningRun.miningRunId}.json`), "utf8")).resolves.toContain("\"miningRunId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.direct-proposal", "derived", "evidence", "facts", `${miningRun.evidenceFactIds![0]}.json`), "utf8")).resolves.toContain("\"factId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.direct-proposal", "derived", "evidence", "observations", `${miningRun.evidenceObservationIds![0]}.json`), "utf8")).resolves.toContain("\"observationId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.direct-proposal", "derived", "evidence", "correlations", `${miningRun.stateActionCorrelationIds![0]}.json`), "utf8")).resolves.toContain("\"correlationId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.direct-proposal", "derived", "evidence", "claims", `${miningRun.evidenceClaimIds![0]}.json`), "utf8")).resolves.toContain("\"claimId\"");
    await expect(readdir(path.join(projectRoot, "proposals", "recording.direct-proposal"))).rejects.toThrow();
  });

  it("turns state evidence around an output action into eligibility and success conditions", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    service.registerRecordingDomain({
      domainId: "example.state-evidence",
      label: "State evidence domain",
      schemaVersion: "0.1",
      events: [{
        eventType: "status.changed",
        label: "Status changed",
        payloadSchema: { type: "object" },
        stateReducer: ({ event, previousState }) => ({
          state: {
            timestamp: event.timestamp ?? Date.now(),
            namespaces: {
              ...previousState.namespaces,
              task: {
                schemaId: "example.state-evidence",
                schemaVersion: "0.1",
                values: {
                  status: stateValue("string", String(event.payload?.status ?? "unknown"), event.timestamp ?? Date.now())
                }
              }
            }
          }
        })
      }],
      statePaths: [{
        namespace: "task",
        path: "status",
        type: "string",
        elementKind: "status",
        label: "Task status"
      }]
    });
    const project = await service.createProject({ name: "State Evidence Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.state-evidence",
      taskId: "task.state-evidence",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingDomainEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      domainId: "example.state-evidence",
      eventType: "status.changed",
      timestamp: 150,
      payload: { status: "ready" }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.submit", outputId: "output.submit", parameters: {}, origin: "operator", startedAt: 200, timestamp: 200 }
    });
    await service.appendRecordingDomainEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      domainId: "example.state-evidence",
      eventType: "status.changed",
      timestamp: 250,
      payload: { status: "completed" }
    });
    await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const miningRun = await service.mineRecordingEvidence({ projectId: project.id, recordingId: recording.recordingId });
    const proposal = await service.proposePolicyFromModel({ projectId: project.id, recordingId: recording.recordingId });
    const node = proposal.policy.nodes[0]!;

    expect(miningRun.conditionCandidates.some((candidate) => candidate.signalPath === "task.status" && candidate.metadata?.actionEntryId === "entry.3")).toBe(true);
    expect(miningRun.actionEffects.some((effect) => effect.actionOccurrenceId === "entry.3" && effect.signalPath === "task.status")).toBe(true);
    expect(node.eligibility.conditions.length).toBeGreaterThan(0);
    expect(node.successConditions.conditions.length).toBeGreaterThan(0);
    expect(node.sourceEvidence.some((item) => item.layer === "state_action_correlation")).toBe(true);
  });

  it("merges proposals from multiple recordings into one canonical Flow", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Branching Proposal Project" });
    for (const [recordingId, secondStep] of [["recording.branch-a", "branch.a"], ["recording.branch-b", "branch.b"]] as const) {
      const recording = await service.createRecording({
        projectId: project.id,
        recordingId,
        taskId: "task.branching",
        startedAt: 100,
        initialState: { timestamp: 100, namespaces: {} }
      });
      await service.appendRecordingEvent({
        projectId: project.id,
        recordingId: recording.recordingId,
        entry: { type: "action", actionType: "output.shared-start", outputId: "output.shared-start", parameters: {}, origin: "operator", startedAt: 200, timestamp: 200 }
      });
      await service.appendRecordingEvent({
        projectId: project.id,
        recordingId: recording.recordingId,
        entry: { type: "action", actionType: `output.${secondStep}`, outputId: `output.${secondStep}`, parameters: {}, origin: "operator", startedAt: 300, timestamp: 300 }
      });
      await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 400 });
      const processed = await service.processFinalizedRecording({ projectId: project.id, recordingId: recording.recordingId });
      expect(processed.proposal?.patch?.nodes.length).toBe(2);
      await service.approvePolicyProposal({ projectId: project.id, proposalId: processed.proposal!.proposalId });
    }

    const flow = await service.getFlow(project.id, "flow.task.branching");

    expect((flow.metadata?.sourceRecordingIds as string[]).sort()).toEqual(["recording.branch-a", "recording.branch-b"]);
    expect(flow.nodes.map((node) => node.parameterValues?.outputId)).toEqual(expect.arrayContaining(["output.shared-start", "output.branch.a", "output.branch.b"]));
    expect(flow.nodes.length).toBeGreaterThanOrEqual(3);
    expect(flow.edges.some((edge) => edge.label === "Recorded branch")).toBe(true);
  });

  it("applies edited proposal overrides exactly instead of preserving deleted nodes", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Edited Proposal Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.edited-proposal",
      taskId: "task.edited-proposal",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.step-one", outputId: "output.step-one", parameters: { step: 1 }, origin: "operator", startedAt: 200, timestamp: 200 }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.step-two", outputId: "output.step-two", parameters: { step: 2 }, origin: "operator", startedAt: 300, timestamp: 300 }
    });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 400 });
    const processed = await service.processFinalizedRecording({ projectId: project.id, recordingId: recording.recordingId });
    const proposal = processed.proposal!;
    const approved = await service.approvePolicyProposal({ projectId: project.id, proposalId: proposal.proposalId });
    expect(approved.policy.nodes.length).toBeGreaterThan(1);
    const existingFlow = await service.getFlow(project.id, "flow.task.edited-proposal");
    await service.saveFlow({ projectId: project.id, flow: { ...existingFlow, name: "Edited Proposal Flow" } });

    const override = {
      ...proposal.policy,
      policyId: approved.policy.policyId,
      taskId: "task.edited-proposal",
      nodes: [],
      edges: []
    };
    const edited = await service.approvePolicyProposal({
      projectId: project.id,
      proposalId: proposal.proposalId,
      targetFlowId: "flow.task.edited-proposal",
      requireExistingFlow: true,
      policyOverride: override
    });
    const flow = await service.getFlow(project.id, "flow.task.edited-proposal");

    expect(edited.policy.nodes).toEqual([]);
    expect(edited.policy.edges).toEqual([]);
    expect(flow.name).toBe("Edited Proposal Flow");
    expect(flow.nodes).toEqual([]);
    expect(flow.edges).toEqual([]);
  });

  it("proposes a task from sparse mined action evidence without state correlations", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Sparse Proposal Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.sparse-proposal",
      taskId: "task.sparse",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.first", outputId: "output.first", parameters: { step: 1 }, origin: "operator", startedAt: 200, timestamp: 200 }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.second", outputId: "output.second", parameters: { step: 2 }, origin: "operator", startedAt: 300, timestamp: 300 }
    });
    await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });
    const miningRun = await service.mineRecordingEvidence({ projectId: project.id, recordingId: recording.recordingId });

    const proposal = await service.proposePolicyFromModel({ projectId: project.id, recordingId: recording.recordingId });

    expect(miningRun.correlations).toEqual([]);
    expect(proposal.metadata).toMatchObject({ source: "mined_evidence", recordingId: recording.recordingId, miningRunId: miningRun.miningRunId });
    expect(proposal.policy.nodes.length).toBeGreaterThan(0);
    expect(proposal.policy.nodes[0]?.sourceEvidence[0]?.layer).toBe("evidence_observation");
  });

  it("processes finalized recordings into current task proposals", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Finalized Processing Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.process-finalized",
      taskId: "task.process-finalized",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "domain_event", eventType: "step.one", timestamp: 200, payload: { step: 1 } }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "domain_event", eventType: "step.two", timestamp: 300, payload: { step: 2 } }
    });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 400 });

    const processed = await service.processFinalizedRecording({ projectId: project.id, recordingId: recording.recordingId });
    const skipped = await service.processFinalizedRecording({ projectId: project.id, recordingId: recording.recordingId });

    expect(processed.status).toBe("partial");
    expect(processed.normalizedTimeline?.recordingId).toBe(recording.recordingId);
    expect(processed.miningRun?.metadata).toMatchObject({ recordingId: recording.recordingId });
    expect(processed.proposal).toBeUndefined();
    expect(processed.issues).toEqual(expect.arrayContaining([expect.stringMatching(/No executable output-bound actions/)]));
    await expect(service.listProjectArtifacts(project.id)).resolves.toMatchObject({ tasks: [], flows: [] });
    expect(skipped.status).toBe("partial");
    expect(skipped.proposal).toBeUndefined();
  });

  it("keeps finalized recording proposals stable and persisted", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Stable Proposal Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.stable-proposal",
      taskId: "task.stable-proposal",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "domain_event", eventType: "step.one", timestamp: 200, payload: { step: 1 } }
    });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 300 });

    const first = await service.processFinalizedRecording({ projectId: project.id, recordingId: recording.recordingId });
    await expect(service.proposePolicyFromModel({ projectId: project.id, recordingId: recording.recordingId })).rejects.toThrow(/No executable output-bound actions/);
    const artifacts = await service.listPipelineArtifacts(project.id);
    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);

    expect(first.status).toBe("partial");
    expect(first.proposal).toBeUndefined();
    expect(artifacts.policyProposals.filter((proposal) => proposal.metadata?.recordingId === recording.recordingId)).toEqual([]);
    await expect(readdir(path.join(projectRoot, "proposals", recording.recordingId))).rejects.toThrow();

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });
    expect((await service.listPipelineArtifacts(project.id)).policyProposals.filter((proposal) => proposal.metadata?.recordingId === recording.recordingId)).toEqual([]);
    await expect(readdir(path.join(projectRoot, "proposals", recording.recordingId))).rejects.toThrow();
  });

  it("accepts only registered domain recording events and records derived state", async () => {
    const service = createService({ seedFixture: false });
    service.registerRecordingDomain({
      domainId: "example.domain",
      label: "Example domain",
      schemaVersion: "0.1",
      events: [
        {
          eventType: "counter.changed",
          label: "Counter changed",
          payloadSchema: {
            type: "object",
            required: true,
            properties: {
              value: { type: "integer", required: true, label: "Counter value" }
            }
          },
          stateReducer: ({ event, previousState }) => ({
            state: {
              timestamp: event.timestamp ?? Date.now(),
              namespaces: {
                ...previousState.namespaces,
                example: {
                  schemaId: "example.counter",
                  schemaVersion: "0.1",
                  values: {
                    count: stateValue("integer", Number(event.payload?.value ?? 0), event.timestamp ?? Date.now())
                  }
                }
              }
            }
          }),
          observationExtractor: ({ event }) => ({
            observationType: "example.counter_observed",
            payload: { value: event.payload?.value ?? 0 }
          })
        }
      ]
    });
    const recording = await service.createRecording({
      recordingId: "recording.domain-test",
      initialState: { timestamp: 1, namespaces: {} }
    });

    const rejected = await service.appendRecordingDomainEvent({
      recordingId: recording.recordingId,
      domainId: "example.domain",
      eventType: "counter.changed",
      payload: { value: "wrong" }
    });
    expect(rejected.accepted).toBe(false);

    const accepted = await service.appendRecordingDomainEvent({
      recordingId: recording.recordingId,
      domainId: "example.domain",
      eventType: "counter.changed",
      timestamp: 10,
      payload: { value: 3 }
    });

    expect(accepted.accepted).toBe(true);
    expect(accepted.stateDeltas).toHaveLength(1);
    expect(accepted.recording.timeline.map((entry) => entry.type)).toEqual(["domain_event", "state_delta", "state_checkpoint", "observation"]);
    expect(service.validateRecordingDomainEvent({
      recordingId: recording.recordingId,
      domainId: "example.domain",
      eventType: "missing"
    }).ok).toBe(false);
  });
});

describe("AutomationStudioService canonical Flow persistence", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-studio-service-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("persists new canonical Flows in project files with project scope enforcement", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const domainProject = await service.createProject({ name: "Orders", domainId: "orders" });
    const globalProject = await service.createProject({ name: "Global" });
    const flow = await service.createFlow({ projectId: domainProject.id, flowId: "flow.orders.submit", name: "Submit order" });
    await expect(service.createFlow({ projectId: domainProject.id, flowId: flow.flowId, name: "Accidental overwrite" })).rejects.toThrow("already exists");

    expect(flow.scope).toEqual({ kind: "domain", domainId: "orders" });
    await expect(service.saveFlow({ projectId: globalProject.id, flow: { ...flow, projectId: globalProject.id } })).rejects.toThrow("scope");
    const published = await service.publishFlow({ projectId: domainProject.id, flowId: flow.flowId, version: "1.0.0", flowDigest: "sha256:submit-order" });
    expect(published).toMatchObject({ visibility: "public", publication: { status: "published", version: "1.0.0" } });
    await expect(service.listFlowPublications(domainProject.id, flow.flowId)).resolves.toMatchObject([{ flowId: flow.flowId, version: "1.0.0", status: "published" }]);
    await expect(service.saveFlow({ projectId: domainProject.id, flow: { ...published, publicationHistory: [] } })).rejects.toThrow("publication history is immutable");
    await expect(service.saveFlow({ projectId: domainProject.id, flow: { ...published, publication: { status: "draft" } } })).rejects.toThrow("snapshot metadata is immutable");

    const reloaded = createService({ dataDir: tempRoot, seedFixture: false });
    const entries = await reloaded.listFlows(domainProject.id);
    expect(entries.find((entry) => entry.source === "canonical")?.flow).toMatchObject({ flowId: flow.flowId, projectId: domainProject.id });
    await expect(reloaded.deprecateFlowPublication({ projectId: domainProject.id, flowId: flow.flowId, version: "1.0.0", reason: "Use 2.0.0" })).resolves.toMatchObject({ status: "deprecated", deprecationReason: "Use 2.0.0" });
    await expect(reloaded.listPublishedFlowNodes(domainProject.id)).resolves.toEqual([]);
    await expect(reloaded.getFlow(globalProject.id, flow.flowId)).rejects.toThrow("Unknown Automation Studio Flow");
  });

  it("creates Flows without hydrating every persisted Flow in the project", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Large Flow Project" });
    await service.createFlow({ projectId: project.id, flowId: "flow.persisted", name: "Persisted" });

    const reloaded = createService({ dataDir: tempRoot, seedFixture: false });
    (reloaded as unknown as { loadProjectFlows: () => Promise<void> }).loadProjectFlows = async () => {
      throw new Error("full project Flow hydration should not be used for createFlow");
    };

    await expect(reloaded.createFlow({ projectId: project.id, flowId: "flow.new", name: "New Flow" })).resolves.toMatchObject({
      flowId: "flow.new",
      projectId: project.id,
      name: "New Flow"
    });
    await expect(reloaded.createFlow({ projectId: project.id, flowId: "flow.persisted", name: "Duplicate" })).rejects.toThrow("already exists");
  });

  it("emits scoped project change-feed rows for Flow create, update, and delete", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Flow Feed Project" });
    const created = await service.createFlow({ projectId: project.id, flowId: "flow.feed", name: "Feed Flow" });
    const saved = await service.saveFlow({ projectId: project.id, flow: { ...created, name: "Updated Feed Flow" } });
    await service.deleteFlow({ projectId: project.id, flowId: saved.flowId });

    const feed = await service.listProjectChangeFeed({ projectId: project.id, afterSequence: 0, limit: 10 });
    expect(feed).toMatchObject({ fallback: false, hasMore: false });
    expect(feed.events.map((event) => ({
      projectId: event.projectId,
      entityKind: event.entityKind,
      entityId: event.entityId,
      operation: event.operation
    }))).toEqual([
      { projectId: project.id, entityKind: "flow", entityId: "flow.feed", operation: "create" },
      { projectId: project.id, entityKind: "flow", entityId: "flow.feed", operation: "update" },
      { projectId: project.id, entityKind: "flow", entityId: "flow.feed", operation: "delete" }
    ]);
    expect(feed.events.every((event) => event.revision >= 1 && event.changedAt > 0 && event.transactionId.startsWith(`project-change.${event.operation}.`))).toBe(true);
  });

  it("emits scoped project change-feed rows for subflow create, update, and delete", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Subflow Feed Project" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.subflow-feed", name: "Parent Flow" });
    const created = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Verify Payment" });
    const updated = await service.updateFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: created.subflowId, name: "Verify Payment Method" });
    await service.deleteFlowSubflow({ projectId: project.id, flowId: flow.flowId, subflowId: updated.subflowId });

    const feed = await service.listProjectChangeFeed({ projectId: project.id, afterSequence: 0, limit: 20 });
    const subflowEvents = feed.events.filter((event) => event.entityKind === "subflow");
    expect(subflowEvents.map((event) => ({
      projectId: event.projectId,
      entityId: event.entityId,
      operation: event.operation
    }))).toEqual([
      { projectId: project.id, entityId: created.subflowId, operation: "create" },
      { projectId: project.id, entityId: created.subflowId, operation: "update" },
      { projectId: project.id, entityId: created.subflowId, operation: "delete" }
    ]);
    expect(subflowEvents.every((event) => event.revision >= 1 && event.changedAt > 0 && event.transactionId.startsWith(`project-change.${event.operation}.`))).toBe(true);
  });

  it("emits project hierarchy change-feed rows for legacy hierarchy saves", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Hierarchy Feed Project" });

    await service.saveProjectHierarchy(project.id, {
      customHierarchyNodes: [{ id: "folder.root", label: "Root", kind: "folder", category: "flow", parentId: null, sourceId: "folder.root" }],
      deletedHierarchyIds: [],
      workspacePrefs: {}
    });
    await service.saveProjectHierarchy(project.id, {
      customHierarchyNodes: [{ id: "folder.root", label: "Root Renamed", kind: "folder", category: "flow", parentId: null, sourceId: "folder.root" }],
      deletedHierarchyIds: ["folder.deleted"],
      workspacePrefs: { mainLayoutPreset: "single" }
    });

    const feed = await service.listProjectChangeFeed({ projectId: project.id, afterSequence: 0, limit: 10 });
    const hierarchyEvents = feed.events.filter((event) => event.entityKind === "hierarchy");
    expect(hierarchyEvents).toHaveLength(2);
    expect(hierarchyEvents.map((event) => ({ projectId: event.projectId, entityId: event.entityId, operation: event.operation }))).toEqual([
      { projectId: project.id, entityId: project.id, operation: "update" },
      { projectId: project.id, entityId: project.id, operation: "update" }
    ]);
    expect(hierarchyEvents.every((event) => event.revision >= 1 && event.changedAt > 0 && event.transactionId.startsWith("project-change.update."))).toBe(true);
  });

  it("runs the selected canonical Flow with its compiled region plan", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Canonical runtime" });
    const blank = await service.createFlow({ projectId: project.id, flowId: "flow.canonical.runtime", name: "Canonical runtime" });
    await service.saveFlow({ projectId: project.id, flow: {
      ...blank,
      nodes: [{ id: "start", definitionId: "builtin.control.start" }, { id: "value", definitionId: "builtin.data.constant", parameterValues: { value: "canonical" } }],
      edges: [{ id: "start.value", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "value", targetPortId: "in" }],
      regions: [{ id: "deterministic", name: "Deterministic", kind: "deterministic", nodeIds: ["start", "value"], entryPorts: [], exitPorts: [] }]
    } });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: blank.flowId });
    expect(run).toMatchObject({ status: "succeeded", targetKind: "flow", flowId: blank.flowId, metadata: { canonicalFlow: true } });
    expect(run.trace?.attempts.map((attempt) => attempt.regionId)).toEqual(["deterministic", "deterministic"]);
    expect(run.trace?.values.value).toBe("canonical");
  });

  it("requires an explicit per-run grant for global-to-domain Call Flow execution", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(new IoRegistry(), "orders");
    const domainProject = await service.createProject({ name: "Orders", domainId: "orders" });
    const globalProject = await service.createProject({ name: "Global orchestrator" });
    const child = await service.createFlow({ projectId: domainProject.id, flowId: "flow.orders.child", name: "Orders child" });
    await service.saveFlow({ projectId: domainProject.id, flow: { ...child, nodes: [{ id: "start", definitionId: "builtin.control.start" }, { id: "end", definitionId: "builtin.control.end" }], edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }] } });
    const publishedChild = await service.publishFlow({ projectId: domainProject.id, flowId: child.flowId, version: "1.0.0" });
    expect((publishedChild.publication as any).snapshot.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ definitionId: "builtin.control.start", definitionVersion: "1.0.0" })]));
    const parent = await service.createFlow({ projectId: globalProject.id, flowId: "flow.global.parent", name: "Global parent" });
    await service.saveFlow({ projectId: globalProject.id, flow: { ...parent, executionDefaults: { authorizedDomainIds: ["orders"] }, nodes: [{ id: "start", definitionId: "builtin.control.start" }, createCallFlowNode({ id: "call", target: { flowId: child.flowId, version: "1.0.0", scope: { kind: "domain", domainId: "orders" } } })], edges: [{ id: "start.call", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "call", targetPortId: "in" }] } });
    expect((await service.inspectFlowDependencies(domainProject.id, child.flowId)).usedBy).toEqual([]);
    await expect(service.runRuntimeSession({ projectId: globalProject.id, flowId: parent.flowId })).resolves.toMatchObject({ status: "failed", trace: { message: expect.stringContaining("cross_scope_call_not_authorized") } });
    const granted = await service.runRuntimeSession({ projectId: globalProject.id, flowId: parent.flowId, authorizedDomainIds: ["orders"] });
    expect(granted).toMatchObject({
      status: "succeeded",
      trace: {
        attempts: expect.arrayContaining([
          expect.objectContaining({
            nodeId: "call",
            compositeTarget: {
              flowId: child.flowId,
              version: "1.0.0",
              flowDigest: (publishedChild.publication as any).flowDigest
            }
          })
        ])
      }
    });
  });

  it("converts source ownership explicitly and rejects uncompiled code-owned edits", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Source ownership" });
    const blank = await service.createFlow({ projectId: project.id, flowId: "flow.source", name: "Source" });
    const generatedSourcePath = path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "flows", "flow.source", "source", "flows", "flow.source.flow.ts");
    await expect(readFile(generatedSourcePath, "utf8")).resolves.toContain('flowId": "flow.source"');
    expect(blank.metadata).toMatchObject({ generatedSource: { moduleId: "flows/flow.source.flow.ts", relativePath: "flows/flow.source/source/flows/flow.source.flow.ts", authoritative: false } });
    await expect(service.getProjectArtifact(project.id, "config", "flow.flow.source.config")).resolves.toMatchObject({
      configId: "flow.flow.source.config",
      metadata: { generated: true, ownerKind: "flow", flowId: "flow.source" },
      values: { flowId: "flow.source", name: "Source", source: { mode: "visual" } }
    });
    const visual = await service.saveFlow({ projectId: project.id, flow: { ...blank, nodes: [{ id: "value", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } }] } });
    await expect(service.getProjectArtifact(project.id, "config", "flow.flow.source.config")).resolves.toMatchObject({
      values: { flowId: "flow.source", source: { mode: "visual" } }
    });
    const converted = await service.compileAndSaveFlowSource({ projectId: project.id, flowId: visual.flowId, moduleId: "flows/source.flow.ts", sourceText: generateFlowTypeScript(visual) });
    expect(converted.compilation.ok).toBe(true);
    expect(converted.flow?.source).toMatchObject({ mode: "code", moduleId: "flows/source.flow.ts", compilerVersion: "0.1" });
    await expect(readFile(path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "flows", "flow.source", "source", "flows", "source.flow.ts"), "utf8")).resolves.toContain('flowId": "flow.source"');
    await expect(service.getProjectArtifact(project.id, "config", "flow.flow.source.config")).resolves.toMatchObject({
      values: { flowId: "flow.source", source: { mode: "code", moduleId: "flows/source.flow.ts" } }
    });
    await expect(service.saveFlow({ projectId: project.id, flow: { ...converted.flow!, nodes: [...converted.flow!.nodes, { id: "tampered", definitionId: "builtin.control.end" }] } })).rejects.toThrow("compiler digest");
    await expect(service.saveFlow({ projectId: project.id, flow: { ...converted.flow!, source: { mode: "visual" } } })).rejects.toThrow("explicit conversion");
    await expect(service.convertFlowToVisual({ projectId: project.id, flowId: visual.flowId })).resolves.toMatchObject({ source: { mode: "visual" }, publication: { status: "draft" } });
    await expect(service.getProjectArtifact(project.id, "config", "flow.flow.source.config")).resolves.toMatchObject({
      values: { flowId: "flow.source", source: { mode: "visual" } }
    });
    await expect(service.deleteFlow({ projectId: project.id, flowId: visual.flowId })).resolves.toMatchObject({ deletedFlowId: visual.flowId });
    await expect(service.getProjectArtifact(project.id, "config", "flow.flow.source.config")).rejects.toThrow("Unknown Automation Studio config");
  });

  it("exposes and executes explicitly bound domain-native nodes only in their project scope", async () => {
    const definition = { schemaVersion: "0.1" as const, id: "orders.total", version: "1.0.0", label: "Order total", description: "Calculates total", category: "Orders", source: { kind: "importer" as const, domainId: "orders", packageId: "orders.package", implementationKey: "total" }, availability: { kind: "domain" as const, domainId: "orders" }, capabilities: { executable: true as const }, inputs: [], outputs: [{ id: "total", label: "Total", valueType: "number" as const }], parameters: [] };
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "orders.package", packageVersion: "1.0.0", domainId: "orders", nodes: [definition] };
    const native = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "orders.package", packageVersion: "1.0.0", implementations: { total: () => ({ outputs: { total: 42 } }) } });
    const service = createService({ dataDir: tempRoot, seedFixture: false }).bindNativeNodeRuntime(native);
    const domainProject = await service.createProject({ name: "Orders", domainId: "orders" }); const globalProject = await service.createProject({ name: "Global" });
    expect(await service.listNativeNodeDefinitions(domainProject.id)).toMatchObject([{ id: "orders.total" }]); expect(await service.listNativeNodeDefinitions(globalProject.id)).toEqual([]);
    const blank = await service.createFlow({ projectId: domainProject.id, flowId: "flow.orders.native", name: "Native" });
    await service.saveFlow({ projectId: domainProject.id, flow: { ...blank, nodes: [{ id: "total", definitionId: "orders.total" }] } });
    await expect(service.runRuntimeSession({ projectId: domainProject.id, flowId: blank.flowId })).resolves.toMatchObject({ status: "succeeded", trace: { values: { total: 42 } } });
  });

  it("inspects and applies non-destructive legacy Flow migration idempotently", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Migration" });
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "task",
      artifact: {
        schemaVersion: "0.1",
        taskId: "task.legacy",
        name: "Legacy task",
        recordingIds: [],
        createdAt: 100,
        updatedAt: 100
      }
    });

    const inspection = await service.inspectFlowMigration(project.id);
    expect(inspection).toMatchObject({ migrationNeeded: true, outcomes: [{ legacyKind: "task", status: "created" }] });
    const migration = await service.migrateFlows(project.id);
    expect(migration.status).toBe("completed");
    expect(migration.outcomes[0]).toMatchObject({ status: "created" });
    await expect(service.listProjectArtifacts(project.id)).resolves.toMatchObject({ tasks: [{ taskId: "task.legacy" }] });

    const backup = await service.exportLegacyProject(project.id);
    expect(backup).toMatchObject({ backupId: migration.backupId, artifacts: { tasks: [{ taskId: "task.legacy" }] } });
    await service.verifyLegacyBackup(project.id, backup.backupId);
    await service.recordLegacyRetirementEvidence({ projectId: project.id, importerCoverageAcknowledged: true, importerEvidence: [{ packageId: "example.importer", packageVersion: "1.0.0", status: "validated" }] });
    await expect(service.inspectLegacyRetirement(project.id)).resolves.toMatchObject({ canLockWrites: true, unmigrated: [] });

    const rollbackPlan = await service.planFlowMigrationRollback(project.id, migration.migrationId);
    expect(rollbackPlan.status).toBe("ready");
    await expect(service.rollbackFlowMigration(project.id, migration.migrationId)).resolves.toMatchObject({ status: "applied" });
    await expect(service.rollbackFlowMigration(project.id, migration.migrationId)).resolves.toMatchObject({ status: "applied", flowIds: [] });
    await expect(service.listProjectArtifacts(project.id)).resolves.toMatchObject({ tasks: [{ taskId: "task.legacy" }] });
    expect((await service.inspectFlowMigration(project.id)).migrationNeeded).toBe(true);
    const remigration = await service.migrateFlows(project.id);
    const remigratedFlow = await service.getFlow(project.id, remigration.outcomes[0]!.flowId);
    await service.saveFlow({ projectId: project.id, flow: { ...remigratedFlow, name: "Operator edited migrated Flow" } });
    await expect(service.planFlowMigrationRollback(project.id, remigration.migrationId)).resolves.toMatchObject({ status: "blocked", blockers: [expect.stringContaining("changed after migration")] });

    const secondInspection = await service.inspectFlowMigration(project.id);
    expect(secondInspection).toMatchObject({ migrationNeeded: false, outcomes: [{ status: "already_migrated" }] });
    const secondMigration = await service.migrateFlows(project.id);
    expect(secondMigration.outcomes[0]).toMatchObject({ status: "already_migrated" });

    const sealed = await service.sealLegacyWrites({ projectId: project.id, expectedSchemaVersion: "0.2" });
    expect(sealed).toMatchObject({ state: { phase: "write_locked", projectSchemaVersion: "0.2" }, diagnostic: { code: "legacy.write_locked" } });
    await expect(service.saveProjectArtifact({ projectId: project.id, kind: "task", artifact: { taskId: "task.blocked", name: "Blocked", recordingIds: [] } })).rejects.toMatchObject({ code: "legacy.write_locked" });
    await expect(service.saveProjectArtifact({ projectId: project.id, kind: "flow", artifact: { flowId: "task.blocked.flow", ownerKind: "task", ownerId: "task.blocked", name: "Blocked" } })).rejects.toMatchObject({ code: "legacy.write_locked" });
    await expect(service.saveProjectArtifact({ projectId: project.id, kind: "config", artifact: { configId: "config.allowed", name: "Allowed" } })).resolves.toMatchObject({ configId: "config.allowed" });
    await expect(service.getProjectArtifact(project.id, "task", "task.legacy")).resolves.toMatchObject({ taskId: "task.legacy" });
    expect((await service.listLegacyRetirementAudit(project.id)).map((event) => event.type)).toEqual(expect.arrayContaining(["backup_created", "backup_verified", "migration_applied", "rollback_applied", "writes_locked"]));
  });

  it("rejects stale Flow saves without overwriting the current revision", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Save conflicts" });
    const created = await service.createFlow({ projectId: project.id, flowId: "flow.conflict", name: "Original" });
    const saved = await service.saveFlow({ projectId: project.id, expectedUpdatedAt: created.updatedAt, flow: { ...created, name: "Current revision" } });

    await expect(service.saveFlow({ projectId: project.id, expectedUpdatedAt: saved.updatedAt + 1, flow: { ...saved, name: "Stale overwrite" } })).rejects.toThrow("FLOW_SAVE_CONFLICT");
    await expect(service.getFlow(project.id, created.flowId)).resolves.toMatchObject({ name: "Current revision" });
  });});
