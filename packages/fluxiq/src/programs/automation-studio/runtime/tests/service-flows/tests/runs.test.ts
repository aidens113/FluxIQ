import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAutomationStudioFlowExpansionFixture } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { installPrimaryRouter, createRunnableCanonicalFlow, adaptiveTrainingMetadata } from "../../service-fixtures.ts";

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

  it("cancels queued runtime runs and retains canonical typed detail when the legacy detail file is missing", async () => {
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
    expect(recovered).toMatchObject({ summary: { runId: queued.runId, status: "cancelled" }, metadata: { compatibilitySource: "runtime-session", message: "Operator stopped the run." } });
  });

  it("blocks a second active adaptive runtime run in the same project", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Adaptive Runtime Concurrency" });
    const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.runtime-concurrency", metadata: adaptiveTrainingMetadata() });
    await service.startRuntimeSession({ projectId: project.id, flowId: flow.flowId, metadata: { adaptiveRuntime: true } });

    const before = await service.listRuntimeSessions(project.id);
    await expect(service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, adaptiveMode: "fully_adaptive" })).rejects.toThrow("Only one adaptive runtime run can be active per project.");
    expect(await service.listRuntimeSessions(project.id)).toHaveLength(before.length);
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

  it("returns opaque run-event cursors and rejects cross-run reuse", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Runtime event cursors" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.runtime-event-cursors", name: "Runtime event cursors" });
    const fixture = createAutomationStudioFlowExpansionFixture(2);
    await service.saveFlowRunDetail({
      ...fixture.runDetail,
      summary: { ...fixture.runSummary, projectId: project.id, flowId: flow.flowId, runId: "run.cursor", actionAttemptCount: 2 },
      actionAttempts: [
        { attemptId: "attempt.cursor.1", nodeId: "node.cursor.1", definitionId: "action.click", order: 1, status: "succeeded", route: "success", startedAt: 10, finishedAt: 11 },
        { attemptId: "attempt.cursor.2", nodeId: "node.cursor.2", definitionId: "action.type", order: 2, status: "succeeded", route: "success", startedAt: 12, finishedAt: 13 }
      ]
    });

    const first = await service.listFlowRunEvents({ projectId: project.id, runId: "run.cursor", limit: 1 });
    expect(first).toMatchObject({ events: [{ sequence: 1 }], hasMore: true, lastSequence: 1 });
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first.nextCursor).not.toBe("1");
    const second = await service.listFlowRunEvents({ projectId: project.id, runId: "run.cursor", cursor: first.nextCursor, limit: 1 });
    expect(second.events[0]?.sequence).toBe(2);
    await expect(service.listFlowRunEvents({ projectId: project.id, runId: "run.other", cursor: first.nextCursor, limit: 1 })).rejects.toThrow(/does not match/);
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

  it("routes canonical Flow runtime sessions through the selected subflow and records run detail", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Routed Runtime" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.routed-runtime", name: "Routed Flow" });
    const { subflow, graph } = await installPrimaryRouter(service, project.id, flow.flowId, {
        nodes: [
          { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }]
    });
    const now = 50_000;
    const installedRouter = await service.getFlowRouter(project.id, flow.flowId);
    if (!installedRouter) throw new Error("Primary Router was not created.");
    await service.saveFlowRouter({
      ...installedRouter,
      schemaVersion: "0.1",
      routerId: installedRouter.routerId,
      flowId: flow.flowId,
      projectId: project.id,
      name: "Routed Flow Router",
      rules: [{
        schemaVersion: "0.1",
        ruleId: "rule.primary",
        routerId: installedRouter.routerId,
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
    expect(detail?.subflows).toEqual([expect.objectContaining({ subflowId: subflow.subflowId, status: "succeeded", metadata: expect.objectContaining({ graphFlowId: graph.flowId, routeDecisionId }) })]);
    expect(detail?.summary).toMatchObject({ routeDecisionCount: 1, subflowEntryCount: 1, actionAttemptCount: 2 });
    const summaries = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 });
    expect(summaries.runs.find((summary) => summary.runId === run.runId)).toMatchObject({ routeDecisionCount: 1, subflowEntryCount: 1, actionAttemptCount: 2 });
  });
});
