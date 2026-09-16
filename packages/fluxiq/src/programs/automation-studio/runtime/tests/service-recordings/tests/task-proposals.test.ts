import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stateValue } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";
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
    const graph = await getPrimarySubflowGraph(service, project.id, flow.flowId);

    expect((flow.metadata?.sourceRecordingIds as string[]).sort()).toEqual(["recording.branch-a", "recording.branch-b"]);
    expect(flow.nodes).toEqual([]);
    expect(graph.nodes.map((node) => node.parameterValues?.outputId)).toEqual(expect.arrayContaining(["output.shared-start", "output.branch.a", "output.branch.b"]));
    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
    expect(graph.edges.some((edge) => edge.label === "Recorded branch")).toBe(true);
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
});
