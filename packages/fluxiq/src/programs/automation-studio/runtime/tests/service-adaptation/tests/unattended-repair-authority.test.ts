// A run that fails with nobody watching, and repairs itself.
//
// This is the gate *before* the one `unattended-retry-verification.test.ts`
// holds. That file proves a repair's product is judged; it can only prove it
// because it binds `llmProviderResolver` directly, so a model is available to
// every task kind whether or not a person granted one. The shipped host does
// not do that. `_shared/runtime.ts` binds
//
//     (input) => input.executionGrant ? llmExecutionGrants.resolve(...) : undefined
//
// and `AutomationStudioLlmExecutionGrantService.issue` refuses without a live
// actor session. So in the product, as opposed to in that test's harness, a run
// nobody is watching could not obtain a model to *produce* a repair at all.
//
// Every harness below therefore resolves nothing without a grant, exactly as
// the host does. What funds the repair instead is the Flow's standing
// authorization -- the same record that already funds the unattended check,
// extended with its own repair clause, its own ceiling and the same expiry.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioRuntimeSessionGrant } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { automationStudioRecoveryPermissionGate } from "../../../recovery/index.ts";
import { AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES } from "../../../result-check-authorization/index.ts";
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

function standingAuthorization(overrides: JsonObject = {}): JsonObject {
  return {
    authorizedByUserId: "user.aiden",
    unlockSessionId: "session.unlock.1",
    keyId: "key.deepseek",
    maxTotalCostUsd: 1,
    maxCostUsdPerCall: 0.05,
    grantedAtMs: Date.now() - 1000,
    expiresAtMs: Date.now() + 90 * 24 * 60 * 60 * 1000,
    repair: { enabled: true, maxCostUsdPerRun: 0.25 },
    ...overrides
  };
}

/** The record as every authorization stored before the repair clause existed reads back: checking only. */
function checkOnlyAuthorization(): JsonObject {
  const { repair: _repair, ...rest } = standingAuthorization();
  return rest;
}

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-unattended-repair-"));
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
  /** Every request the host was asked to resolve a standing model for. */
  standingRequests: Array<{ keyId: string; maxEstimatedCostUsd: number; authorizedByUserId: string }>;
  /** The task kinds the standing provider was actually asked to run. */
  standingCalls: string[];
  /** The task kinds the *grant* resolver was asked for, and whether a grant came with each. */
  grantedCalls: Array<{ taskKind: string; hasGrant: boolean }>;
};

async function harness(options: {
  authorization?: JsonObject | undefined;
  clean?: boolean;
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

  // The model a standing authorization buys. One provider, whatever it is asked
  // for -- the host reveals a key and builds a DeepSeek provider; it does not
  // know or care what task kind Core will run on it, which is why the scope has
  // to bind before the host is reached at all.
  const standing: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "standing" },
    runTask: async (request) => {
      standingCalls.push(request.taskKind);
      if (request.taskKind === "runtime_patch") {
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
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "yes" } }, usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.0015 } };
      }
      return { response: { kind: "diagnosis", summary: "The drift action needs a retry setting." }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 } };
    }
  };

  const service = new AutomationStudioService({
    dataDir: tempRoot,
    seedFixture: false,
    // Exactly what `_shared/runtime.ts` binds: nothing without a person's grant,
    // because the grant service refuses without a live actor session.
    llmProviderResolver: (resolverInput) => resolverInput.executionGrant
      ? {
        provider: {
          metadata: { provider: "mock", model: "granted" },
          runTask: async (request) => {
            grantedCalls.push({ taskKind: request.taskKind, hasGrant: true });
            if (request.taskKind === "runtime_patch") {
              await addRepairedStep?.();
              return {
                response: { kind: "runtime_patch", summary: "Granted repair.", riskLevel: "low", patches: [{ kind: "temporary_wait_retry", targetNodeId: "drift", retryCount: 2, timeoutMs: 100, reason: "Granted." }] },
                usage: { inputTokens: 10, outputTokens: 6, totalTokens: 16, estimatedCostUsd: 0.002 }
              };
            }
            if (request.taskKind === "loop_verification") {
              return { response: { kind: "diagnosis", summary: "Judged by the grant.", diagnosis: { answersRequest: "yes" } }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 } };
            }
            return { response: { kind: "diagnosis", summary: "Granted diagnosis." }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 } };
          }
        }
      }
      : undefined,
    resultCheckProviderResolver: (request) => {
      standingRequests.push({ keyId: request.keyId, maxEstimatedCostUsd: request.maxEstimatedCostUsd, authorizedByUserId: request.authorizedByUserId });
      return { provider: standing, maxEstimatedCostUsd: request.maxEstimatedCostUsd };
    }
  }).bindIoRuntime(io, "example").bindNativeNodeRuntime(native);
  services.add(service);

  const base = adaptiveTrainingMetadata();
  const authorization = "authorization" in options ? options.authorization : standingAuthorization();
  const project = await service.createProject({ name: "Unattended repair", domainId: "example" });
  const created = await service.createFlow({ projectId: project.id, flowId: "flow.unattended-repair", name: "Unattended repair Flow" });
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...created,
      metadata: {
        ...(created.metadata ?? {}),
        ...base,
        trainingModeSettings: {
          ...(base.trainingModeSettings as JsonObject),
          resultCheck: { schedule: { enabled: true, shape: "every_run", initialRunCount: 3, interval: 5, decay: 5 }, ...(authorization ? { authorization } : {}) }
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


describe("a run that fails with nobody watching", () => {
  it("obtains a model, repairs itself, retries, and has that retry judged -- with no grant and no actor session", { timeout: 180_000 }, async () => {
    const found = await harness();
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);

    // Nothing in this chain was granted. The host resolver was never asked for
    // anything, because it answers nothing without a grant and there is none.
    expect(found.grantedCalls).toEqual([]);

    // The whole loop, in the order it happened: diagnose, patch, then judge the
    // retry's own product. Before this change the first two never happened and
    // the third was never reached, because a failed run has no result to judge.
    expect(found.standingCalls).toEqual(["runtime_diagnosis", "runtime_patch", "loop_verification"]);
    // Two redemptions, each at its own ceiling: the repair's per-run purse and
    // the check's per-call one, drawn on one authorization.
    expect(found.standingRequests).toEqual([
      { keyId: "key.deepseek", maxEstimatedCostUsd: 0.25, authorizedByUserId: "user.aiden" },
      { keyId: "key.deepseek", maxEstimatedCostUsd: 0.05, authorizedByUserId: "user.aiden" }
    ]);

    // The patch landed and the run re-ran.
    expect(detail?.metadata).toMatchObject({ adaptiveRetry: { attempted: true, status: "succeeded", attemptCount: 1 } });
    // And the gate after this one, which t108 built, now has something to judge.
    expect(run.metadata?.resultCheck).toMatchObject({ checked: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.afterRepair, status: "confirmed" });
    expect(run.metadata?.resultVerification).toMatchObject({ status: "confirmed", performed: true, verdict: "answers", basis: "model" });
    expect(run.status).toBe("succeeded");
  });

  it("records what the repair was authorized to spend, and what the one purse had left", { timeout: 180_000 }, async () => {
    const found = await harness();
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);
    const gate = detail?.metadata?.llmGate as { repairAuthority?: JsonObject; costAccounting?: { estimatedCostUsd?: number } } | undefined;

    // Visible on the run, not only in the code: which key paid, what the
    // ceiling was, what the kinds were, and what was left when it was redeemed.
    expect(gate?.repairAuthority).toMatchObject({
      redeemed: true,
      keyId: "key.deepseek",
      authorizedByUserId: "user.aiden",
      taskKinds: ["runtime_diagnosis", "evidence_tool_decision", "runtime_patch"],
      maxEstimatedCostUsdPerRun: 0.25,
      remainingCostUsd: 1
    });
    // And bounded: what it actually spent is well under the ceiling it was given.
    expect(gate?.costAccounting?.estimatedCostUsd).toBeLessThanOrEqual(0.25);

    // The ceiling binds because something decrements it. `spentUsd` is summed
    // from the Flow's finished runs' `tokenUsage.estimatedCostUsd`, so this is
    // the link between "there is a limit" and "the limit is reached": the
    // repair's two calls and the check's one are all in the run's own total.
    expect(detail?.summary.tokenUsage?.estimatedCostUsd).toBeCloseTo(0.001 + 0.002 + 0.0015, 10);
    expect(run.status).toBe("succeeded");
  });
});

describe("what the standing authorization refuses", () => {
  it("does not repair when the person authorized checking and not repairing, and says which refusal it was", { timeout: 180_000 }, async () => {
    // The clause absent is what every authorization stored before it existed
    // reads back as, so this is the migration case too: turning checking on
    // never silently turned repairing on.
    const found = await harness({ authorization: checkOnlyAuthorization() });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);

    expect(found.standingRequests).toEqual([]);
    expect(found.standingCalls).toEqual([]);
    expect(detail?.metadata?.llmGate).toMatchObject({
      providerConfigured: false,
      repairAuthority: { redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.disabled }
    });
    // The run finished, as the failed run it already was. It did not hang, and
    // it did not file a diagnosis for somebody to read in the morning.
    expect(run.status).toBe("failed");
  });

  it("does not repair when the clause is switched off", { timeout: 180_000 }, async () => {
    const found = await harness({ authorization: standingAuthorization({ repair: { enabled: false, maxCostUsdPerRun: 0.25 } }) });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);

    expect(found.standingRequests).toEqual([]);
    expect(detail?.metadata?.llmGate).toMatchObject({ repairAuthority: { redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.disabled } });
    expect(run.status).toBe("failed");
  });

  it("does not repair once the ceiling cannot cover a whole repair, and never asks the host for the key", { timeout: 180_000 }, async () => {
    // Ten cents left against a twenty-five cent repair. Half a repair is still
    // billed and has changed nothing, so it is refused rather than started.
    const found = await harness({ authorization: standingAuthorization({ maxTotalCostUsd: 0.1 }) });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);

    expect(found.standingRequests).toEqual([]);
    expect(found.standingCalls).toEqual([]);
    expect(detail?.metadata?.llmGate).toMatchObject({ repairAuthority: { redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.exhausted } });
    expect(run.status).toBe("failed");
  });

  it("does not repair once the authorization has expired, which stops checking and repairing together", { timeout: 180_000 }, async () => {
    const found = await harness({ authorization: standingAuthorization({ expiresAtMs: Date.now() - 1 }) });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);

    expect(found.standingRequests).toEqual([]);
    expect(detail?.metadata?.llmGate).toMatchObject({ repairAuthority: { redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.expired } });
    expect(run.status).toBe("failed");
  });

  it("does not repair when nobody authorized anything at all", { timeout: 180_000 }, async () => {
    const found = await harness({ authorization: undefined });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);

    expect(found.standingRequests).toEqual([]);
    expect(detail?.metadata?.llmGate).toMatchObject({ repairAuthority: { redeemed: false, code: AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES.absent } });
    expect(run.status).toBe("failed");
  });
});

describe("a repair the standing authorization paid for", () => {
  it("is granted no authority to act, so a lasting consequence is still the person's to allow", { timeout: 180_000 }, async () => {
    const found = await harness();
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId });
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);

    // Paying for the model is not permission to act. The resolution carries no
    // `permittedConsequences`, so the recovery gate is built with nothing
    // granted -- and the repair call is told so, rather than finding out by
    // being refused.
    expect((detail?.metadata?.llmGate as { permissions?: JsonObject } | undefined)?.permissions).toEqual({ granted: [], instructed: [], lapsed: [] });
    expect(run.status).toBe("succeeded");
  });

  it("meets a request rather than a silent refusal when it tries to spend money", async () => {
    // The gate exactly as `annotate.ts` builds it for a standing-funded repair:
    // `granted` is what the resolution carried, which is nothing, and
    // `answerable` is set because the run has somewhere to put the question.
    const permissions = automationStudioRecoveryPermissionGate({
      granted: undefined,
      storedInstructed: undefined,
      instructions: [],
      answerable: true,
      // What the repair was shown, so the request may name a control from it.
      failureEvidence: { controls: ["Place order"] }
    });
    const verdict = await permissions.gate.checkFor({ kind: "flow_step", id: "checkout", ref: "step.checkout" })({
      consequences: ["move_money"],
      control: { name: "Place order", kind: "button" },
      verb: "press"
    });

    expect(verdict.permitted).toBe(false);
    // Escalated rather than silently failed: a request with a sentence for the
    // person, and the run not ended on it because there is a thread to ask in.
    expect(permissions.gate.request?.missing).toEqual(["move_money"]);
    expect(permissions.gate.request?.sentence).toContain("Place order");
    expect(permissions.gate.signal.aborted).toBe(false);
    expect(permissions.summary()).toEqual({ granted: [], instructed: [], lapsed: [] });
  });
});

describe("a person's own grant", () => {
  const grant: AutomationStudioRuntimeSessionGrant = { grantId: "llm-grant:verify", actorUserId: "user.aiden", actorSessionId: "session.live", purpose: "verify_result" };

  it("still judges a clean run's result itself, and the standing authorization is never reached", { timeout: 180_000 }, async () => {
    const found = await harness({ clean: true });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId, llmExecution: grant });

    expect(run.status).toBe("succeeded");
    expect(found.grantedCalls).toEqual([{ taskKind: "loop_verification", hasGrant: true }]);
    expect(found.standingRequests).toEqual([]);
    expect(found.standingCalls).toEqual([]);
    expect(run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
  });

  it("still forces manual approval and still does not retry, and the repair authority is never consulted", { timeout: 180_000 }, async () => {
    const found = await harness();
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId, llmExecution: { ...grant, grantId: "llm-grant:adapt", purpose: "diagnose_and_adapt" } });
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);

    // Exactly today's behaviour. A granted run resolves its model from the
    // grant, so the standing path is never even asked -- which is what makes
    // "a person's grant behaves as it did" structural rather than incidental.
    expect(run.status).toBe("failed");
    expect(detail?.metadata?.adaptiveRetry).toBeUndefined();
    expect((detail?.metadata?.runtimeAdaptationContext as { approvalMode?: string } | undefined)?.approvalMode).toBe("manual");
    expect(found.grantedCalls.every((call) => call.hasGrant === true)).toBe(true);
    expect(found.standingRequests).toEqual([]);
    expect((detail?.metadata?.llmGate as { repairAuthority?: unknown } | undefined)?.repairAuthority).toBeUndefined();
  });
});
