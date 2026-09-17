import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowRunActionAttemptRecord, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { adaptiveTrainingMetadata, createFailingCanonicalFlow } from "../../../tests/service-fixtures.ts";
import { runtimeSessionToFlowRunDetail } from "../index.ts";

// A repaired run's detail carries what the recovery annotation added on top of
// the bare session projection: the provider audit (`llmGate`), the adaptation
// context, the training mode, the patch attempts, the model's interventions and
// the token usage they add up to. Live, all of it vanished from two runs after
// an apply, two replays and two restarts, because a run listing that matched no
// typed run re-saved every run in the project from its raw session. These tests
// hold the whole sequence, and the unreadable-index path, to "nothing is lost".

let tempRoot: string;
const services = new Set<AutomationStudioService>();
const target = { handles: { control: "submit-order" } };

function createService(...args: ConstructorParameters<typeof AutomationStudioService>): AutomationStudioService {
  const service = new AutomationStudioService(...args);
  services.add(service);
  return service;
}

async function restart(service: AutomationStudioService): Promise<AutomationStudioService> {
  await service.close();
  services.delete(service);
  return createService({ dataDir: tempRoot, seedFixture: false });
}

function projectRoot(projectId: string): string {
  return path.join(tempRoot, "programs", "automation-studio", "projects", projectId);
}

// What the recovery annotation added to the repaired run, read right after the
// repair. Its exact content belongs to the recovery code; what these tests hold
// is that every later read returns the same values.
type Annotation = {
  metadata: JsonObject;
  tokenUsage: AutomationStudioFlowRunDetail["summary"]["tokenUsage"];
  interventionCount: number;
  interventionIds: string[];
  adaptationIds: string[];
  changeProposalIds: string[];
};

const ANNOTATION_METADATA_KEYS = ["llmGate", "recoveryTrace", "runtimeAdaptationContext", "trainingMode", "trainingBehavior", "runtimePatchAttempts"] as const;

function annotationOf(detail: AutomationStudioFlowRunDetail | null): Annotation {
  expect(detail).not.toBeNull();
  const metadata = detail!.metadata ?? {};
  return {
    metadata: Object.fromEntries(ANNOTATION_METADATA_KEYS.flatMap((key) => metadata[key] === undefined ? [] : [[key, metadata[key]]])),
    tokenUsage: detail!.summary.tokenUsage,
    interventionCount: detail!.summary.interventionCount,
    interventionIds: detail!.interventions.map((intervention) => intervention.interventionId).sort(),
    adaptationIds: detail!.adaptationIds,
    changeProposalIds: detail!.changeProposalIds
  };
}

function expectAnnotated(detail: AutomationStudioFlowRunDetail | null, expected: Annotation): void {
  expect(annotationOf(detail)).toEqual(expected);
}

async function repairedRun(): Promise<{ service: AutomationStudioService; projectId: string; flowId: string; runId: string; annotation: Annotation }> {
  const providerCalls: string[] = [];
  const service = createService({
    dataDir: tempRoot,
    seedFixture: false,
    llmProviderResolver: () => ({
      provider: {
        metadata: { provider: "mock", model: "repair-model" },
        runTask: async (request) => {
          providerCalls.push(request.taskKind);
          return request.taskKind === "runtime_patch"
            ? {
              response: {
                kind: "runtime_patch",
                summary: "Propose the current action target.",
                riskLevel: "high",
                patches: [{ kind: "temporary_target_override", targetNodeId: "divide", target, reason: "The recorded target changed." }]
              },
              usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.004 }
            }
            : {
              response: { kind: "diagnosis", summary: "The action target no longer resolves." },
              usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.001 }
            };
        }
      },
      tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 },
      maxCallsPerRun: 2,
      maxEstimatedCostUsd: 0.1,
      maxTotalEstimatedCostUsd: 0.15
    })
  });
  const project = await service.createProject({ name: "Annotated run preservation" });
  const adaptive = adaptiveTrainingMetadata();
  const policy = adaptive.adaptationPolicySettings as JsonObject;
  const flow = await createFailingCanonicalFlow(service, project.id, {
    flowId: "flow.annotated-repair",
    metadata: { ...adaptive, adaptationPolicySettings: { ...policy, allowModifyActionTargets: false } }
  });
  const grant = { grantId: "llm-grant:annotated-repair", actorUserId: "user.test", actorSessionId: "session.test", purpose: "diagnose_and_adapt" as const };
  const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 }, llmExecution: grant });
  const annotation = annotationOf(await service.getFlowRunDetail(project.id, run.runId));
  expect(providerCalls).toEqual(["runtime_diagnosis", "runtime_patch"]);
  // The provider audit and the usage are what went missing live.
  expect(annotation.metadata.llmGate).toMatchObject({ invoked: true, costAccounting: { calls: 2, totalTokens: 42 }, providerCalls: [expect.any(Object), expect.any(Object)] });
  expect(annotation.metadata).toMatchObject({ trainingMode: "continuous_adaptive", runtimeAdaptationContext: expect.any(Object), recoveryTrace: expect.any(Object) });
  expect(annotation.tokenUsage).toMatchObject({ totalTokens: 42, estimatedCostUsd: 0.005 });
  expect(annotation.interventionIds.length).toBeGreaterThanOrEqual(2);
  return { service, projectId: project.id, flowId: flow.flowId, runId: run.runId, annotation };
}

// An edit_action_target adaptation of the repaired run's failing node, the kind
// the live campaign approved and applied.
async function approveAndApplyTargetEdit(service: AutomationStudioService, projectId: string, flowId: string, sourceRunId: string): Promise<void> {
  const subflowId = (await service.listFlowSubflowSummaries({ projectId, flowId })).subflows[0]!.subflowId;
  const adaptationId = "adaptation.annotated-repair.target";
  await service.saveFlowAdaptation({
    schemaVersion: "0.1",
    adaptationId,
    flowId,
    projectId,
    subflowId,
    sourceRunId,
    trigger: "Runtime drift",
    patch: [{ kind: "edit_action_target", targetId: "divide", summary: "Use the current target.", after: target }],
    status: "proposed",
    author: "llm",
    riskLevel: "low",
    createdAt: 10,
    updatedAt: 10
  });
  await service.reviewFlowAdaptation({ projectId, flowId, adaptationId, action: "approve", actorId: "reviewer" });
  await expect(service.reviewFlowAdaptation({ projectId, flowId, adaptationId, action: "apply", actorId: "reviewer" })).resolves.toMatchObject({ status: "applied" });
}

describe("run detail preservation", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-run-detail-preservation-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("keeps a repaired run's recovery annotation through apply, replay, restarts and every session-derived re-save", async () => {
    const repaired = await repairedRun();
    let service = repaired.service;
    const { projectId, flowId, runId, annotation } = repaired;

    await approveAndApplyTargetEdit(service, projectId, flowId, runId);
    // The replays run on a restarted Core that has no provider configured at all,
    // so they are zero-LLM by construction, as the live validation and replay runs
    // were. The fixture's divide node fails on every run; whatever recovery a
    // failing replay would earn is not what this test is about, and it relies on
    // no suppression of the model to keep the replays free of provider calls.
    service = await restart(service);
    const replays = [
      await service.runRuntimeSession({ projectId, flowId, inputs: { numerator: 4, denominator: 2 } }),
      await service.runRuntimeSession({ projectId, flowId, inputs: { numerator: 9, denominator: 3 } })
    ];
    expect(replays.map((replay) => ["succeeded", "failed"].includes(replay.status))).toEqual([true, true]);
    expectAnnotated(await service.getFlowRunDetail(projectId, runId), annotation);

    service = await restart(service);
    // The Lab lists a prepared Flow's runs before that Flow has any; no typed
    // run matches, which used to re-save every run from its raw session.
    const notYetRun = await service.createFlow({ projectId, flowId: "flow.not-yet-run", name: "Not yet run" });
    await expect(service.listFlowRunSummaries({ projectId, flowId: notYetRun.flowId, limit: 25, offset: 0 })).resolves.toMatchObject({ runs: [], total: 0 });
    await expect(service.listFlowRunSummaries({ projectId, status: "cancelled" })).resolves.toMatchObject({ runs: [], total: 0 });
    expectAnnotated(await service.getFlowRunDetail(projectId, runId), annotation);
    // A page past the end of a run with no actions reaches the summary index rebuild directly.
    const queued = await service.startRuntimeSession({ projectId, flowId });
    await expect(service.listFlowRunActions({ projectId, runId: queued.runId, limit: 10, offset: 5 })).resolves.toMatchObject({ actions: [] });
    expectAnnotated(await service.getFlowRunDetail(projectId, runId), annotation);
    // Any caller that re-saves the bare session projection must not strip the annotation either.
    const session = await service.getRuntimeSession(projectId, runId);
    expectAnnotated(await service.saveFlowRunDetail(runtimeSessionToFlowRunDetail(session!, projectId)), annotation);

    service = await restart(service);
    expectAnnotated(await service.getFlowRunDetail(projectId, runId), annotation);
    // The compact read the web uses takes the same envelope and summary.
    const compact = await service.getFlowRunDetail(projectId, runId, { includeCollections: false });
    expect(compact?.metadata?.llmGate).toEqual(annotation.metadata.llmGate);
    expect(compact?.summary).toMatchObject({ tokenUsage: annotation.tokenUsage, interventionCount: annotation.interventionCount });
    expect(compact?.adaptationIds).toEqual(annotation.adaptationIds);
    const listed = await service.listFlowRunSummaries({ projectId, flowId, limit: 25, offset: 0 });
    expect(listed.runs.find((run) => run.runId === runId)).toMatchObject({ tokenUsage: annotation.tokenUsage, interventionCount: annotation.interventionCount });
  });

  it("refuses to rebuild run details when the run index is present but unreadable", async () => {
    const { service, projectId, flowId, runId, annotation } = await repairedRun();
    const queued = await service.startRuntimeSession({ projectId, flowId });
    const indexFile = path.join(projectRoot(projectId), "indexes", "runs.json");
    await mkdir(path.dirname(indexFile), { recursive: true });
    await writeFile(indexFile, "{ this is not json", "utf8");

    await expect(service.listFlowRunActions({ projectId, runId: queued.runId, limit: 10, offset: 5 })).rejects.toThrow(/Program state is malformed/);
    expectAnnotated(await service.getFlowRunDetail(projectId, runId), annotation);
  });

  it("fails a save the typed store refuses over a run it holds, and keeps a run it never held in the legacy detail", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Refused saves" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.refused-saves", name: "Refused saves" });
    const saved = (runId: string, actionAttempts: AutomationStudioFlowRunActionAttemptRecord[], metadata: JsonObject): AutomationStudioFlowRunDetail => ({
      schemaVersion: "0.1",
      summary: { schemaVersion: "0.1", runId, flowId: flow.flowId, projectId: project.id, status: "succeeded", startedAt: 10, finishedAt: 20, updatedAt: 20, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: actionAttempts.length, interventionCount: 0, adaptationCount: 0 },
      routeDecisions: [],
      subflows: [],
      actionAttempts,
      interventions: [],
      adaptationIds: [],
      changeProposalIds: [],
      metadata
    });
    // The typed store's keys cannot hold this attempt id.
    const refused = { attemptId: "attempt with spaces", nodeId: "start", definitionId: "builtin.control.start", order: 1, status: "succeeded", startedAt: 10 } as AutomationStudioFlowRunActionAttemptRecord;

    await service.saveFlowRunDetail(saved("run.held", [], { llmGate: { invoked: true } }));
    // Written to the legacy detail instead, this save would sit behind the typed
    // detail that every read returns first, and never be seen.
    await expect(service.saveFlowRunDetail(saved("run.held", [refused], {}))).rejects.toThrow("Invalid action attempt ID.");
    await expect(service.getFlowRunDetail(project.id, "run.held")).resolves.toMatchObject({ summary: { actionAttemptCount: 0 }, metadata: { llmGate: { invoked: true } } });
    await expect(readFile(path.join(projectRoot(project.id), "runtime", "runs", "run.held", "run.json"), "utf8")).rejects.toThrow(/ENOENT/);

    // A run the store never held is still listed from its summary row, and read from the legacy detail.
    await expect(service.saveFlowRunDetail(saved("run.never-held", [refused], { llmGate: { invoked: false } }))).resolves.toMatchObject({ summary: { runId: "run.never-held" } });
    await expect(service.getFlowRunDetail(project.id, "run.never-held")).resolves.toMatchObject({ actionAttempts: [{ attemptId: "attempt with spaces" }], metadata: { llmGate: { invoked: false } } });
    const listed = await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, limit: 25, offset: 0 });
    expect(listed.runs.map((run) => run.runId).sort()).toEqual(["run.held", "run.never-held"]);
    // Once the store can hold it, the run moves over with what the legacy detail recorded.
    await service.saveFlowRunDetail(saved("run.never-held", [], {}));
    await expect(service.getFlowRunDetail(project.id, "run.never-held")).resolves.toMatchObject({ actionAttempts: [{ attemptId: "attempt with spaces" }], metadata: { llmGate: { invoked: false } } });
  });
});
