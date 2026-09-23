// A repair's own product, judged with nobody watching.
//
// This is the fourth gate of the loop: a run fails, the model repairs it, the
// retry succeeds, and the retried session's *result* is then checked -- so a
// repair that produced a second wrong answer is noticed rather than reported as
// a success. It was believed to be unreachable, and the reasoning was a circle:
// a verification only resolved a model from a person's execution grant, a run
// carrying any grant is forced to `manual_approval`, manual approval makes the
// promotion gate record `autoApply: false`, and
// `decideAutomationStudioAdaptiveRetry` only asks for a retry from an attempt
// whose `autoApply` is true. A granted run never retried; an ungranted retry
// never asked a model.
//
// What breaks the circle is the standing result-check authorization
// (`runtime/result-check-authorization/`): a Flow-scoped permission naming one
// key, one ceiling and one expiry, redeemable for `loop_verification` and
// nothing else. It is not a grant. Nothing about it reaches `input.llmExecution`
// and so nothing about it implies `manual_approval` -- which is the link these
// tests are here to hold open, because it is invisible at the one edit that
// would close it again.
//
// Every assertion below is on a run carrying no grant at all, except the last
// two, which exist to pin a person's grant behaving exactly as it did before
// any of this.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import type { AutomationStudioRuntimeSessionGrant } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES } from "../../../result-check-authorization/index.ts";
import { AUTOMATION_STUDIO_RESULT_CHECK_CODES } from "../../../result-check-schedule/index.ts";
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

// The shape `adaptive-retry-resume.test.ts` proved takes a
// `temporary_wait_retry` through a trial and a resumed retry.
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

/**
 * A schedule that checks runs 5, 10, 15 and never run 1.
 *
 * Chosen so that a repaired first run is checked *because it repaired itself*
 * and for no other reason. `decide.test.ts` pins the other half of that claim:
 * these same settings leave ordinal 1 unchecked when nothing was repaired.
 */
const SEQUENCE_SKIPS_RUN_ONE = { enabled: true, shape: "fixed_interval", initialRunCount: 0, interval: 5, decay: 5 };

function standingAuthorization(overrides: JsonObject = {}): JsonObject {
  return {
    authorizedByUserId: "user.aiden",
    unlockSessionId: "session.unlock.1",
    keyId: "key.deepseek",
    maxTotalCostUsd: 1,
    maxCostUsdPerCall: 0.05,
    grantedAtMs: Date.now() - 1000,
    expiresAtMs: Date.now() + 90 * 24 * 60 * 60 * 1000,
    ...overrides
  };
}

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-unattended-retry-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

type Harness = {
  service: AutomationStudioService;
  projectId: string;
  flowId: string;
  /** Every standing redemption the host was asked to resolve a model for. */
  standingRequests: Array<{ keyId: string; maxEstimatedCostUsd: number; authorizedByUserId: string }>;
  /** The task kinds the standing provider was actually asked to run. */
  standingCalls: string[];
  /** The task kinds the *grant* provider was asked to run, and whether a grant came with each. */
  grantedCalls: Array<{ taskKind: string; hasGrant: boolean }>;
};

async function harness(options: {
  authorization?: JsonObject | undefined;
  schedule?: JsonObject;
  /** Omit the drift node, so the run succeeds first time and nothing is repaired. */
  clean?: boolean;
  verdict?: "yes" | "no";
} = {}): Promise<Harness> {
  const standingRequests: Harness["standingRequests"] = [];
  const standingCalls: string[] = [];
  const grantedCalls: Harness["grantedCalls"] = [];
  let addRepairedStep: (() => Promise<void>) | undefined;

  const io = new IoRegistry();
  io.registerOutput("example", {
    definition: { id: "extract-list", title: "Extract list" },
    mode: "request",
    dispatch: async (request) => ({
      ok: true,
      domainId: "example",
      outputId: request.outputId,
      payload: { result: { extracted: [{ name: "Lamp" }, { name: "Desk" }] } }
    })
  });
  const native = new AutomationStudioNativeNodeRuntime({ runtimeCapabilities: ["example.host"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [EXTRACT, DRIFT] },
    {
      packageId: "example.package",
      packageVersion: "1.0.0",
      implementations: {
        "extract-list": ({ parameters }) => ({
          status: "success",
          outputs: { success: true },
          effects: [{ type: "policy.output.dispatch", payload: { outputId: "extract-list", parameters: {}, recordOutput: parameters.recordOutput ?? null } }]
        }),
        drift: ({ parameters }) => parameters.retryCount === 2
          ? { status: "success", route: "success", outputs: { done: true } }
          : { status: "failed", route: "failed", outputs: { error: "Target drift was not recovered." } }
      }
    }
  );

  // What the standing authorization buys: one model, for one key, bounded by
  // the ceiling the redemption worked out. It is never handed a grant, because
  // there is none to hand it.
  const judge: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "standing-judge" },
    runTask: async (request) => {
      standingCalls.push(request.taskKind);
      return {
        response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: options.verdict ?? "yes" } },
        usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.0015 }
      };
    }
  };

  const service = new AutomationStudioService({
    dataDir: tempRoot,
    seedFixture: false,
    // The repair's own model, bound at construction and carrying no actor
    // session. A grant, when a test passes one, arrives here as `executionGrant`.
    llmProviderResolver: (resolverInput) => ({
      metadata: { provider: "mock", model: "repair" },
      runTask: async (request) => {
        grantedCalls.push({ taskKind: request.taskKind, hasGrant: Boolean(resolverInput.executionGrant) });
        if (request.taskKind === "runtime_patch") {
          // A structural repair stands in for what a real one does: the stored
          // document differs from the one the service read when the run started.
          await addRepairedStep?.();
          return {
            response: {
              kind: "runtime_patch",
              summary: "Retry the drift action once the state settles.",
              riskLevel: "low",
              patches: [{ kind: "temporary_wait_retry", targetNodeId: "drift", retryCount: 2, timeoutMs: 100, reason: "The action succeeds after a deterministic retry setting." }]
            },
            usage: { inputTokens: 10, outputTokens: 6, totalTokens: 16, estimatedCostUsd: 0.002 }
          };
        }
        if (request.taskKind === "loop_verification") {
          return { response: { kind: "diagnosis", summary: "Judged by the grant.", diagnosis: { answersRequest: "yes" } }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 } };
        }
        return { response: { kind: "diagnosis", summary: "The drift action needs a retry setting." }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 } };
      }
    }),
    resultCheckProviderResolver: (request) => {
      standingRequests.push({ keyId: request.keyId, maxEstimatedCostUsd: request.maxEstimatedCostUsd, authorizedByUserId: request.authorizedByUserId });
      return { provider: judge, maxEstimatedCostUsd: request.maxEstimatedCostUsd };
    }
  }).bindIoRuntime(io, "example").bindNativeNodeRuntime(native);
  services.add(service);

  const base = adaptiveTrainingMetadata();
  const authorization = "authorization" in options ? options.authorization : standingAuthorization();
  const project = await service.createProject({ name: "Unattended retry", domainId: "example" });
  const created = await service.createFlow({ projectId: project.id, flowId: "flow.unattended-retry", name: "Unattended retry Flow" });
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...created,
      metadata: {
        ...(created.metadata ?? {}),
        ...base,
        trainingModeSettings: {
          ...(base.trainingModeSettings as JsonObject),
          resultCheck: { schedule: options.schedule ?? SEQUENCE_SKIPS_RUN_ONE, ...(authorization ? { authorization } : {}) }
        }
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
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "extract", definitionId: EXTRACT.id, parameterValues: { recordOutput: RECORD_OUTPUT } },
        ...(options.clean ? [] : [{ id: "drift", definitionId: DRIFT.id, parameterValues: { expectedOutputs: { done: true } } }]),
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: options.clean
        ? [
          { id: "start.extract", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "extract", targetPortId: "in" },
          { id: "extract.end", sourceNodeId: "extract", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
        ]
        : [
          { id: "start.extract", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "extract", targetPortId: "in" },
          { id: "extract.drift", sourceNodeId: "extract", sourcePortId: "success", targetNodeId: "drift", targetPortId: "in" },
          { id: "drift.end", sourceNodeId: "drift", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
        ]
    }
  });
  await service.setFlowMapFallback({ projectId: project.id, flowId: created.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });

  addRepairedStep = async () => {
    const current = await service.getFlow(project.id, graphFlowId);
    if (current.nodes.some((node) => node.id === "repaired")) return;
    await service.saveFlow({
      projectId: project.id,
      flow: { ...current, nodes: [...current.nodes, { id: "repaired", definitionId: "builtin.control.noop", parameterValues: {} }] }
    });
  };

  return { service, projectId: project.id, flowId: created.flowId, standingRequests, standingCalls, grantedCalls };
}

describe("a repaired run's result, with nobody watching", () => {
  it("is judged under the Flow's standing authorization, spending a call with no grant anywhere", { timeout: 180_000 }, async () => {
    const found = await harness();
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });

    // The repair landed and the run re-ran: the precondition for anything below.
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);
    expect(detail?.metadata).toMatchObject({ adaptiveRetry: { attempted: true, status: "succeeded" } });

    // A model was obtained, and one verification call was made, without a grant.
    expect(found.standingRequests).toEqual([{ keyId: "key.deepseek", maxEstimatedCostUsd: 0.05, authorizedByUserId: "user.aiden" }]);
    expect(found.standingCalls).toEqual(["loop_verification"]);
    expect(found.grantedCalls.every((call) => call.hasGrant === false)).toBe(true);
    expect(run.metadata?.resultVerification).toMatchObject({ status: "confirmed", performed: true, verdict: "answers", basis: "model" });

    // And the check is on the record, at this run's epoch, with the reason it
    // happened -- which the schedule's own sequence would not have given it.
    expect(run.metadata?.resultCheck).toMatchObject({ checked: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.afterRepair, status: "confirmed", epoch: 1 });
    expect(detail?.summary.metadata?.resultCheck).toMatchObject({ checked: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.afterRepair });
  });

  it("carries no manual approval anywhere in the chain that produced it", { timeout: 180_000 }, async () => {
    const found = await harness();
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);

    // The three links of the old circle, each read where it is written. A grant
    // would have forced `manual_approval`, which sets `proposalMode: "manual"`,
    // which makes the gate refuse, which makes the retry decision `null`.
    const attempts = detail?.metadata?.runtimePatchAttempts as Array<{ approvalDecision?: { mode?: string; autoApply?: boolean; requiresManualApproval?: boolean } }> | undefined;
    expect(attempts?.[0]?.approvalDecision).toMatchObject({ mode: "auto", autoApply: true, requiresManualApproval: false });
    const context = detail?.metadata?.runtimeAdaptationContext as { approvalMode?: string } | undefined;
    expect(context?.approvalMode).not.toBe("manual");
    expect(JSON.stringify(detail?.metadata?.runtimeAdaptationContext)).not.toContain("manual_approval");
    expect(detail?.metadata).toMatchObject({ adaptiveRetry: { attempted: true } });
    expect(found.standingCalls).toEqual(["loop_verification"]);
  });

  it("fails the run when the repair produced another wrong answer, which is the whole point of the gate", { timeout: 180_000 }, async () => {
    const found = await harness({ verdict: "no" });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });

    // Two agreeing refusals are what refute (`agreement.ts`), so both calls are
    // the standing authorization's.
    expect(found.standingCalls).toEqual(["loop_verification", "loop_verification"]);
    expect(run.metadata?.resultVerification).toMatchObject({ status: "refuted", performed: true, verdict: "does_not_answer", calls: 2 });
    expect(run.metadata?.resultCheck).toMatchObject({ checked: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.afterRepair, status: "refuted" });
    // Every step of the retry succeeded and the run is failed anyway: a repair
    // that made things no better is now reported as a failure rather than as a
    // success, which is what this gate exists for.
    expect(run.status).toBe("failed");
  });

  it("refuses cleanly when the standing authorization has expired, rather than falling back to anything wider", { timeout: 180_000 }, async () => {
    const found = await harness({ authorization: standingAuthorization({ expiresAtMs: Date.now() - 1 }) });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);

    expect(detail?.metadata).toMatchObject({ adaptiveRetry: { attempted: true, status: "succeeded" } });
    // No key was asked for, no call was made, and the run says which refusal it was.
    expect(found.standingRequests).toEqual([]);
    expect(found.standingCalls).toEqual([]);
    expect(run.metadata?.resultCheck).toMatchObject({ checked: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.expired, status: "unverified" });
    expect(run.metadata?.resultVerification).toMatchObject({ status: "unverified", performed: false, code: "core.result.no_model_available" });
    expect(run.status).toBe("succeeded");
  });

  it("asks nobody and spends nothing when nobody authorized checking at all", { timeout: 180_000 }, async () => {
    const found = await harness({ authorization: undefined });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });

    expect(found.standingRequests).toEqual([]);
    expect(found.standingCalls).toEqual([]);
    expect(run.metadata?.resultCheck).toMatchObject({ checked: false, code: AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES.absent });
  });

  it("does not overrule the person's own off switch, however much it repaired itself", { timeout: 180_000 }, async () => {
    const found = await harness({ schedule: { enabled: false, shape: "every_run", initialRunCount: 3, interval: 5, decay: 5 } });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });

    expect(found.standingRequests).toEqual([]);
    expect(found.standingCalls).toEqual([]);
    expect(run.metadata?.resultCheck).toMatchObject({ checked: false, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.disabled });
  });
});

describe("a person's own grant", () => {
  const grant: AutomationStudioRuntimeSessionGrant = { grantId: "llm-grant:verify", actorUserId: "user.aiden", actorSessionId: "session.live", purpose: "verify_result" };

  it("still judges the result itself, and the standing authorization is never reached", { timeout: 180_000 }, async () => {
    const found = await harness({ clean: true });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId, llmExecution: grant });

    expect(run.status).toBe("succeeded");
    expect(found.grantedCalls).toEqual([{ taskKind: "loop_verification", hasGrant: true }]);
    expect(found.standingRequests).toEqual([]);
    expect(found.standingCalls).toEqual([]);
    expect(run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
  });

  it("still forces manual approval, so a granted run still does not retry", { timeout: 180_000 }, async () => {
    const found = await harness();
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId, llmExecution: { ...grant, grantId: "llm-grant:adapt", purpose: "diagnose_and_adapt" } });
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);

    // Exactly today's behaviour, pinned so the standing path cannot be mistaken
    // for a licence to widen what a person's grant does.
    expect(run.status).toBe("failed");
    expect(detail?.metadata?.adaptiveRetry).toBeUndefined();
    const context = detail?.metadata?.runtimeAdaptationContext as { approvalMode?: string } | undefined;
    expect(context?.approvalMode).toBe("manual");
    expect(found.standingRequests).toEqual([]);
  });
});
