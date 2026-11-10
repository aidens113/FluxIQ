// @fluxiq-test-group real-sql
// Run on a task's Flow, in answer-first mode, every hop real but the attempt itself (t885). A task's
// first attempt keeps its steps with the task and leaves its Flow with no Router, so the project run
// path ended the chat's `run.execute` at once in "Top-level orchestration Flow has no Router-selected
// Subflow execution path" and the thread read "Run failed" (run-mw9xfwvd-ccc692b2). A Run of a task's
// Flow is the task asked for again: one attempt, from where the task starts, told as create-here
// tells one. The stub stands where `service.generateFlowBootstrapAdaptation` runs an attempt.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught, type AutomationStudioTaskAttempt, type AutomationStudioTaskResult } from "@fluxiq/contracts/automation";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation.ts";
import type { AutomationStudioConversationCommandContext, AutomationStudioConversationCommandHost } from "../../../../runtime/conversations/commands/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW, automationStudioConversationCommandPort, automationStudioConversationCommandWork, executeAutomationStudioConversationCommand } from "../../../../runtime/conversations/commands/index.ts";
import { automationStudioAnswerFirstTaskKey, automationStudioAnswerFirstTaskMemoryOf } from "../../../../framework/automation-service/service/answer-first/index.ts";
import { registerAutomationStudioApi } from "../handlers/index.ts";
import { createCacheApiTestService } from "../handlers/tests/test-service.ts";

const ACTOR: ProgramApiActor = { sessionId: "session.person", userId: "user.person", roleId: "role.owner", permissions: ["programs.read", "programs.write", "runtime.control", "flows.write"], channel: "paired-client" };
const TASK = "List my loans";
const WHERE = "https://library.example/account";
const ACHIEVED = "I got what you asked for, and it was checked once against what you asked.";

const cleanups: Array<() => Promise<void>> = [];
beforeEach(() => { vi.stubEnv("FLUXIQ_AUTHORING_MODE", "answer-first"); });
afterEach(async () => {
  vi.unstubAllEnvs();
  await automationStudioConversationCommandWork.idle();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** A project whose task's first attempt saved its steps with the task and left the Flow as it found it: blank, with no Router. */
async function afterFirstAttempt(onScreen: string | null) {
  const { service, cleanup } = await createCacheApiTestService();
  cleanups.push(cleanup);
  const project = await service.createProject({ name: "Run a task's Flow" });
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service);
  const flow = await service.createFlow({ projectId: project.id, name: "Loans" });
  await service.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: TASK });
  const taskId = automationStudioAnswerFirstTaskKey({ instructionText: TASK, startLocation: WHERE });
  const saved = { attemptId: "attempt.1", flowId: flow.flowId, steps: [], stepsDigest: "digest", label: "confirmed" as const, provenWhole: false, savedAtMs: 1, spend: { calls: 1, usd: 0.1 } };
  await automationStudioAnswerFirstTaskMemoryOf(service, { paths: service.projectPaths, projects: service.projects }).update(project.id, taskId, (current) => ({ ...current, flowId: flow.flowId, startLocation: WHERE, latest: saved, attempts: [] }));

  const asked: Array<Record<string, unknown>> = [];
  service.getFlowBootstrapGenerationRuntimeReadiness = (() => ({ providerResolverConfigured: true, nativeNodeRegistryConfigured: true, llmEvidenceRuntime: { bound: true, toolCount: 1, readRowsBound: true } })) as unknown as typeof service.getFlowBootstrapGenerationRuntimeReadiness;
  service.generateFlowBootstrapAdaptation = (async (input: Record<string, unknown>) => {
    asked.push(input);
    const attempt: AutomationStudioTaskAttempt = {
      taskId, attemptId: "attempt.2", ordinal: 2, projectId: project.id, flowId: flow.flowId, runId: "explore.2", path: "run_flow", status: "achieved",
      spend: { calls: 1, inputTokens: 10, outputTokens: 5, usd: 0.01, ms: 10 }, budget: { usd: 5 }, liveSteps: 0, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: 1, endedAtMs: 2
    };
    const result = { attemptId: "attempt.2", kind: "rows", label: "confirmed", timesChecked: 1, source: "flow", acts: [], rows: { runId: "explore.2", datasetId: "loans", totalRows: 1, truncated: false, columns: [{ id: "title", label: "Title" }], previewRows: [{ title: "A book" }] }, checkedWhat: "The loans." } as AutomationStudioTaskResult;
    return { projectId: project.id, flowId: flow.flowId, status: "answered", sourceInstructionIds: [], baseDependencyDigest: "digest", baseSettingsRevision: 1, accounting: {}, attempt, result };
  }) as unknown as typeof service.generateFlowBootstrapAdaptation;

  const turns: Array<{ text: string; attachment: unknown }> = [];
  const host: AutomationStudioConversationCommandHost = {
    appendAutomationTurn: (async (turn: { text: string; attachment: unknown }) => {
      turns.push({ text: turn.text, attachment: turn.attachment });
      return {};
    }) as unknown as AutomationStudioConversationCommandHost["appendAutomationTurn"],
    pendingAsks: async () => [],
    getAsk: async () => null
  };
  const context: AutomationStudioConversationCommandContext = {
    port: automationStudioConversationCommandPort({ registry, actor: ACTOR, scope: {} }),
    host, projectId: project.id, conversationId: "conversation.1", sessionId: ACTOR.sessionId, keyLocked: false, paired: true, startLocation: onScreen
  };
  const read = (endpoint: string, payload: Record<string, unknown>) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: ACTOR, payload }) as Promise<{ ok: boolean; payload?: any; error?: string }>;
  return { service, project, flow, asked, turns, context, read };
}

describe("Run of a task's Flow, on answer-first", () => {
  it("does the task as the same words do and tells the thread its result, never a failed run", async () => {
    const { project, flow, asked, turns, context } = await afterFirstAttempt(WHERE);
    const started = await executeAutomationStudioConversationCommand({ command: AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW, context, arguments: { flowId: flow.flowId } });
    expect(started.status).toBe("started");
    await automationStudioConversationCommandWork.idle();
    expect(turns).toEqual([{ text: ACHIEVED, attachment: { kind: "panel-capability-result", ref: "run.execute" } }]);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ projectId: project.id, flowId: flow.flowId, authoringMode: "answer-first", evidenceGuided: true, startLocation: WHERE });
  });

  it("starts the task where it starts, whatever page is on screen, and carries the attempt's answer", async () => {
    const { flow, asked, context } = await afterFirstAttempt("https://elsewhere.example/news");
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: flow.flowId });
    expect(outcome).toMatchObject({ status: "done", summary: ACHIEVED, flowId: flow.flowId });
    expect(outcome.answered?.result?.rows?.previewRows).toEqual([{ title: "A book" }]);
    expect(asked[0]).toMatchObject({ startLocation: WHERE });
  });

  it("is told by the known-Flow read asked by a Flow; a Flow no task lives under is not a task's, and a gone one is a failed read", async () => {
    const { service, project, flow, read } = await afterFirstAttempt(WHERE);
    expect(await read(AUTOMATION_STUDIO_ENDPOINTS.getTaskKnownFlow, { projectId: project.id, flowId: flow.flowId })).toEqual({ ok: true, payload: { flowId: flow.flowId, startLocation: WHERE } });
    const other = await service.createFlow({ projectId: project.id, name: "Other" });
    expect(await read(AUTOMATION_STUDIO_ENDPOINTS.getTaskKnownFlow, { projectId: project.id, flowId: other.flowId })).toEqual({ ok: true, payload: {} });
    expect((await read(AUTOMATION_STUDIO_ENDPOINTS.getTaskKnownFlow, { projectId: project.id, flowId: "flow.gone" })).ok).toBe(false);
  });

  it("runs a Flow no task lives under as any other Flow, starting no attempt", async () => {
    const { service, project, asked, context } = await afterFirstAttempt(WHERE);
    const other = await service.createFlow({ projectId: project.id, name: "Other" });
    await AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW.run(context, { flowId: other.flowId });
    expect(asked).toEqual([]);
  });
});
