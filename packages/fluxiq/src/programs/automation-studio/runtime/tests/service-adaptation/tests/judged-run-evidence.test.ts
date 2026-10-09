// A target override on a Flow that declares no evidence is kept on the
// judgement of the whole run that ran it (t267).
//
// A Flow built from an instruction declares nothing a trial could check: no
// expected state, route or outputs, no assertion node, no records. A target
// override whose changed step then succeeds proves nothing on its own -- its
// trial ends `unverifiable`, `no_evidence` -- and until t267 that was the end
// of it: the run did not carry on, the promotion gate refused an unproved
// change, and the apply would have refused it too. The judged whole run is the
// evidence such a repair worked. The run below is the harness of
// `./judged-promotion.test.ts` with its drift step replaced by an action that
// declares nothing and fails until it is re-aimed.
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

/** Presses a control. It succeeds only once it is aimed at the control the page now has, and declares nothing a trial could check. */
const PRESS: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1",
  id: "example.press",
  version: "1.0.0",
  label: "Press",
  description: "Presses the control it is aimed at.",
  category: "action",
  source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "press" },
  availability: { kind: "domain", domainId: "example" },
  capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "failed", label: "Failed", valueType: "any" }],
  parameters: [{ id: "target", label: "Target", valueType: "json", allowStateBinding: false }]
};

const RECORDED_TARGET = { handles: { control: "submit" } };
const REPLACEMENT_TARGET = { handles: { control: "replacement" } };

/** Checks a repaired run because it repaired itself, and no clean run before the fifth. */
const SCHEDULE = { enabled: true, shape: "fixed_interval", initialRunCount: 0, interval: 5, decay: 5 };

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-judged-run-evidence-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

async function harness(options: { verdict: "yes" | "no"; reAimedFailsOnce?: boolean }) {
  /** The press step's target in the stored Flow, read at each moment the judge was asked. */
  const storedAtJudgement: unknown[] = [];
  /** Whether each press aimed at the replacement control succeeded, in the order they ran. */
  const reAimedPresses: boolean[] = [];
  let readStoredTarget: (() => Promise<unknown>) | undefined;
  const io = new IoRegistry();
  io.registerOutput("example", {
    definition: { id: "extract-list", title: "Extract list" },
    mode: "request",
    dispatch: async (request) => ({ ok: true, domainId: "example", outputId: request.outputId, payload: { result: { extracted: [{ name: "Lamp" }, { name: "Desk" }] } } })
  });
  const native = new AutomationStudioNativeNodeRuntime({ runtimeCapabilities: ["example.host"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [EXTRACT, PRESS] },
    {
      packageId: "example.package",
      packageVersion: "1.0.0",
      implementations: {
        "extract-list": ({ parameters }) => ({ status: "success", outputs: { success: true }, effects: [{ type: "policy.output.dispatch", payload: { outputId: "extract-list", parameters: {}, recordOutput: parameters.recordOutput ?? null } }] }),
        press: ({ parameters }) => {
          if (JSON.stringify(parameters.target) !== JSON.stringify(REPLACEMENT_TARGET)) return { status: "failed", route: "failed", outputs: { error: "The control was not found." } };
          // A page still settling: the first press at the re-aimed control finds no control yet, which a
          // domain reports as a retryable miss before anything was pressed, and its automatic retry lands.
          const lands = !options.reAimedFailsOnce || reAimedPresses.length > 0;
          reAimedPresses.push(lands);
          return lands
            ? { status: "success", route: "success", outputs: { success: true } }
            : { status: "failed", route: "failed", outputs: { error: "The control was not ready." }, failure: { category: "target_not_found", code: "example.target.not_found", retryable: true, stage: "target_resolution" } };
        }
      }
    }
  );
  const judge: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "judge" },
    runTask: async () => {
      storedAtJudgement.push(await readStoredTarget?.());
      return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: options.verdict } }, usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.0015 } };
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
            summary: "Press the control the page has now.",
            riskLevel: "high",
            patches: [{ kind: "temporary_target_override", targetNodeId: "press", target: REPLACEMENT_TARGET, consequences: [], reason: "The recorded control was renamed." }]
          },
          usage: { inputTokens: 10, outputTokens: 6, totalTokens: 16, estimatedCostUsd: 0.002 }
        }
        : { response: { kind: "diagnosis", summary: "The control the step presses was renamed." }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 } }
    }),
    resultCheckProviderResolver: (request) => ({ provider: judge, maxEstimatedCostUsd: request.maxEstimatedCostUsd }),
    // A target override runs only once a domain has judged it against the
    // evidence captured for the failure.
    llmEvidenceRuntime: {
      domainId: "example", deniedEvidenceKeys: ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"], tools: [],
      executeTool: async () => ({}),
      captureSanitizedFailureEvidence: async () => ({ schemaVersion: "example.failure-evidence.v1", controls: ["replacement"] }),
      validateTargetOverrideEvidence: () => ({ status: "matched" })
    }
  }).bindIoRuntime(io, "example").bindNativeNodeRuntime(native);
  services.add(service);

  const base = adaptiveTrainingMetadata();
  const authorization = { authorizedByUserId: "user.aiden", unlockSessionId: "session.unlock.1", keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 86_400_000 };
  const project = await service.createProject({ name: "Judged run evidence", domainId: "example" });
  const created = await service.createFlow({ projectId: project.id, flowId: "flow.judged-run-evidence", name: "Judged run evidence Flow" });
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...created,
      metadata: {
        ...(created.metadata ?? {}),
        ...base,
        trainingModeSettings: { ...(base.trainingModeSettings as JsonObject), resultCheck: { schedule: SCHEDULE, authorization } }
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
      // As an instruction builds it: no node declares anything a trial could check.
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "extract", definitionId: EXTRACT.id, parameterValues: { recordOutput: RECORD_OUTPUT } },
        { id: "press", definitionId: PRESS.id, parameterValues: { target: RECORDED_TARGET } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [
        { id: "start.extract", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "extract", targetPortId: "in" },
        { id: "extract.press", sourceNodeId: "extract", sourcePortId: "success", targetNodeId: "press", targetPortId: "in" },
        { id: "press.end", sourceNodeId: "press", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    }
  });
  await service.setFlowMapFallback({ projectId: project.id, flowId: created.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  readStoredTarget = async () => (await service.getFlow(project.id, graphFlowId)).nodes.find((node) => node.id === "press")?.parameterValues?.target;

  const run = await service.runRuntimeSession({ projectId: project.id, flowId: created.flowId });
  const detail = await service.getFlowRunDetail(project.id, run.runId);
  const adaptation = detail?.adaptationIds[0] ? await service.getFlowAdaptation(project.id, created.flowId, detail.adaptationIds[0]) : null;
  return { service, run, detail, adaptation, storedAtJudgement, reAimedPresses, storedTarget: await readStoredTarget() };
}

describe("a target override on a Flow that declares no evidence", () => {
  it("carries the run on through the repair, and is applied once that whole run is judged to answer", { timeout: 180_000 }, async () => {
    const found = await harness({ verdict: "yes" });
    const receipts = found.detail?.metadata?.runtimePatchAttempts as Array<Record<string, unknown>> | undefined;

    // The trial proved nothing on its own, and said the judged run would.
    expect(receipts?.[0]).toMatchObject({
      kind: "temporary_target_override",
      resumable: false,
      notResumableCode: "no_evidence",
      verification: { status: "unverifiable", awaitsJudgedRun: true },
      restoredExpectedState: false,
      retryOriginalAction: true,
      approvalDecision: { autoApply: true, applyAt: "judged_whole_run", evidence: "judged_whole_run" }
    });
    // The run carried on past the repaired step, from the Flow's start to its end, and was judged.
    expect(found.run.status).toBe("succeeded");
    expect(found.run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
    expect(found.detail?.metadata?.adaptiveRetry).toMatchObject({ attempted: true, status: "succeeded", candidateAdaptationIds: [found.adaptation?.adaptationId] });
    expect(found.run.trace?.attempts[0]?.nodeId).toBe("start");
    // The judge saw a stored Flow the repair had not yet changed.
    expect(found.storedAtJudgement).toEqual([RECORDED_TARGET]);
    // Then the judged run became the change's evidence, and the change was applied.
    expect(found.storedTarget).toEqual(REPLACEMENT_TARGET);
    expect(found.adaptation).toMatchObject({
      status: "applied",
      validationResults: [{ runId: found.run.runId, status: "succeeded", kind: "trial", basis: ["judged_whole_run"] }],
      metadata: { approvalDecision: { autoApply: true, applied: true, judgedRunId: found.run.runId }, applicationRecord: { durable: true } }
    });
    expect(found.adaptation?.metadata?.approvalDecision).not.toHaveProperty("notAppliedReason");
  });

  // Every node gets a first attempt and three automatic retries. A re-aimed
  // press that misses once and lands on its retry is a correct repair, and its
  // trial must not read the missed attempt as a contradiction (t375).
  it("carries on and is applied when the re-aimed press needs one automatic retry in its trial", { timeout: 180_000 }, async () => {
    const found = await harness({ verdict: "yes", reAimedFailsOnce: true });
    const receipts = found.detail?.metadata?.runtimePatchAttempts as Array<Record<string, unknown>> | undefined;

    // The trial's first press at the re-aimed control missed, and its retry landed.
    expect(found.reAimedPresses.slice(0, 2)).toEqual([false, true]);
    expect(receipts?.[0]).toMatchObject({
      kind: "temporary_target_override",
      resumable: false,
      notResumableCode: "no_evidence",
      verification: { status: "unverifiable", awaitsJudgedRun: true },
      retryOriginalAction: true,
      approvalDecision: { autoApply: true, applyAt: "judged_whole_run", evidence: "judged_whole_run" }
    });
    expect(found.run.status).toBe("succeeded");
    expect(found.run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
    expect(found.detail?.metadata?.adaptiveRetry).toMatchObject({ attempted: true, status: "succeeded" });
    expect(found.storedTarget).toEqual(REPLACEMENT_TARGET);
    expect(found.adaptation).toMatchObject({
      status: "applied",
      validationResults: [{ runId: found.run.runId, status: "succeeded", kind: "trial", basis: ["judged_whole_run"] }]
    });
  });

  it("stays unapplied, with no evidence recorded, when that whole run is refuted", { timeout: 180_000 }, async () => {
    const found = await harness({ verdict: "no" });

    expect(found.run.status).toBe("failed");
    expect(found.storedTarget).toEqual(RECORDED_TARGET);
    expect(found.adaptation?.status).not.toBe("applied");
    expect(found.adaptation?.validationResults ?? []).toEqual([]);
    expect(found.adaptation?.metadata?.approvalDecision).toMatchObject({ autoApply: true, applyAt: "judged_whole_run", applied: false, notAppliedReason: "refuted", judgedRunId: found.run.runId });
    expect(found.detail?.metadata?.adaptiveMetrics).toMatchObject({ durableBehaviorChanged: false, adaptationApplyCount: 0 });
  });
});
