import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { type AutomationStudioImporterSdkManifest } from "../../../../nodes/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";

let tempRoot: string;

const services = new Set<AutomationStudioService>();

function createService(...args: ConstructorParameters<typeof AutomationStudioService>): AutomationStudioService {
  const service = new AutomationStudioService(...args);
  services.add(service);
  return service;
}

describe("AutomationStudioService recording persistence", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-studio-service-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

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
      trainingMode: "normal",
      proposalMode: "manual",
      proposalApprovalMode: "manual",
      llmProvider: "host",
      adaptationPolicyId: "policy.default",
      budgetExhaustedBehavior: "ask",
      adaptationPolicySettings: {
        preset: "locked",
        proposalMode: "manual",
        allowRuntimeRecovery: true,
        allowCreateRecoveryPaths: false,
        allowModifySubflows: false,
        allowCreateSubflows: false,
        allowModifyRouter: false,
        allowModifyExpectations: false,
        allowModifyActionTargets: false,
        allowDeleteOrDisableBehavior: false,
        allowExternalSideEffects: false,
        requireApprovalForDestructiveChanges: true,
        requireApprovalForExternalSideEffects: true,
        maxInterventionsPerRun: 3,
        maxEstimatedCostUsdPerRun: 1
      },
      trainingModeSettings: {
        mode: "normal",
        trainForRunCount: 3,
        minimumStabilityScore: 0.9,
        allowLlmIntervention: false,
        allowRuntimeRecovery: true,
        allowAdaptationCreation: false,
        proposalApprovalMode: "manual",
        allowPromotion: false,
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
    const first = await service.createFlow({ projectId: project.id, flowId: "flow.metadata.1", name: "First metadata Flow" });
    await service.createFlow({ projectId: project.id, flowId: "flow.metadata.2", name: "Second metadata Flow" });
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...first,
        metadata: {
          ...first.metadata,
          llmProvider: "deepseek",
          llmModel: "deepseek-chat",
          llmSecretKeyId: "key.deepseek",
          llmExecutionSettings: { tokenLimits: { maxInputTokens: 2000, maxOutputTokens: 512, maxTotalTokens: 3000 }, maxCalls: 1, timeoutMs: 15000, maxEstimatedCostUsd: 0.1, retryCount: 0 },
          adaptationPolicyId: "policy.metadata"
        }
      }
    });

    const page = await service.listFlowMetadataPage({ projectId: project.id, limit: 10 });
    const detail = await service.getFlowMetadataDetail(project.id, first.flowId);

    expect(page.items.map((item) => item.flowId)).toEqual(expect.arrayContaining(["flow.metadata.1", "flow.metadata.2"]));
    expect(page.items[0]).not.toHaveProperty("nodes");
    expect(page.items[0]).not.toHaveProperty("edges");
    expect(detail).toMatchObject({
      name: "First metadata Flow",
      settings: {
        adaptation: { policyId: "policy.metadata" },
        llm: { provider: "deepseek", model: "deepseek-chat", secretKeyId: "key.deepseek", execution: { tokenLimits: { maxInputTokens: 2000, maxOutputTokens: 512, maxTotalTokens: 3000 }, maxCalls: 1, timeoutMs: 15000, maxEstimatedCostUsd: 0.1, retryCount: 0 } }
      }
    });
  });

  it("reports the canonical Flow timestamp when the SQL settings projection is stale", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Stale Flow metadata projection" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.metadata.stale", name: "Stale metadata Flow" });
    const canonicalUpdatedAt = flow.updatedAt + 100;
    await (service as any).repositories.flows.put({ ...flow, updatedAt: canonicalUpdatedAt });

    const detail = await service.getFlowMetadataDetail(project.id, flow.flowId);

    expect(detail?.updatedAt).toBe(canonicalUpdatedAt);
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
});
