// A runtime patch reaches the stored Flow only after a whole run that ran it
// was judged to answer (user, 2026-10-02; t249).
//
// The run below starts at the Flow's start, reads a list, and fails at a drift
// step. The patch ladder writes a retry setting for it, the trial passes, and
// the promotion gate allows the patch unattended. Until t249 the patch was
// applied to the stored Flow right there, before the run resumed and before
// anybody looked at its result. Now the run resumes on the unapplied
// candidate, its result is judged under the Flow's standing authorization, and
// only an `answers` verdict applies the patch. Every other ending leaves it
// unapplied, with the reason on the adaptation and on the run's receipt.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { adaptiveTrainingMetadata } from "../../service-fixtures.ts";

const RECORD_OUTPUT: JsonObject = {
  datasetId: "products",
  label: "Products",
  recordsPath: "result.extracted",
  writeMode: "replace",
  schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }] }
};

const EXTRACT: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1",
  id: "example.output.extract-list",
  version: "1.0.0",
  label: "Extract list",
  description: "Reads every item of a list.",
  category: "action",
  source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "extract-list" },
  availability: { kind: "domain", domainId: "example" },
  capabilities: { executable: true },
  outputAction: { fixedOutputId: "extract-list" },
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" },
    { id: "records", label: "Records", valueType: "array", role: "data" }
  ],
  parameters: [{ id: "recordOutput", label: "Save records", valueType: "json", allowStateBinding: false, ui: { control: "record-output" } }]
};

const DRIFT: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1",
  id: "example.drift-action",
  version: "1.0.0",
  label: "Drift Action",
  description: "Fails until a retry parameter is durably learned.",
  category: "custom",
  source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "drift" },
  availability: { kind: "domain", domainId: "example" },
  capabilities: { executable: true, retryable: true, stateAware: true },
  requiredRuntimeCapabilities: ["example.host"],
  inputs: [],
  outputs: [{ id: "done", label: "Done", valueType: "boolean" }],
  parameters: []
};

/** Checks a repaired run because it repaired itself, and no clean run before the fifth. */
const SCHEDULE = { enabled: true, shape: "fixed_interval", initialRunCount: 0, interval: 5, decay: 5 };

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-judged-promotion-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

async function harness(options: {
  verdict?: "yes" | "no";
  /** The judge's answer call by call, then `verdict`. */
  verdicts?: Array<"yes" | "no">;
  authorized?: boolean;
  /** The Flow is the drift step alone, so the trial that repairs it runs the Flow to its end. */
  driftOnly?: boolean;
} = {}) {
  let judgeCalls = 0;
  /** The drift step's retry setting in the stored Flow, read at each moment the judge was asked. */
  const storedAtJudgement: unknown[] = [];
  let readStoredDrift: (() => Promise<unknown>) | undefined;
  const io = new IoRegistry();
  io.registerOutput("example", {
    definition: { id: "extract-list", title: "Extract list" },
    mode: "request",
    dispatch: async (request) => ({ ok: true, domainId: "example", outputId: request.outputId, payload: { result: { extracted: [{ name: "Lamp" }, { name: "Desk" }] } } })
  });
  const native = new AutomationStudioNativeNodeRuntime({ runtimeCapabilities: ["example.host"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [EXTRACT, DRIFT] },
    {
      packageId: "example.package",
      packageVersion: "1.0.0",
      implementations: {
        "extract-list": ({ parameters }) => ({ status: "success", outputs: { success: true }, effects: [{ type: "policy.output.dispatch", payload: { outputId: "extract-list", parameters: {}, recordOutput: parameters.recordOutput ?? null } }] }),
        drift: ({ parameters }) => parameters.retryCount === 2
          ? { status: "success", route: "success", outputs: { done: true } }
          : { status: "failed", route: "failed", outputs: { error: "Target drift was not recovered." } }
      }
    }
  );
  const judge: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "judge" },
    runTask: async () => {
      storedAtJudgement.push(await readStoredDrift?.());
      const answersRequest = options.verdicts?.[judgeCalls] ?? options.verdict ?? "yes";
      judgeCalls += 1;
      return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest } }, usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.0015 } };
    }
  };
  const service = new AutomationStudioService({
    dataDir: tempRoot,
    seedFixture: false,
    llmProviderResolver: () => ({
      metadata: { provider: "mock", model: "repair" },
      runTask: async (request) => request.taskKind === "runtime_patch"
        ? {
          response: {
            kind: "runtime_patch",
            summary: "Retry the drift action once the state settles.",
            riskLevel: "low",
            patches: [{ kind: "temporary_wait_retry", targetNodeId: "drift", retryCount: 2, timeoutMs: 100, reason: "The action succeeds after a deterministic retry setting." }]
          },
          usage: { inputTokens: 10, outputTokens: 6, totalTokens: 16, estimatedCostUsd: 0.002 }
        }
        : { response: { kind: "diagnosis", summary: "The drift action needs a retry setting." }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 } }
    }),
    resultCheckProviderResolver: (request) => ({ provider: judge, maxEstimatedCostUsd: request.maxEstimatedCostUsd })
  }).bindIoRuntime(io, "example").bindNativeNodeRuntime(native);
  services.add(service);

  const base = adaptiveTrainingMetadata();
  const authorization = { authorizedByUserId: "user.aiden", unlockSessionId: "session.unlock.1", keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 86_400_000 };
  const project = await service.createProject({ name: "Judged promotion", domainId: "example" });
  const created = await service.createFlow({ projectId: project.id, flowId: "flow.judged-promotion", name: "Judged promotion Flow" });
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...created,
      metadata: {
        ...(created.metadata ?? {}),
        ...base,
        trainingModeSettings: { ...(base.trainingModeSettings as JsonObject), resultCheck: { schedule: SCHEDULE, ...(options.authorized === false ? {} : { authorization }) } }
      }
    }
  });
  const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: created.flowId, name: "Primary", role: "primary" });
  const graphFlowId = subflow.graphFlowId!;
  const blank = await service.getFlow(project.id, graphFlowId);
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...blank,
      nodes: options.driftOnly ? [{ id: "drift", definitionId: DRIFT.id, parameterValues: { expectedOutputs: { done: true } } }] : [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "extract", definitionId: EXTRACT.id, parameterValues: { recordOutput: RECORD_OUTPUT } },
        { id: "drift", definitionId: DRIFT.id, parameterValues: { expectedOutputs: { done: true } } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: options.driftOnly ? [] : [
        { id: "start.extract", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "extract", targetPortId: "in" },
        { id: "extract.drift", sourceNodeId: "extract", sourcePortId: "success", targetNodeId: "drift", targetPortId: "in" },
        { id: "drift.end", sourceNodeId: "drift", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    }
  });
  await service.setFlowMapFallback({ projectId: project.id, flowId: created.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  readStoredDrift = async () => (await service.getFlow(project.id, graphFlowId)).nodes.find((node) => node.id === "drift")?.parameterValues?.retryCount;

  const run = await service.runRuntimeSession({ projectId: project.id, flowId: created.flowId });
  const detail = await service.getFlowRunDetail(project.id, run.runId);
  const adaptation = detail?.adaptationIds[0] ? await service.getFlowAdaptation(project.id, created.flowId, detail.adaptationIds[0]) : null;
  return { service, run, detail, adaptation, storedAtJudgement, storedDrift: await readStoredDrift(), judgeCalls };
}

describe("a runtime patch and the whole run that judges it", () => {
  it("is not applied while its run is still being judged, and is applied once the judged run answers", { timeout: 180_000 }, async () => {
    const found = await harness();

    expect(found.run.status).toBe("succeeded");
    expect(found.run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
    // The judge was asked while the stored Flow still had no retry setting:
    // the run it judged ran the candidate, not a Flow the patch had changed.
    expect(found.storedAtJudgement).toEqual([undefined]);
    // The run went from the Flow's start to its end, the patch's step included.
    expect(found.detail?.metadata).toMatchObject({ adaptiveRetry: { attempted: true, status: "succeeded", candidateAdaptationIds: [found.adaptation?.adaptationId] } });
    expect(found.run.trace?.attempts[0]?.nodeId).toBe("start");
    // Then, and only then, the patch reached the stored Flow.
    expect(found.storedDrift).toBe(2);
    expect(found.adaptation).toMatchObject({
      status: "applied",
      metadata: { approvalDecision: { autoApply: true, applyAt: "judged_whole_run", applied: true, judgedRunId: found.run.runId }, applicationRecord: { durable: true } }
    });
    expect(found.detail?.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({ approvalDecision: expect.objectContaining({ applied: true, judgedRunId: found.run.runId }) })]);
    expect(found.detail?.metadata?.adaptiveMetrics).toMatchObject({ durableBehaviorChanged: true, adaptationApplyCount: 1 });
  });

  it("stays unapplied when the run that ran it is refuted, and says so", { timeout: 180_000 }, async () => {
    const found = await harness({ verdict: "no" });

    expect(found.run.status).toBe("failed");
    expect(found.storedDrift).toBeUndefined();
    expect(found.adaptation?.status).not.toBe("applied");
    expect(found.adaptation?.metadata?.approvalDecision).toMatchObject({ autoApply: true, applyAt: "judged_whole_run", applied: false, notAppliedReason: "refuted", judgedRunId: found.run.runId });
    // The refuted result's own repair ran the patch ladder again, and wrote the
    // run's receipts afresh. What it wrote was never run whole either, so it
    // stays unapplied too, and every receipt the run keeps says so.
    for (const receipt of found.detail?.metadata?.runtimePatchAttempts as Array<Record<string, unknown>>) {
      expect(receipt.approvalDecision).toMatchObject({ applied: false, notAppliedReason: expect.any(String) });
    }
    // Each later patch had its own whole-Flow re-run, was refuted too, and was not kept.
    for (const laterId of found.detail?.adaptationIds.slice(1) ?? []) {
      const later = await found.service.getFlowAdaptation(found.run.projectId!, found.run.flowId, laterId);
      expect(later?.metadata?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: expect.any(String) });
    }
    expect(found.detail?.metadata?.adaptiveMetrics).toMatchObject({ durableBehaviorChanged: false, adaptationApplyCount: 0 });
  });

  it("stays unapplied when nothing judged the run, however well every step went", { timeout: 180_000 }, async () => {
    const found = await harness({ authorized: false });

    expect(found.run.status).toBe("succeeded");
    expect(found.run.metadata?.resultVerification).toMatchObject({ performed: false });
    expect(found.storedDrift).toBeUndefined();
    expect(found.adaptation?.status).toBe("validated");
    expect(found.adaptation?.metadata?.approvalDecision).toMatchObject({ autoApply: true, applied: false, notAppliedReason: "not_judged" });
  });
  // t249 follow-up: a trial that ran the Flow to its end began at the Flow's
  // start and finished on the candidate, so it is the whole run. Its pass is
  // adopted as the resumed pass and judged; nothing runs again.
  it("judges a trial that ran the Flow to its end as the whole run, and keeps the patch when it answers", { timeout: 180_000 }, async () => {
    const found = await harness({ driftOnly: true });

    expect(found.run.status).toBe("succeeded");
    expect(found.run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
    expect(found.storedAtJudgement).toEqual([undefined]);
    expect(found.detail?.metadata?.adaptiveRetry).toMatchObject({ attempted: true, status: "succeeded", trialCompleted: true, candidateAdaptationIds: [found.adaptation?.adaptationId] });
    // The run's own trace holds the failed first attempt and the trial's pass, under distinct ids.
    const ids = found.run.trace?.attempts.map((attempt) => attempt.attemptId) ?? [];
    expect(found.run.trace?.attempts.map((attempt) => [attempt.nodeId, attempt.status])).toEqual([["drift", "failed"], ["drift", "succeeded"]]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(found.storedDrift).toBe(2);
    expect(found.adaptation).toMatchObject({ status: "applied", metadata: { approvalDecision: { applied: true, judgedRunId: found.run.runId } } });
    expect(found.adaptation?.metadata?.approvalDecision).not.toHaveProperty("notAppliedReason");
    expect(found.detail?.metadata?.runtimePatchAttempts).toEqual([expect.not.objectContaining({ completedTrace: expect.anything() })]);
  });

  it("leaves a trial that ran the Flow to its end unapplied when its run is refuted, never as not re-run", { timeout: 180_000 }, async () => {
    const found = await harness({ driftOnly: true, verdict: "no" });

    expect(found.storedDrift).toBeUndefined();
    expect(found.adaptation?.metadata?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: "refuted" });
  });

  // t249 follow-up: the patch ladder after a refuted result writes a patch with
  // no failed step to resume from. It gets the whole-Flow re-run from the start
  // a re-authored Flow gets, on the unapplied candidate, and is judged.
  it("re-runs a patch the refuted result's repair wrote from the Flow's start, and keeps it when that run answers", { timeout: 180_000 }, async () => {
    const found = await harness({ verdicts: ["no", "no", "yes"] });

    expect(found.run.status).toBe("succeeded");
    expect(found.run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
    expect(found.judgeCalls).toBe(3);
    // The first patch's own run was refuted: not kept.
    expect(found.adaptation?.metadata?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: "refuted" });
    const laterId = found.detail?.adaptationIds[1];
    expect(laterId).toBeDefined();
    expect(found.detail?.metadata?.repairedRerun).toMatchObject({ attempted: true, status: "succeeded", candidateAdaptationIds: [laterId] });
    const later = await found.service.getFlowAdaptation(found.run.projectId!, found.run.flowId, laterId!);
    expect(later).toMatchObject({ status: "applied", metadata: { approvalDecision: { applied: true, judgedRunId: found.run.runId } } });
    expect(found.storedDrift).toBe(2);
  });
});
