// Which of a run's result checks its caller pays for (MVP item 23).
//
// A run a person asked the model into has always had its result judged with
// that person's key, on every run. The paired extension's Automations Run is
// such a run, and routine sampling is not something its person agreed to pay
// for: `resultCheckCallerPays: "repair_checks"` keeps the caller's key to the
// checks that judge a repair, and leaves routine sampling to the Flow's
// standing result-check authorization (`service/runtime-adaptation/result-check.ts`).
//
// The harness is `unattended-retry-verification.test.ts`'s, cut to what these
// cases read: a Flow whose drift step fails until a `temporary_wait_retry`
// repair lands and the resumed retry succeeds, or, `clean`, a Flow that
// succeeds first time and repairs nothing. The caller's provider counts every
// `loop_verification` it is asked to run; the standing resolver counts every
// redemption it is asked for.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../../_shared/api.ts";
import { registerAutomationStudioApi } from "../../../../api/handlers/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW, automationStudioConversationCommandPort } from "../../../conversations/commands/index.ts";
import type { AutomationStudioRuntimeSessionLlm } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
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

/** Checks runs 5, 10, 15 and never run 1, so a first run is checked only because it repaired itself. */
const SEQUENCE_SKIPS_RUN_ONE = { enabled: true, shape: "fixed_interval", initialRunCount: 0, interval: 5, decay: 5 };
/** Checks every run, so the first run is a routine sample. */
const EVERY_RUN = { enabled: true, shape: "every_run", initialRunCount: 3, interval: 5, decay: 5 };

const llmExecution: AutomationStudioRuntimeSessionLlm = { actorUserId: "user.aiden", actorSessionId: "session.live", intent: "explore_and_adapt" };

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-caller-paid-check-"));
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
  /** The task kinds the caller's provider ran, and whether a caller came with each. */
  callerCalls: Array<{ taskKind: string; hasCaller: boolean }>;
  /** Every redemption of the standing authorization the host was asked to resolve. */
  standingCalls: string[];
};

async function harness(options: { clean?: boolean; schedule?: JsonObject; standing?: boolean } = {}): Promise<Harness> {
  const callerCalls: Harness["callerCalls"] = [];
  const standingCalls: string[] = [];
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
  const service = new AutomationStudioService({
    dataDir: tempRoot,
    seedFixture: false,
    llmProviderResolver: (resolverInput) => ({
      metadata: { provider: "mock", model: "caller" },
      runTask: async (request) => {
        callerCalls.push({ taskKind: request.taskKind, hasCaller: Boolean(resolverInput.caller) });
        if (request.taskKind === "runtime_patch") {
          return {
            response: { kind: "runtime_patch", summary: "Retry the drift action once the state settles.", riskLevel: "low", patches: [{ kind: "temporary_wait_retry", targetNodeId: "drift", retryCount: 2, timeoutMs: 100, reason: "The action succeeds after a deterministic retry setting." }] },
            usage: { inputTokens: 10, outputTokens: 6, totalTokens: 16, estimatedCostUsd: 0.002 }
          };
        }
        if (request.taskKind === "loop_verification") {
          return { response: { kind: "diagnosis", summary: "Judged for the caller.", diagnosis: { answersRequest: "yes" } }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 } };
        }
        return { response: { kind: "diagnosis", summary: "The drift action needs a retry setting." }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 } };
      }
    }),
    resultCheckProviderResolver: (request) => ({
      provider: {
        metadata: { provider: "mock", model: "standing-judge" },
        runTask: async (task) => {
          standingCalls.push(task.taskKind);
          return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "yes" } }, usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.0015 } };
        }
      },
      maxEstimatedCostUsd: request.maxEstimatedCostUsd
    })
  }).bindIoRuntime(io, "example").bindNativeNodeRuntime(native);
  services.add(service);

  const base = adaptiveTrainingMetadata();
  const authorization = { authorizedByUserId: "user.aiden", unlockSessionId: "session.unlock.1", keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 24 * 60 * 60 * 1000 };
  const project = await service.createProject({ name: "Caller-paid result check", domainId: "example" });
  const created = await service.createFlow({ projectId: project.id, flowId: "flow.caller-paid-check", name: "Caller-paid check Flow" });
  await service.saveFlow({
    projectId: project.id,
    flow: { ...created, metadata: { ...(created.metadata ?? {}), ...base, trainingModeSettings: { ...(base.trainingModeSettings as JsonObject), resultCheck: { schedule: options.schedule ?? SEQUENCE_SKIPS_RUN_ONE, ...(options.standing ? { authorization } : {}) } } } }
  });
  const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: created.flowId, name: "Primary", role: "primary" });
  const blank = await service.getFlow(project.id, subflow.graphFlowId!);
  const chain = ["start", "extract", ...(options.clean ? [] : ["drift"]), "end"];
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
      edges: chain.slice(1).map((target, index) => ({ id: `${chain[index]}.${target}`, sourceNodeId: chain[index]!, sourcePortId: "success", targetNodeId: target, targetPortId: "in" }))
    }
  });
  await service.setFlowMapFallback({ projectId: project.id, flowId: created.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  return { service, projectId: project.id, flowId: created.flowId, callerCalls, standingCalls };
}

const verifications = (found: Harness) => found.callerCalls.filter((call) => call.taskKind === "loop_verification");

describe("a run whose caller pays only for the checks that judge a repair", () => {
  it("makes no result-check call for a routine run that succeeded with nothing repaired", { timeout: 180_000 }, async () => {
    const found = await harness({ clean: true });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId, llmExecution, resultCheckCallerPays: "repair_checks" });

    expect(run.status).toBe("succeeded");
    expect(verifications(found)).toEqual([]);
    expect(found.standingCalls).toEqual([]);
    expect(run.metadata?.resultVerification).toMatchObject({ performed: false, code: "core.result.no_model_available" });
  });

  it("leaves a routine sample to the Flow's standing authorization, never the caller's key", { timeout: 180_000 }, async () => {
    const found = await harness({ clean: true, schedule: EVERY_RUN, standing: true });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId, llmExecution, resultCheckCallerPays: "repair_checks" });

    expect(run.status).toBe("succeeded");
    expect(verifications(found)).toEqual([]);
    expect(found.standingCalls).toEqual(["loop_verification"]);
    expect(run.metadata?.resultCheck).toMatchObject({ checked: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.initialWindow });
  });

  // With a standing authorization available, so the record carries the
  // schedule's own `after_repair` decision and the caller's key still wins it.
  // The fix is held at the failing step and the run carries on in place (C6 step 8): the run that is judged is the repaired run itself.
  it("judges a run repaired at its failing step with the caller's key", { timeout: 180_000 }, async () => {
    const found = await harness({ standing: true });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId, llmExecution, resultCheckCallerPays: "repair_checks" });
    const detail = await found.service.getFlowRunDetail(found.projectId, run.runId);

    expect(detail?.metadata).not.toHaveProperty("adaptiveRetry");
    expect(run.trace?.repairs).toHaveLength(1);
    expect(detail?.metadata?.inRunRepairs).toEqual([expect.objectContaining({ kind: "temporary_wait_retry", outcome: "overlaid", repairId: run.trace?.repairs?.[0] })]);
    expect(verifications(found)).toEqual([{ taskKind: "loop_verification", hasCaller: true }]);
    expect(found.standingCalls).toEqual([]);
    expect(run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
    expect(run.metadata?.resultCheck).toMatchObject({ checked: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.afterRepair, status: "confirmed" });
  });
});

// The chat's "Run it": the command's calls reach the run endpoint as the
// person's own session -- a paired token's actor becomes the person under their
// unlocked session (`api/handlers/conversations.ts` `commandContext`), and a
// web-panel conversation is the person already -- so the endpoint cannot tell a
// chat's run from a direct caller's, and the command asks for `repair_checks`
// itself, paired or not. Real registry, real handlers, real service.

/** The person's actor, as a command's calls carry it. */
const asPerson: ProgramApiActor = { sessionId: "session.live", userId: "user.aiden", roleId: "operator", permissions: ["programs.read", "programs.write", "runtime.control", "flows.write"] };

async function runFromChat(found: Harness, options: { paired: boolean } = { paired: true }) {
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, found.service);
  const host = { async appendAutomationTurn(): Promise<never> { throw new Error("Run it writes no turn of its own"); }, async pendingAsks() { return []; }, async getAsk() { return null; } };
  return await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run({
    port: automationStudioConversationCommandPort({ registry, actor: asPerson, scope: { domainId: "example" } }),
    host, projectId: found.projectId, conversationId: "conversation.chat", sessionId: asPerson.sessionId, keyLocked: false, paired: options.paired, startLocation: null
  }, { flowId: found.flowId });
}

describe("the chat's Run it, asked from a paired extension", () => {
  it("makes no routine result-check call on the person's key", { timeout: 180_000 }, async () => {
    const found = await harness({ clean: true, schedule: EVERY_RUN });
    const outcome = await runFromChat(found);

    expect(outcome.status, outcome.summary).toBe("done");
    expect(verifications(found)).toEqual([]);
    expect(found.standingCalls).toEqual([]);
  });

  it("lets the model repair a broken step, and judges that repair with the person's key", { timeout: 180_000 }, async () => {
    const found = await harness({ standing: true });
    const outcome = await runFromChat(found);

    expect(outcome.status, outcome.summary).toBe("done");
    expect(found.callerCalls.some((call) => call.taskKind === "runtime_patch" && call.hasCaller)).toBe(true);
    expect(verifications(found)).toEqual([{ taskKind: "loop_verification", hasCaller: true }]);
    expect(found.standingCalls).toEqual([]);
  });
});

// MVP item 23 for the web panel: a conversation there has no pairing, and its
// Run it pays the person's key only for the checks that judge a repair, too.
describe("the chat's Run it, asked from a session that is not paired", () => {
  it("makes no model call at all on the person's key when the run succeeded with nothing repaired", { timeout: 180_000 }, async () => {
    const found = await harness({ clean: true });
    const outcome = await runFromChat(found, { paired: false });

    expect(outcome.status, outcome.summary).toBe("done");
    expect(outcome.summary).toBe("\"Caller-paid check Flow\" ran all the way through.");
    expect(found.callerCalls).toEqual([]);
    expect(found.standingCalls).toEqual([]);
  });

  it("still judges a repaired run with the person's key", { timeout: 180_000 }, async () => {
    const found = await harness({ standing: true });
    const outcome = await runFromChat(found, { paired: false });

    expect(outcome.status, outcome.summary).toBe("done");
    expect(found.callerCalls.some((call) => call.taskKind === "runtime_patch" && call.hasCaller)).toBe(true);
    expect(verifications(found)).toEqual([{ taskKind: "loop_verification", hasCaller: true }]);
    expect(found.standingCalls).toEqual([]);
  });
});

describe("a run whose caller pays for every check, as before", () => {
  it("is judged with the caller's key even when the schedule would not sample it", { timeout: 180_000 }, async () => {
    const found = await harness({ clean: true });
    const run = await found.service.runRuntimeSession({ projectId: found.projectId, flowId: found.flowId, llmExecution });

    expect(run.status).toBe("succeeded");
    expect(verifications(found)).toEqual([{ taskKind: "loop_verification", hasCaller: true }]);
    expect(found.standingCalls).toEqual([]);
    expect(run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
  });
});
