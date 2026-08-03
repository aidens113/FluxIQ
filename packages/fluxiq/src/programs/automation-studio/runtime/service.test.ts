import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stateValue, type StateSnapshot } from "../model";
import { AutomationStudioService } from "./service";

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
    await expect(readFile(path.join(projectRoot, "pipeline", "sessions", "recording.service-test", "pipeline.json"), "utf8")).resolves.toContain("\"recordingId\": \"recording.service-test\"");
    await expect(readFile(path.join(projectRoot, "pipeline", "sessions", "recording.service-test", "artifacts", "normalized-timelines", `${normalized.normalizedTimelineId}.json`), "utf8")).resolves.toContain("\"normalizedTimelineId\"");
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
    await expect(readFile(path.join(projectRoot, "flows", `${flow.flowId}.json`), "utf8")).resolves.toContain("\"flowId\"");
    await expect(readFile(path.join(projectRoot, "runtime", "indexes", "sessions.json"), "utf8")).resolves.toContain(run.runId);
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
    await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const review = await service.createNormalizationReview({ projectId: project.id, recordingId: recording.recordingId });
    const miningRun = await service.mineRecordingEvidence({ projectId: project.id, recordingId: recording.recordingId });
    const model = await service.learnTaskModel({ projectId: project.id, taskId: "task.pipeline", miningRunId: miningRun.miningRunId });
    const proposal = await service.proposePolicyFromModel({ projectId: project.id, learnedTaskModelId: model.learnedTaskModelId });
    const approved = await service.approvePolicyProposal({ projectId: project.id, proposalId: proposal.proposalId });
    const replay = await service.replayPolicyAgainstRecording({ projectId: project.id, recordingId: recording.recordingId, policyId: approved.policy.policyId });
    const artifacts = await service.listPipelineArtifacts(project.id);

    expect(review.waitClips[0]).toMatchObject({ waitMs: 800 });
    expect(artifacts.miningRuns.map((item) => item.miningRunId)).toContain(miningRun.miningRunId);
    expect(artifacts.learnedTaskModels.map((item) => item.learnedTaskModelId)).toContain(model.learnedTaskModelId);
    expect(artifacts.policyProposals[0]).toMatchObject({ proposalId: proposal.proposalId, status: "approved" });
    expect(replay.policyId).toBe(approved.policy.policyId);

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "pipeline", "indexes", "pipeline.json"), "utf8")).resolves.toContain(proposal.proposalId);
    await expect(readFile(path.join(projectRoot, "pipeline", "sessions", "recording.pipeline-test", "pipeline.json"), "utf8")).resolves.toContain(proposal.proposalId);
    await expect(readFile(path.join(projectRoot, "pipeline", "sessions", "recording.pipeline-test", "artifacts", "policy-proposals", `${proposal.proposalId}.json`), "utf8")).resolves.toContain("\"proposalId\"");
    await expect(readFile(path.join(projectRoot, "policies", `${approved.policy.policyId}.json`), "utf8")).resolves.toContain("\"policyId\"");

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });
    await expect(readFile(path.join(projectRoot, "pipeline", "sessions", "recording.pipeline-test", "pipeline.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(projectRoot, "pipeline", "policy-proposals", `${proposal.proposalId}.json`), "utf8")).rejects.toThrow();
    expect((await service.listPipelineArtifacts(project.id)).policyProposals).toEqual([]);
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
