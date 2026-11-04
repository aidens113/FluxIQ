// @fluxiq-test-group real-sql
// The chat's road in answer-first mode, every hop real but the attempt itself (t869): a command run
// the way a person's turn runs it, through the port, the program registry, the endpoint, the request
// reader and back, then the thread reading the attempt by route. The stub stands where
// `service.generateFlowBootstrapAdaptation` runs an attempt, and writes what an attempt writes.
//
// The caller is what a paired extension's token becomes (`apps/web/src/lib/program-route.ts`,
// `pairedClientActor`), and the reads are what its relay sends.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught, parseAutomationStudioTaskAttempt, type AutomationStudioTaskAttempt, type AutomationStudioTaskResult } from "@fluxiq/contracts/automation";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation.ts";
import type { AutomationStudioConversationCommandContext, AutomationStudioConversationCommandHost } from "../../../../runtime/conversations/commands/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE, AUTOMATION_STUDIO_CONVERSATION_EXPLORE, automationStudioConversationCommandPort, automationStudioConversationCommandWork, executeAutomationStudioConversationCommand } from "../../../../runtime/conversations/commands/index.ts";
import { automationStudioAnswerFirstAttemptStoreOf } from "../../../../framework/automation-service/service/answer-first/attempt-store/index.ts";
import { automationStudioAnswerFirstLiveAttemptsOf } from "../../../../framework/automation-service/service/answer-first/interrupted/index.ts";
import type { AutomationStudioService } from "../../../../framework/automation-service/index.ts";
import { registerAutomationStudioApi } from "../handlers/index.ts";
import { createCacheApiTestService } from "../handlers/tests/test-service.ts";

const ACTOR: ProgramApiActor = { sessionId: "session.person", userId: "user.person", roleId: "role.owner", permissions: ["programs.read", "programs.write", "runtime.control", "flows.write"], channel: "paired-client" };
const TRIED = { version: 1 as const, tried: [], approaches: 0 };

const cleanups: Array<() => Promise<void>> = [];
beforeEach(() => { vi.stubEnv("FLUXIQ_AUTHORING_MODE", "answer-first"); });
afterEach(async () => {
  vi.unstubAllEnvs();
  await automationStudioConversationCommandWork.idle();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** A real service and registry, with the attempt stubbed: it writes a working row, lets the test look, then ends as `ending` says. */
async function road(ending: (attempt: AutomationStudioTaskAttempt) => { attempt: AutomationStudioTaskAttempt; result: AutomationStudioTaskResult; candidateId?: string }) {
  const { service, cleanup } = await createCacheApiTestService();
  cleanups.push(cleanup);
  const project = await service.createProject({ name: "The chat's road" });
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service);
  const store = automationStudioAnswerFirstAttemptStoreOf(service, { paths: service.projectPaths, flows: service.flowPaths, projects: service.projects });
  const asked: Array<Record<string, unknown>> = [];
  const whileWorking: { read?: unknown } = {};
  const read = (endpoint: string, payload: Record<string, unknown>) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: ACTOR, payload }) as Promise<{ ok: boolean; payload?: any; error?: string }>;
  const attemptAt = (flowId: string, ordinal: number): AutomationStudioTaskAttempt => ({
    taskId: "task.loans", attemptId: `attempt.${flowId}.${ordinal}`, ordinal, projectId: project.id, flowId, runId: `explore.${ordinal}`, path: "explore", status: "working",
    spend: { calls: 1, inputTokens: 10, outputTokens: 5, usd: 0.11, ms: 10 }, budget: { usd: 5 }, liveSteps: 1, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: Date.now()
  });
  service.getFlowBootstrapGenerationRuntimeReadiness = (() => ({ providerResolverConfigured: true, nativeNodeRegistryConfigured: true, llmEvidenceRuntime: { bound: true, toolCount: 1, readRowsBound: true } })) as unknown as typeof service.getFlowBootstrapGenerationRuntimeReadiness;
  service.generateFlowBootstrapAdaptation = (async (input: Record<string, unknown>) => {
    asked.push(input);
    const flowId = input.flowId as string;
    const working = attemptAt(flowId, asked.length);
    // The attempt is at work in this process while it works, as a real one is (a person's read tells any other as interrupted).
    automationStudioAnswerFirstLiveAttemptsOf(service).claim(working.attemptId);
    await store.save(project.id, flowId, { attempt: working, tried: TRIED });
    whileWorking.read = await read(AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, { projectId: project.id, conversationId: "conversation.1" });
    const ended = ending(working);
    automationStudioAnswerFirstLiveAttemptsOf(service).release(working.attemptId);
    await store.save(project.id, flowId, { attempt: ended.attempt, result: ended.result, tried: TRIED, ...(ended.candidateId ? { candidateId: ended.candidateId } : {}) });
    return { projectId: project.id, flowId, status: "answered", sourceInstructionIds: [], baseDependencyDigest: "digest", baseSettingsRevision: 1, accounting: {}, ...ended };
  }) as unknown as typeof service.generateFlowBootstrapAdaptation;
  const turns: Array<{ text: string; attachment: unknown }> = [];
  const host: AutomationStudioConversationCommandHost = {
    appendAutomationTurn: (async (turn: { text: string; attachment: unknown }) => {
      turns.push({ text: turn.text, attachment: turn.attachment });
      return {};
    }) as unknown as AutomationStudioConversationCommandHost["appendAutomationTurn"],
    pendingAsks: async () => [],
    getAsk: async () => null,
    // What the person typed: Core saves a task only from a person's own words.
    personWords: async () => ({ text: "List my loans", saysWhatToDo: true })
  };
  const context: AutomationStudioConversationCommandContext = {
    port: automationStudioConversationCommandPort({ registry, actor: ACTOR, scope: {} }),
    host, projectId: project.id, conversationId: "conversation.1", sessionId: ACTOR.sessionId, keyLocked: false, paired: true, startLocation: "https://library.example/account", answerTurnId: "turn.answer"
  };
  return { service, project, asked, turns, context, read, whileWorking, attemptAt };
}

const achieved = (working: AutomationStudioTaskAttempt) => ({
  attempt: { ...working, status: "achieved", endedAtMs: working.startedAtMs + 500, spend: { ...working.spend, usd: 0.42, ms: 500 } } as AutomationStudioTaskAttempt,
  result: { attemptId: working.attemptId, kind: "rows", label: "confirmed", timesChecked: 1, source: "exploration", acts: [], rows: { runId: working.runId!, datasetId: "loans", totalRows: 1, truncated: false, columns: [{ id: "title", label: "Title" }], previewRows: [{ title: "A book" }] }, checkedWhat: "The loans." } as AutomationStudioTaskResult,
  candidateId: "candidate.1"
});

describe("a task typed in the chat, on answer-first", () => {
  it("runs on answer-first, carries what the service answered back through the road, and tells the thread", async () => {
    const { project, asked, turns, context } = await road(achieved);
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.run(context, { instruction: "List my loans", name: "Loans" });
    expect(asked[0]).toMatchObject({ projectId: project.id, authoringMode: "answer-first", evidenceGuided: true, startLocation: "https://library.example/account", caller: { actorUserId: "user.person", actorSessionId: "session.person" } });
    // Who asked is the thread's business: the build itself is not told.
    expect(asked[0]).not.toHaveProperty("conversationId");
    expect(outcome).toMatchObject({ status: "done", summary: "I got what you asked for, and it was checked once against what you asked." });
    expect(outcome.answered?.attempt).toMatchObject({ status: "achieved", spend: { usd: 0.42 }, flowId: outcome.flowId });
    expect(outcome.answered?.result?.rows?.previewRows).toEqual([{ title: "A book" }]);
    expect(outcome.answered?.candidateId).toBe("candidate.1");
    expect(turns).toEqual([]);
  });

  it("reaches the thread as a turn when run as a person's turn runs it, in the background", async () => {
    const { turns, context } = await road(achieved);
    const started = await executeAutomationStudioConversationCommand({ command: AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE, context, arguments: { instruction: "List my loans", name: "Loans" } });
    expect(started.status).toBe("started");
    await automationStudioConversationCommandWork.idle();
    expect(automationStudioConversationCommandWork.takeUnreported()).toEqual([]);
    expect(turns).toEqual([{ text: "I got what you asked for, and it was checked once against what you asked.", attachment: { kind: "panel-capability-result", ref: "flow.createHere" } }]);
  });

  it("lets the thread read its attempt back: a working row while it works, the result once it ends, and the one attempt by id", async () => {
    const { project, context, read, whileWorking } = await road(achieved);
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.run(context, { instruction: "List my loans", name: "Loans" });
    const listedWhileWorking = whileWorking.read as { ok: boolean; payload: { outcomes: Array<{ attempt: { status: string } }> } };
    expect(listedWhileWorking.ok).toBe(true);
    expect(listedWhileWorking.payload.outcomes.map((each) => each.attempt.status)).toEqual(["working"]);

    const listed = await read(AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, { projectId: project.id, conversationId: "conversation.1" });
    expect(listed.ok).toBe(true);
    const [told] = listed.payload.outcomes;
    expect(listed.payload.outcomes).toHaveLength(1);
    expect(parseAutomationStudioTaskAttempt(told.attempt).ok).toBe(true);
    expect(told).toMatchObject({ attempt: { status: "achieved", spend: { usd: 0.42 } }, result: { label: "confirmed", rows: { previewRows: [{ title: "A book" }] } }, saved: { state: "partly_works", trust: "unproven", flowId: outcome.flowId } });

    const one = await read(AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, { projectId: project.id, attemptId: told.attempt.attemptId });
    expect(one).toEqual({ ok: true, payload: { outcome: told } });
    expect(await read(AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, { projectId: project.id, conversationId: "conversation.other" })).toEqual({ ok: true, payload: { outcomes: [] } });
  });

  it("does the same from explore on a Flow the person named, and tells a second attempt against the first", async () => {
    const { service, project, context, read } = await road(achieved);
    const flow = await service.createFlow({ projectId: project.id, name: "Loans" });
    await service.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: "List my loans" });
    const first = await AUTOMATION_STUDIO_CONVERSATION_EXPLORE.run(context, { flowId: flow.flowId });
    const second = await AUTOMATION_STUDIO_CONVERSATION_EXPLORE.run(context, { flowId: flow.flowId });
    expect([first.status, second.status]).toEqual(["done", "done"]);
    const listed = await read(AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, { projectId: project.id, conversationId: "conversation.1" });
    expect(listed.payload.outcomes.map((each: { attempt: { ordinal: number } }) => each.attempt.ordinal)).toEqual([1, 2]);
    expect(listed.payload.outcomes[0].comparedTo).toBeUndefined();
    expect(listed.payload.outcomes[1].comparedTo.ordinal).toBe(1);
  });

  it("says a budget-out as a budget-out all the way back, with what it got", async () => {
    const { project, context, read } = await road((working) => ({
      attempt: { ...working, status: "budget_out", endedAtMs: working.startedAtMs + 500 } as AutomationStudioTaskAttempt,
      result: { attemptId: working.attemptId, kind: "partial", label: "unverified", timesChecked: 0, source: "exploration", acts: [], missingWhat: "The budget ran out." } as AutomationStudioTaskResult
    }));
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.run(context, { instruction: "List my loans", name: "Loans" });
    expect(outcome).toMatchObject({ status: "done", summary: "The budget for this ran out before I could confirm it. What I found so far is kept." });
    const { outcomes } = (await read(AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, { projectId: project.id, conversationId: "conversation.1" })).payload;
    expect(outcomes[0]).toMatchObject({ attempt: { status: "budget_out" }, result: { kind: "partial", label: "unverified" } });
    expect(outcomes[0].saved).toBeUndefined();
  });

  it("is refused to a caller without read permission, as a sibling read is", async () => {
    const { project, context, read } = await road(achieved);
    await AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.run(context, { instruction: "List my loans", name: "Loans" });
    expect((await read(AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, { projectId: project.id, conversationId: "conversation.1" })).ok).toBe(true);
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, {} as unknown as AutomationStudioService);
    const refused = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, scope: {}, actor: { ...ACTOR, permissions: [] }, payload: { projectId: project.id, attemptId: "attempt.1" } });
    expect(refused).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
  });
});
