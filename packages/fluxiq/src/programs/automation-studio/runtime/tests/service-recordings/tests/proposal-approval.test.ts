import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { type AutomationStudioImporterSdkManifest } from "../../../../nodes/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { getPrimarySubflowGraph } from "../../service-fixtures.ts";

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

    expect(reviewed.flow?.nodes).toEqual([]);
    expect((await getPrimarySubflowGraph(service, project.id, reviewed.flow!.flowId)).nodes[0]).toMatchObject({ label: "Edited click proposal", definitionId: "builtin.policy.action", parameterValues: { outputId: "click" } });

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
    expect(reapplied.flow?.nodes).toEqual([]);
    expect((await getPrimarySubflowGraph(service, project.id, reapplied.flow!.flowId)).nodes[0]).toMatchObject({ label: "Reapplied click proposal", definitionId: "builtin.policy.action" });
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
    expect(result.issues.join(" ")).toContain("saw 1 entries (observation: 1), matched 0, emitted 0 raw candidates");
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
    const approvedGraph = await getPrimarySubflowGraph(service, project.id, approvedFlow.flowId);

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
    expect(approvedFlow.nodes).toEqual([]);
    expect(approvedGraph.nodes.length).toBe(approved.policy.nodes.length);

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
});
