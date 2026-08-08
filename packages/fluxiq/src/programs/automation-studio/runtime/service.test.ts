import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCallFlowNode, stateValue, type StateSnapshot } from "../model/index.ts";
import { createCanonicalAutomationStudioSQLiteRepositories } from "../storage/index.ts";
import { generateFlowTypeScript } from "../dsl/index.ts";
import { AutomationStudioService } from "./service.ts";
import { AutomationStudioNativeNodeRuntime } from "./native-node-runtime.ts";
import type { AutomationStudioImporterSdkManifest } from "../nodes/index.ts";
import { IoRegistry, createEnvelope } from "../../../io/index.ts";

const tempRoot = path.join(process.cwd(), ".tmp", "automation-studio-service-test");

describe("AutomationStudioService recording persistence", () => {
  beforeEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("does not seed demo fixture recordings by default", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot });

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

  it("turns mapped observations into reviewed Flow actions without making action inputs policy state", async () => {
    const io = new IoRegistry();
    let dispatches = 0;
    io.registerInput("example", { definition: { id: "clicked", title: "Clicked", role: "action", outputId: "click" }, mode: "stream", subscribe: (handler) => { queueMicrotask(() => handler(createEnvelope({ domainId: "example", ioId: "clicked", payload: { ok: true } }))); return () => undefined; } });
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => { dispatches += 1; return { ok: true, domainId: "example", outputId: request.outputId, payload: { done: true } }; } });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": (observation) => observation.type === "observation" ? { outputId: "click", parameters: { target: "submit" }, sourceInputIds: ["clicked"], expectedConfirmation: { inputId: "clicked", timeoutMs: 100 }, confidence: 0.9 } : null } });
    const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Mapped recording", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.mapped", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } } });
    const [proposal] = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    expect(proposal?.candidates[0]).toMatchObject({ outputId: "click", sourceInputIds: ["clicked"], policyStateEligible: false, expectedConfirmation: { inputId: "clicked" } });
    expect(proposal?.review).toBeUndefined();
    const reviewed = await service.reviewRecordingFlowProposal({ projectId: project.id, proposalId: proposal!.proposalId, decision: "approved", destination: { kind: "flow", name: "Approved clicks" } });
    expect(reviewed.flow?.nodes[0]).toMatchObject({ definitionId: "builtin.policy.action", parameterValues: { outputId: "click", confirmationInputId: "clicked" }, metadata: { rawEvidenceImmutable: true } });
    const savedEdit = await service.saveFlow({ projectId: project.id, flow: { ...reviewed.flow!, nodes: reviewed.flow!.nodes.map((node) => ({ ...node, label: "Edited click", metadata: { ...(node.metadata ?? {}), sourceObservationIds: ["forged"] } })) } });
    expect(savedEdit.nodes[0]).toMatchObject({ label: "Edited click", metadata: { sourceObservationIds: proposal!.candidates[0]!.sourceObservationIds, manualProvenance: [{ changedFields: ["label"] }] } });
    const session = await service.runRuntimeSession({ projectId: project.id, flowId: reviewed.flow!.flowId });
    expect(session.status).toBe("succeeded");
    expect(dispatches).toBe(1);

    const withoutConfirmation = new IoRegistry();
    withoutConfirmation.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    service.bindIoRuntime(withoutConfirmation, "example");
    const confirmationInvalidated = (await service.listPipelineArtifacts(project.id)).recordingFlowProposals.find((item) => item.proposalId === proposal!.proposalId);
    expect(confirmationInvalidated?.status).toBe("invalidated");
    expect(confirmationInvalidated?.invalidation?.reasons).toEqual(expect.arrayContaining([expect.stringContaining("Confirmation input clicked")]));

    const changedManifest = { ...manifest, packageVersion: "2.0.0", recordingMappers: [{ ...manifest.recordingMappers![0]!, version: "2.0.0" }] };
    const changedRuntime = new AutomationStudioNativeNodeRuntime().register(changedManifest, { packageId: "example.importer", packageVersion: "2.0.0", implementations: {}, recordingMappers: { "click-mapper": () => null } });
    service.bindNativeNodeRuntime(changedRuntime);
    const invalidated = (await service.listPipelineArtifacts(project.id)).recordingFlowProposals.find((item) => item.proposalId === proposal!.proposalId);
    expect(invalidated).toMatchObject({ status: "invalidated", invalidation: { affectedFlowIds: [reviewed.flow!.flowId] } });
  });

  it("stores project recordings and normalized timelines in project folders", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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

    const reloaded = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const recordings = await reloaded.listRecordingSessions(project.id);

    expect(recordings.map((item) => item.recordingId)).toContain("recording.service-test");
    expect(normalized.recordingId).toBe("recording.service-test");

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.service-test", "recording.json"), "utf8")).resolves.toContain("\"recordingId\": \"recording.service-test\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.service-test", "derived", "index.json"), "utf8")).resolves.toContain("\"recordingId\": \"recording.service-test\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.service-test", "derived", "normalization", "timelines", `${normalized.normalizedTimelineId}.json`), "utf8")).resolves.toContain("\"normalizedTimelineId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "indexes", "recordings.json"), "utf8")).resolves.toContain("\"normalizedTimelineId\"");
  });

  it("persists rapid recording event bursts without colliding JSON temp files", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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

  it("stores project artifacts and runtime sessions in project folders", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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
    const reloaded = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const artifacts = await reloaded.listProjectArtifacts(project.id);
    const runs = await reloaded.listRuntimeSessions(project.id);

    expect(artifacts.flows).toHaveLength(1);
    expect(run.status).toBe("succeeded");
    expect(runs[0]).toMatchObject({ runId: run.runId, status: "succeeded" });

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "flows", flow.flowId, "flow.json"), "utf8")).resolves.toContain("\"flowId\"");
    await expect(readFile(path.join(projectRoot, "runtime", "indexes", "sessions.json"), "utf8")).resolves.toContain(run.runId);
  });

  it("deletes saved project artifacts and owned flow files from project folders", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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
      entry: { type: "domain_event", eventType: "step.started", timestamp: 300, payload: { step: 1 } }
    });
    await service.appendRecordingMarkerEntry({ projectId: project.id, recordingId: recording.recordingId, label: "Goal", monotonicOffsetMs: 1000 });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "domain_event", eventType: "step.completed", timestamp: 1300, payload: { step: 1 } }
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
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.pipeline-test", "derived", "index.json"), "utf8")).resolves.toContain(proposal.proposalId);
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.pipeline-test", "derived", "evidence", "claims", `${artifacts.evidenceClaims[0]!.claimId}.json`), "utf8")).resolves.toContain("\"claimId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.pipeline-test", "derived", "proposal", "proposal.json"), "utf8")).resolves.toContain("\"proposalId\"");
    await expect(readFile(path.join(projectRoot, "policies", `${approved.policy.policyId}.json`), "utf8")).resolves.toContain("\"policyId\"");
    await expect(readFile(path.join(projectRoot, "tasks", "task.pipeline", "task.json"), "utf8")).rejects.toThrow();

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.pipeline-test", "derived", "index.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.pipeline-test", "derived", "proposal", "proposal.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.pipeline-test", "derived", "evidence", "claims", `${artifacts.evidenceClaims[0]!.claimId}.json`), "utf8")).rejects.toThrow();
    expect((await service.listPipelineArtifacts(project.id)).policyProposals).toEqual([]);
  });

  it("proposes a task directly from recording-owned mined evidence", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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

    const proposal = await service.proposePolicyFromModel({ projectId: project.id, recordingId: recording.recordingId });
    const projectArtifacts = await service.listProjectArtifacts(project.id);

    expect(proposal.metadata).toMatchObject({ source: "mined_evidence", recordingId: recording.recordingId, miningRunId: miningRun.miningRunId });
    expect(proposal.policy.sourceEvidence[0]).toMatchObject({ layer: "signal_mining", artifactId: miningRun.miningRunId });
    expect(proposal.policy.nodes).toEqual([]);
    expect(miningRun.correlations?.[0]).toMatchObject({ statePath: "task.status", elementKind: "status", descriptor: { label: "Task status" } });
    expect(projectArtifacts.tasks).toEqual([]);
    expect(projectArtifacts.flows).toEqual([]);

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.direct-proposal", "derived", "evidence", "mining-runs", `${miningRun.miningRunId}.json`), "utf8")).resolves.toContain("\"miningRunId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.direct-proposal", "derived", "evidence", "facts", `${miningRun.evidenceFactIds![0]}.json`), "utf8")).resolves.toContain("\"factId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.direct-proposal", "derived", "evidence", "observations", `${miningRun.evidenceObservationIds![0]}.json`), "utf8")).resolves.toContain("\"observationId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.direct-proposal", "derived", "evidence", "correlations", `${miningRun.stateActionCorrelationIds![0]}.json`), "utf8")).resolves.toContain("\"correlationId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.direct-proposal", "derived", "evidence", "claims", `${miningRun.evidenceClaimIds![0]}.json`), "utf8")).resolves.toContain("\"claimId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.direct-proposal", "derived", "proposal", "proposal.json"), "utf8")).resolves.toContain("\"proposalId\"");
  });

  it("merges proposals from multiple recordings into one canonical Flow", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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

    expect(processed.status).toBe("processed");
    expect(processed.normalizedTimeline?.recordingId).toBe(recording.recordingId);
    expect(processed.miningRun?.metadata).toMatchObject({ recordingId: recording.recordingId });
    expect(processed.proposal?.metadata).toMatchObject({ recordingId: recording.recordingId, miningRunId: processed.miningRun?.miningRunId });
    await expect(service.listProjectArtifacts(project.id)).resolves.toMatchObject({ tasks: [], flows: [] });
    expect(skipped.status).toBe("skipped");
    expect(skipped.proposal?.proposalId).toBe(processed.proposal?.proposalId);
  });

  it("keeps finalized recording proposals stable and persisted", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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
    const second = await service.proposePolicyFromModel({ projectId: project.id, recordingId: recording.recordingId });
    const artifacts = await service.listPipelineArtifacts(project.id);
    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    const sessionFiles = await readdir(path.join(projectRoot, "recordings", "sessions", recording.recordingId, "derived", "proposal"));

    expect(second.proposalId).toBe(first.proposal?.proposalId);
    expect(artifacts.policyProposals.filter((proposal) => proposal.metadata?.recordingId === recording.recordingId)).toHaveLength(1);
    expect(sessionFiles.filter((file) => file.endsWith(".json"))).toEqual(["proposal.json"]);
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", recording.recordingId, "derived", "proposal", "proposal.json"), "utf8")).resolves.toContain("\"proposalId\"");

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });
    expect((await service.listPipelineArtifacts(project.id)).policyProposals.filter((proposal) => proposal.metadata?.recordingId === recording.recordingId)).toEqual([]);
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", recording.recordingId, "derived", "proposal", "proposal.json"), "utf8")).rejects.toThrow();
  });

  it("accepts only registered domain recording events and records derived state", async () => {
    const service = new AutomationStudioService({ seedFixture: false });
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
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("persists new canonical Flows in the shared SQLite repository with project scope enforcement", async () => {
    const databaseRoot = path.join(tempRoot, "databases");
    const service = new AutomationStudioService({
      dataDir: tempRoot,
      repositories: createCanonicalAutomationStudioSQLiteRepositories(databaseRoot),
      seedFixture: false
    });
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

    const reloaded = new AutomationStudioService({
      dataDir: tempRoot,
      repositories: createCanonicalAutomationStudioSQLiteRepositories(databaseRoot),
      seedFixture: false
    });
    const entries = await reloaded.listFlows(domainProject.id);
    expect(entries.find((entry) => entry.source === "canonical")?.flow).toMatchObject({ flowId: flow.flowId, projectId: domainProject.id });
    await expect(reloaded.deprecateFlowPublication({ projectId: domainProject.id, flowId: flow.flowId, version: "1.0.0", reason: "Use 2.0.0" })).resolves.toMatchObject({ status: "deprecated", deprecationReason: "Use 2.0.0" });
    await expect(reloaded.listPublishedFlowNodes(domainProject.id)).resolves.toEqual([]);
    await expect(reloaded.getFlow(globalProject.id, flow.flowId)).rejects.toThrow("Unknown Automation Studio Flow");
  });

  it("runs the selected canonical Flow with its compiled region plan", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, repositories: createCanonicalAutomationStudioSQLiteRepositories(path.join(tempRoot, "databases")), seedFixture: false });
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
    const service = new AutomationStudioService({ dataDir: tempRoot, repositories: createCanonicalAutomationStudioSQLiteRepositories(path.join(tempRoot, "databases")), seedFixture: false }).bindIoRuntime(new IoRegistry(), "orders");
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
    const service = new AutomationStudioService({ dataDir: tempRoot, repositories: createCanonicalAutomationStudioSQLiteRepositories(path.join(tempRoot, "databases")), seedFixture: false });
    const project = await service.createProject({ name: "Source ownership" });
    const blank = await service.createFlow({ projectId: project.id, flowId: "flow.source", name: "Source" });
    const visual = await service.saveFlow({ projectId: project.id, flow: { ...blank, nodes: [{ id: "value", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } }] } });
    const converted = await service.compileAndSaveFlowSource({ projectId: project.id, flowId: visual.flowId, moduleId: "flows/source.flow.ts", sourceText: generateFlowTypeScript(visual) });
    expect(converted.compilation.ok).toBe(true);
    expect(converted.flow?.source).toMatchObject({ mode: "code", moduleId: "flows/source.flow.ts", compilerVersion: "0.1" });
    await expect(service.saveFlow({ projectId: project.id, flow: { ...converted.flow!, nodes: [...converted.flow!.nodes, { id: "tampered", definitionId: "builtin.control.end" }] } })).rejects.toThrow("compiler digest");
    await expect(service.saveFlow({ projectId: project.id, flow: { ...converted.flow!, source: { mode: "visual" } } })).rejects.toThrow("explicit conversion");
    await expect(service.convertFlowToVisual({ projectId: project.id, flowId: visual.flowId })).resolves.toMatchObject({ source: { mode: "visual" }, publication: { status: "draft" } });
  });

  it("exposes and executes explicitly bound domain-native nodes only in their project scope", async () => {
    const definition = { schemaVersion: "0.1" as const, id: "orders.total", version: "1.0.0", label: "Order total", description: "Calculates total", category: "Orders", source: { kind: "importer" as const, domainId: "orders", packageId: "orders.package", implementationKey: "total" }, availability: { kind: "domain" as const, domainId: "orders" }, capabilities: { executable: true as const }, inputs: [], outputs: [{ id: "total", label: "Total", valueType: "number" as const }], parameters: [] };
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "orders.package", packageVersion: "1.0.0", domainId: "orders", nodes: [definition] };
    const native = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "orders.package", packageVersion: "1.0.0", implementations: { total: () => ({ outputs: { total: 42 } }) } });
    const service = new AutomationStudioService({ dataDir: tempRoot, repositories: createCanonicalAutomationStudioSQLiteRepositories(path.join(tempRoot, "databases")), seedFixture: false }).bindNativeNodeRuntime(native);
    const domainProject = await service.createProject({ name: "Orders", domainId: "orders" }); const globalProject = await service.createProject({ name: "Global" });
    expect(await service.listNativeNodeDefinitions(domainProject.id)).toMatchObject([{ id: "orders.total" }]); expect(await service.listNativeNodeDefinitions(globalProject.id)).toEqual([]);
    const blank = await service.createFlow({ projectId: domainProject.id, flowId: "flow.orders.native", name: "Native" });
    await service.saveFlow({ projectId: domainProject.id, flow: { ...blank, nodes: [{ id: "total", definitionId: "orders.total" }] } });
    await expect(service.runRuntimeSession({ projectId: domainProject.id, flowId: blank.flowId })).resolves.toMatchObject({ status: "succeeded", trace: { values: { total: 42 } } });
  });

  it("inspects and applies non-destructive legacy Flow migration idempotently", async () => {
    const databaseRoot = path.join(tempRoot, "databases");
    const service = new AutomationStudioService({
      dataDir: tempRoot,
      repositories: createCanonicalAutomationStudioSQLiteRepositories(databaseRoot),
      seedFixture: false
    });
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
});
