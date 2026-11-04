// @fluxiq-test-group real-sql
// The double act, through the real service (t861, plan D6). A scripted model builds a
// Flow whose one step presses a stub target that counts presses; the build's own trial
// presses it; the Flow is approved and applied; and then it is run, as a person would
// after a build that "worked".
//
// Case (a) is the probe of today's path, and states what it finds. Case (b) is the same
// build with an attempt's act record in place: the first run does not press again and
// says so, and a second, deliberate run does press.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActGate } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../../../../runtime/automation-activity/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../../../../runtime/llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../../../../runtime/native-nodes/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioService } from "../../../../service.ts";
import { caller, judgeReply, mockProvider } from "../../../../tests/service-bootstrap/tests/fixtures.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../../paths/index.ts";
import { AutomationStudioAnswerFirstRunActsUnreadable, automationStudioAnswerFirstRunActStoreOf } from "../index.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const PRESS_ID = "domain.example.press";
const TARGET: JsonObject = { selector: "#save", element: { tag: "button", text: "Save it" } };

const PRESS: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: PRESS_ID, version: "1.0.0", label: "Press", description: "Press a control.", category: "action",
  source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: PRESS_ID },
  availability: { kind: "domain", domainId: "example" }, requiredRuntimeCapabilities: ["example.actions"], capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any", required: false }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "selector", label: "Selector", valueType: "string", required: false }, { id: "element", label: "Element", valueType: "object", required: false }],
  safety: { requiredPermissions: [] }
};

const PLAN = {
  schemaVersion: "0.1" as const,
  router: { name: "Instruction router", rules: [], fallback: { kind: "subflow" as const, targetSubflowKey: "primary" } },
  subflows: [{
    key: "primary", name: "Primary", role: "primary" as const,
    nodes: [
      { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
      { key: "press", definitionId: PRESS_ID, definitionVersion: "1.0.0", parameters: TARGET, consequences: ["create_new"] },
      { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
    ],
    edges: [
      { key: "start_press", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "press", portId: "in" } },
      { key: "press_end", source: { nodeKey: "press", portId: "success" }, target: { nodeKey: "end", portId: "in" } }
    ]
  }]
};

/** A candidate build that looks once, submits the press, tests it on two judged yeses and completes; then the chat approves and applies it. */
async function appliedPressFlow() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-double-act-"));
  const counter = { presses: 0 };
  const native = new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register({
    schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [PRESS]
  }, {
    packageId: "example.package", packageVersion: "1.0.0",
    implementations: {
      [PRESS_ID]: () => {
        counter.presses += 1;
        return { status: "success", route: "success", outputs: { success: true } };
      }
    }
  });
  let decisions = 0;
  const provider = mockProvider(async (request: AutomationStudioLlmTaskRequest) => {
    if (request.taskKind === "loop_verification") return judgeReply("yes");
    decisions += 1;
    const latest = [...(request.context.evidenceLoop?.evidence ?? [])].reverse().find((entry) => entry.toolId === "core.submit_candidate")?.value as { revision?: number; digest?: string } | undefined;
    const decision = decisions === 1 ? { kind: "tool_call", callId: "look", toolId: "inspect", input: {} }
      : decisions === 2 ? { kind: "tool_call", callId: "submit", toolId: "core.submit_candidate", input: { summary: "Press the control", plan: PLAN } }
      : decisions === 3 ? { kind: "tool_call", callId: "test", toolId: "core.test_candidate", input: { revision: latest?.revision, digest: latest?.digest } }
      : { kind: "complete", result: { revision: latest?.revision, digest: latest?.digest } };
    return { response: { kind: "evidence_tool_decision", summary: "Scripted", decision }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
  });
  const service = new AutomationStudioService({
    dataDir,
    llmProviderResolver: () => ({ provider, maxCallsPerRun: 12, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: {
      domainId: "example", deniedEvidenceKeys: [],
      resolvePlanNodeParameters: ({ parameters }) => ({ status: "resolved", parameters }),
      tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { looked: true }, effectApplied: false, targetsUnchanged: true })
    }
  });
  service.bindNativeNodeRuntime(native);
  cleanups.push(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });
  const project = await service.createProject({ name: "Double act", domainId: "example" });
  const flow = await service.createFlow({ projectId: project.id, flowId: "flow.generated", name: "Press" });
  const now = Date.now();
  await service.saveFlowInstruction(project.id, {
    schemaVersion: "0.1", instructionId: "instruction.build", title: "Save it", body: "Save the item.",
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId }, priority: 100, status: "active", requirement: "required", tags: ["generation"], createdAt: now, updatedAt: now
  });
  const result = await service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "candidate", permittedConsequences: ["create_new"] });
  if (result.status !== "proposed") throw new Error(`expected a proposal, got ${result.status}: ${JSON.stringify(result).slice(0, 400)}`);
  await service.reviewFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: result.adaptationId, action: "approve", actorId: "user.test" });
  await service.reviewFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, adaptationId: result.adaptationId, action: "apply", actorId: "user.test" });
  return { service, projectId: project.id, flowId: flow.flowId, counter };
}

/** The service's act store, as `service.ts` reaches it: under another owner, a second store over the same files, as a restart would have. */
function serviceStore(service: AutomationStudioService, owner: object = service) {
  const owned = service as unknown as Parameters<typeof automationStudioAnswerFirstRunActStoreOf>[1] & { projectPaths: AutomationStudioProjectPaths; flowPaths: AutomationStudioFlowPaths };
  return automationStudioAnswerFirstRunActStoreOf(owner, { paths: owned.projectPaths, flows: owned.flowPaths, projects: owned.projects });
}

/** The act as an attempt's exploration left it: the same call through the real gate, with the record persisted beside the Flow. */
async function attemptPressedOnce(service: AutomationStudioService, projectId: string, flowId: string, counter: { presses: number }): Promise<void> {
  const store = serviceStore(service);
  const record = new AutomationStudioAttemptActRecord({ persist: (data) => store.save(projectId, flowId, data) });
  const execute = automationStudioAttemptActGate({
    record,
    executeTool: async (call: { callId: string; toolId: string; value: JsonObject }) => {
      counter.presses += 1;
      return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, pageChanged: true }, effectApplied: true, draft: { actionId: PRESS_ID, effect: "mutate" as const, input: call.value, ranWith: { node: PRESS_ID, parameters: TARGET, consequences: ["create_new"] } } };
    }
  });
  await execute({ callId: "call.press", toolId: "core.run_node", value: { node: PRESS_ID, parameters: { target: { handle: "t7" } }, consequences: ["create_new"] } });
  await record.flushed();
}

const started = async (service: AutomationStudioService, projectId: string, flowId: string, seen: ClientGatewayActivity[] = []) => {
  const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
  try {
    return await runWithAutomationStudioActivity({ kind: "run", id: "run.activity", projectId }, () => service.runRuntimeSession({ projectId, flowId, adaptiveMode: "no_llm_intervention", authorizedDomainIds: ["example"] }));
  } finally {
    unsubscribe();
  }
};

describe("a lasting act and the first run after it", () => {
  it("(a) on today's path the build's trial presses once and the applied Flow's run presses again", async () => {
    const { service, projectId, flowId, counter } = await appliedPressFlow();
    expect(counter.presses).toBe(1);
    const run = await started(service, projectId, flowId);
    expect(run.status).toBe("succeeded");
    // The double act exists: one instruction, one person's ask, two presses.
    expect(counter.presses).toBe(2);
  });

  it("(b) with an act record in place the run does not press again and says so; a second run presses", async () => {
    const { service, projectId, flowId, counter } = await appliedPressFlow();
    await attemptPressedOnce(service, projectId, flowId, counter);
    const before = counter.presses;

    const seen: ClientGatewayActivity[] = [];
    const first = await started(service, projectId, flowId, seen);
    expect(first.status).toBe("succeeded");
    expect(counter.presses).toBe(before);
    const skipped = seen.filter((event) => event.detail?.skipped?.reason === "already_done");
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.detail?.title).toMatch(/^Already done/u);

    const second = await started(service, projectId, flowId);
    expect(second.status).toBe("succeeded");
    expect(counter.presses).toBe(before + 1);
  });

  it("(b) a first run that stopped before the act spends nothing: running it again still does not press", async () => {
    const { service, projectId, flowId, counter } = await appliedPressFlow();
    await attemptPressedOnce(service, projectId, flowId, counter);
    const before = counter.presses;
    const stopped = await service.runRuntimeSession({ projectId, flowId, adaptiveMode: "no_llm_intervention", authorizedDomainIds: ["example"], maxSteps: 1 });
    expect(stopped.status).toBe("failed");
    expect(counter.presses).toBe(before);
    const again = await started(service, projectId, flowId);
    expect(again.status).toBe("succeeded");
    expect(counter.presses).toBe(before);
    const deliberate = await started(service, projectId, flowId);
    expect(deliberate.status).toBe("succeeded");
    expect(counter.presses).toBe(before + 1);
  });

  it("(b) carries across a restart of the service, and is taken once across it too", async () => {
    const { service, projectId, flowId, counter } = await appliedPressFlow();
    await attemptPressedOnce(service, projectId, flowId, counter);
    const before = counter.presses;
    const other = serviceStore(service, {});
    expect((await other.get(projectId, flowId))?.acts).toHaveLength(1);
    await expect(other.forRun(projectId, flowId, "run.other")).resolves.toMatchObject({ acts: [{ state: "landed" }] });
    // Taken by the run a fresh store just gave them to, so this service's next run acts normally.
    const run = await started(service, projectId, flowId);
    expect(run.status).toBe("succeeded");
    expect(counter.presses).toBe(before + 1);
  });

  it("refuses one run when the record cannot be read, in case it repeats what the record holds; the next run goes ahead", async () => {
    const { service, projectId, flowId, counter } = await appliedPressFlow();
    await attemptPressedOnce(service, projectId, flowId, counter);
    const before = counter.presses;
    const owned = service as unknown as { flowPaths: AutomationStudioFlowPaths };
    await writeFile(path.join(owned.flowPaths.flowDirectory(projectId, flowId), "attempt-acts.json"), "{ not json");
    await expect(started(service, projectId, flowId)).rejects.toBeInstanceOf(AutomationStudioAnswerFirstRunActsUnreadable);
    expect(counter.presses).toBe(before);
    const next = await started(service, projectId, flowId);
    expect(next.status).toBe("succeeded");
    expect(counter.presses).toBe(before + 1);
  });

  it("leaves a run with no record exactly as it was: no file, no gate", async () => {
    const { service, projectId, flowId, counter } = await appliedPressFlow();
    const store = serviceStore(service);
    await expect(store.get(projectId, flowId)).resolves.toBeUndefined();
    const before = counter.presses;
    await started(service, projectId, flowId);
    expect(counter.presses).toBe(before + 1);
    await expect(store.get(projectId, flowId)).resolves.toBeUndefined();
  });
});
