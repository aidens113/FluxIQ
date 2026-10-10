import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioImporterSdkManifest } from "../../../../nodes/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { getPrimarySubflowGraph, installPrimaryRouter, adaptiveTrainingMetadata } from "../../service-fixtures.ts";

// Heavy service test: under full-suite load it ran past the 15 s default (t289).
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

/** The gate's reason for a fix decided before its re-attempt: the judged run is its evidence. */
const JUDGED_RUN_REASON = "A change whose trial proved nothing either way is applied only once a whole run from the Flow's start, which ran it, is judged to answer: that judged run is its evidence.";

let tempRoot: string;

const services = new Set<AutomationStudioService>();

function createService(...args: ConstructorParameters<typeof AutomationStudioService>): AutomationStudioService {
  const service = new AutomationStudioService(...args);
  services.add(service);
  return service;
}

/** A domain node that fails until it runs with a retry setting of 2. */
function driftRuntime(): AutomationStudioNativeNodeRuntime {
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
  return new AutomationStudioNativeNodeRuntime({ runtimeCapabilities: ["example.host"] }).register(manifest, {
    packageId: "example.adaptive",
    packageVersion: "1.0.0",
    implementations: {
      drift: ({ parameters }) => parameters.retryCount === 2
        ? { status: "success", route: "success", outputs: { done: true } }
        : { status: "failed", route: "failed", outputs: { error: "Target drift was not recovered." } }
    }
  });
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

  // Since t249 a patch the gate allows unattended is held until a whole run that
  // ran it is judged to answer. In the run (C6 step 8) the fix is held at the
  // failing step and decided on there, before its re-attempt, so the decision
  // rests on the judged run; the re-attempt that passes validates it. This run
  // finished, but nothing judged its result, so the fix stays unapplied with why.
  it("allows a low-risk fix held in the run unattended, validates it by its re-attempt, and leaves it unapplied when nothing judged the run that ran it", async () => {
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
              patches: [{ kind: "temporary_wait_retry", targetNodeId: "drift", retryCount: 2, timeoutMs: 250, reason: "Retry the drift action once the state settles." }]
            },
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.002 }
          }
          : {
            response: { kind: "diagnosis", summary: "The drift action failed, but a deterministic retry candidate exists." },
            usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 }
          }
      })
    }).bindNativeNodeRuntime(driftRuntime());
    const project = await service.createProject({ name: "Runtime auto promote", domainId: "example" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.runtime-auto-promote", name: "Runtime auto promote Flow" });
    await service.saveFlow({ projectId: project.id, flow: { ...flow, metadata: { ...(flow.metadata ?? {}), ...adaptiveTrainingMetadata() } } });
    await installPrimaryRouter(service, project.id, flow.flowId, {
        nodes: [
          { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
          { id: "drift", definitionId: "example.drift-action", parameterValues: { expectedOutputs: { done: true } } }, // The failed node declares what it was expected to produce; its re-attempt is matched against it.
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: [
          { id: "start.drift", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "drift", targetPortId: "in" },
          { id: "drift.end", sourceNodeId: "drift", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
        ]
    });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    const adaptation = await service.getFlowAdaptation(project.id, flow.flowId, detail!.adaptationIds[0]!);

    expect(run.status).toBe("succeeded");
    expect(run.trace?.repairs).toHaveLength(1);
    expect(adaptation).toMatchObject({
      status: "validated",
      patch: [{ kind: "edit_expectation", targetId: "drift" }],
      validationResults: [{ runId: run.runId, status: "succeeded", kind: "trial", basis: ["in_run_trial"] }],
      metadata: {
        approvalDecision: {
          autoApply: true,
          requiresManualApproval: false,
          reason: JUDGED_RUN_REASON,
          confidence: "unverified",
          applyAt: "judged_whole_run",
          applied: false,
          notAppliedReason: "not_judged",
          judgedRunId: run.runId
        }
      }
    });
    expect(adaptation?.metadata).not.toHaveProperty("applicationRecord");
    const stored = await getPrimarySubflowGraph(service, project.id, flow.flowId);
    expect(stored.nodes.find((node) => node.id === "drift")?.parameterValues).not.toHaveProperty("retryCount");
    expect(detail?.metadata?.inRunRepairs).toEqual([expect.objectContaining({
      kind: "temporary_wait_retry",
      approvalDecision: expect.objectContaining({ autoApply: true, applied: false, notAppliedReason: "not_judged" })
    })]);
    expect(detail?.metadata?.adaptiveMetrics).toMatchObject({ durableBehaviorChanged: false, adaptationApplyCount: 0 });
  });

  // The loop closes only through a judged whole run (t249): the repaired run's
  // result is checked under the Flow's standing authorization, answers, and
  // only then is the patch kept for the next run.
  it("completes an adaptive runtime loop, keeps the patch once the repaired run is judged to answer, and makes the next run deterministic", async () => {
    let llmCalls = 0;
    const judgeCalls: string[] = [];
    const judge: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "judge" },
      runTask: async (request) => {
        judgeCalls.push(request.taskKind);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "yes" } }, usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.0015 } };
      }
    };
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
      }),
      resultCheckProviderResolver: (request) => ({ provider: judge, maxEstimatedCostUsd: request.maxEstimatedCostUsd })
    }).bindNativeNodeRuntime(driftRuntime());
    const project = await service.createProject({ name: "Adaptive Loop", domainId: "example" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.adaptive-loop", name: "Adaptive Loop Flow" });
    const base = adaptiveTrainingMetadata();
    // A repaired run is checked because it repaired itself; a clean run is not checked before the fifth.
    const resultCheck = {
      schedule: { enabled: true, shape: "fixed_interval", initialRunCount: 0, interval: 5, decay: 5 },
      authorization: { authorizedByUserId: "user.aiden", unlockSessionId: "session.unlock.1", keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 86_400_000 }
    };
    await service.saveFlow({ projectId: project.id, flow: { ...flow, metadata: { ...(flow.metadata ?? {}), ...base, trainingModeSettings: { ...(base.trainingModeSettings as JsonObject), resultCheck } } } });
    await installPrimaryRouter(service, project.id, flow.flowId, {
        nodes: [
          { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
          { id: "drift", definitionId: "example.drift-action", parameterValues: { expectedOutputs: { done: true } } }, // The first attempt emits `error`; the patched rerun emits the declared `done`.
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: [
          { id: "start.drift", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "drift", targetPortId: "in" },
          { id: "drift.end", sourceNodeId: "drift", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
        ]
    });

    const first = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const firstDetail = await service.getFlowRunDetail(project.id, first.runId);
    const learnedFlow = await getPrimarySubflowGraph(service, project.id, flow.flowId);
    const second = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const secondDetail = await service.getFlowRunDetail(project.id, second.runId);

    expect(first.status).toBe("succeeded");
    expect(first.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
    expect(judgeCalls).toEqual(["loop_verification"]);
    // The fix was held at the failing step and the run carried on there (C6 step 8).
    expect(firstDetail?.metadata).not.toHaveProperty("adaptiveRetry");
    expect(firstDetail?.metadata?.inRunRepairs).toEqual([expect.objectContaining({ repairId: first.trace?.repairs?.[0], adaptationId: firstDetail?.adaptationIds[0] })]);
    // The run's metrics do not yet count an in-run fix: pinned in `./judged-promotion.test.ts`.
    // The diagnosis, the patch request, and the result check that judged the repaired run.
    expect(firstDetail?.interventions.map((intervention) => intervention.kind)).toEqual(["diagnosis", "diagnosis", "runtime_patch", "diagnosis"]);
    expect(firstDetail?.adaptationIds).toHaveLength(1);
    await expect(service.getFlowAdaptation(project.id, flow.flowId, firstDetail!.adaptationIds[0]!)).resolves.toMatchObject({
      status: "applied",
      metadata: { approvalDecision: { autoApply: true, applyAt: "judged_whole_run", applied: true, judgedRunId: first.runId }, applicationRecord: { durable: true } }
    });
    expect(learnedFlow.nodes.find((node) => node.id === "drift")?.parameterValues).toMatchObject({ retryCount: 2, timeoutMs: 100 });
    expect(second.status).toBe("succeeded");
    expect(secondDetail?.interventions).toEqual([]);
    expect(llmCalls).toBe(2);
  });
});
