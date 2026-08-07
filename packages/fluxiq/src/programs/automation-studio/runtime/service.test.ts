import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stateValue, type StateSnapshot } from "../model/index.ts";
import { AutomationStudioService } from "./service.ts";

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

  it("stores project recordings and normalized timelines in project folders", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "State Framework" });
    await expect(service.listProjectArtifacts(project.id)).resolves.toMatchObject({
      tasks: [{ taskId: "task.unnamed_task", name: "unnamed_task", metadata: { status: "empty", source: "project_default" } }],
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
    const projectArtifacts = await service.listProjectArtifacts(project.id);

    expect(review.waitClips[0]).toMatchObject({ waitMs: 800 });
    expect(proposal.patch).toMatchObject({ targetTaskId: "task.pipeline", mergeStrategy: "append_or_branch" });
    expect(artifacts.miningRuns.map((item) => item.miningRunId)).toContain(miningRun.miningRunId);
    expect(artifacts.evidenceFacts.length).toBeGreaterThan(0);
    expect(artifacts.evidenceObservations.length).toBeGreaterThan(0);
    expect(artifacts.evidenceClaims.length).toBeGreaterThan(0);
    expect(artifacts.learnedTaskModels.map((item) => item.learnedTaskModelId)).toContain(model.learnedTaskModelId);
    expect(artifacts.policyProposals[0]).toMatchObject({ proposalId: proposal.proposalId, status: "approved" });
    expect(replay.policyId).toBe(approved.policy.policyId);
    const task = projectArtifacts.tasks.find((item) => item.taskId === "task.pipeline");
    const flow = projectArtifacts.flows.find((item) => item.ownerId === "task.pipeline");
    expect(task).toMatchObject({ taskId: "task.pipeline", graphId: "task.task.pipeline.graph", policyFlowId: "task.task.pipeline.graph", graph: { flowId: "task.task.pipeline.graph", ownerKind: "task", ownerId: "task.pipeline" } });
    expect(flow).toMatchObject({ ownerKind: "task", ownerId: "task.pipeline" });
    expect(flow?.nodes.length).toBe(approved.policy.nodes.length);

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "indexes", "pipeline.json"), "utf8")).resolves.toContain(proposal.proposalId);
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.pipeline-test", "derived", "index.json"), "utf8")).resolves.toContain(proposal.proposalId);
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.pipeline-test", "derived", "evidence", "claims", `${artifacts.evidenceClaims[0]!.claimId}.json`), "utf8")).resolves.toContain("\"claimId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.pipeline-test", "derived", "proposal", "proposal.json"), "utf8")).resolves.toContain("\"proposalId\"");
    await expect(readFile(path.join(projectRoot, "policies", `${approved.policy.policyId}.json`), "utf8")).resolves.toContain("\"policyId\"");
    await expect(readFile(path.join(projectRoot, "tasks", "task.pipeline", "task.json"), "utf8")).resolves.toContain("\"graph\"");

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
    expect(projectArtifacts.tasks).toMatchObject([{ taskId: "task.unnamed_task", name: "unnamed_task" }]);
    expect(projectArtifacts.flows).toEqual([]);

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.direct-proposal", "derived", "evidence", "mining-runs", `${miningRun.miningRunId}.json`), "utf8")).resolves.toContain("\"miningRunId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.direct-proposal", "derived", "evidence", "facts", `${miningRun.evidenceFactIds![0]}.json`), "utf8")).resolves.toContain("\"factId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.direct-proposal", "derived", "evidence", "observations", `${miningRun.evidenceObservationIds![0]}.json`), "utf8")).resolves.toContain("\"observationId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.direct-proposal", "derived", "evidence", "correlations", `${miningRun.stateActionCorrelationIds![0]}.json`), "utf8")).resolves.toContain("\"correlationId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.direct-proposal", "derived", "evidence", "claims", `${miningRun.evidenceClaimIds![0]}.json`), "utf8")).resolves.toContain("\"claimId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "sessions", "recording.direct-proposal", "derived", "proposal", "proposal.json"), "utf8")).resolves.toContain("\"proposalId\"");
  });

  it("merges proposals from multiple recordings into one task-owned flow", async () => {
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

    const artifacts = await service.listProjectArtifacts(project.id);
    const task = artifacts.tasks.find((item) => item.taskId === "task.branching");
    const flow = artifacts.flows.find((item) => item.flowId === task?.graphId);

    expect(task?.recordingIds.sort()).toEqual(["recording.branch-a", "recording.branch-b"]);
    expect(flow?.nodes.map((node) => node.parameterValues?.outputId)).toEqual(expect.arrayContaining(["output.shared-start", "output.branch.a", "output.branch.b"]));
    expect(flow?.nodes.length).toBeGreaterThanOrEqual(3);
    expect(flow?.edges.some((edge) => edge.label === "Recorded branch")).toBe(true);
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
    const initialArtifacts = await service.listProjectArtifacts(project.id);
    const existingTask = initialArtifacts.tasks.find((item) => item.taskId === "task.edited-proposal");
    expect(existingTask).toBeDefined();
    await service.saveProjectArtifact({ projectId: project.id, kind: "task", artifact: { ...existingTask!, name: "Edited Proposal Task" } });

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
      targetTaskId: "task.edited-proposal",
      requireExistingTask: true,
      policyOverride: override
    });
    const artifacts = await service.listProjectArtifacts(project.id);
    const task = artifacts.tasks.find((item) => item.taskId === "task.edited-proposal");
    const flow = artifacts.flows.find((item) => item.ownerId === "task.edited-proposal");

    expect(edited.policy.nodes).toEqual([]);
    expect(edited.policy.edges).toEqual([]);
    expect(task?.name).toBe("Edited Proposal Task");
    expect(flow?.nodes).toEqual([]);
    expect(flow?.edges).toEqual([]);
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
    await expect(service.listProjectArtifacts(project.id)).resolves.toMatchObject({ tasks: [{ taskId: "task.unnamed_task", name: "unnamed_task" }], flows: [] });
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
