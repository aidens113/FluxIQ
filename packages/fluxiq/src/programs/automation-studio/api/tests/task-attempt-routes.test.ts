// @fluxiq-test-group real-sql
// Covers handlers/task-attempts.ts: a task's attempts read back by attempt and by thread, on a real
// service's disk. What Core cannot read is refused in other words than what is not there.

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught, parseAutomationStudioSavedState, parseAutomationStudioTaskAttempt, parseAutomationStudioTaskResult, type AutomationStudioTaskAttempt, type AutomationStudioTaskResult } from "@fluxiq/contracts/automation";
import { GlobalProgramApiRegistry } from "../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstAttemptStoreOf, type AutomationStudioAnswerFirstAttemptRecord } from "../../../../framework/automation-service/service/answer-first/attempt-store/index.ts";
import { automationStudioAnswerFirstLiveAttemptsOf } from "../../../../framework/automation-service/service/answer-first/interrupted/index.ts";
import { registerAutomationStudioApi } from "../handlers/index.ts";
import { createCacheApiTestService } from "../handlers/tests/test-service.ts";
import { cacheActor } from "../handlers/tests/test-actor.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const TRIED = { version: 1 as const, tried: [], approaches: 0 };

function attemptOn(flowId: string, attemptId: string, status: "working" | "achieved", startedAtMs: number, taskId = "task.same"): AutomationStudioTaskAttempt {
  return {
    taskId, attemptId, ordinal: 1, projectId: "", flowId, runId: `explore.${attemptId}`, path: "explore", status,
    spend: { calls: 3, inputTokens: 100, outputTokens: 50, usd: 0.42, ms: 900 }, budget: { usd: 5 }, liveSteps: 2, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs,
    ...(status === "achieved" ? { endedAtMs: startedAtMs + 900 } : {})
  } as AutomationStudioTaskAttempt;
}

function confirmed(attemptId: string): AutomationStudioTaskResult {
  return { attemptId, kind: "plain_answer", label: "confirmed", timesChecked: 1, source: "exploration", acts: [], answerText: { text: "Three loans.", author: "model" }, checkedWhat: "The list of loans." } as AutomationStudioTaskResult;
}

async function world() {
  const { service, cleanup } = await createCacheApiTestService();
  cleanups.push(cleanup);
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service);
  const project = await service.createProject({ name: "Task attempts" });
  const flow = await service.createFlow({ projectId: project.id, name: "Loans" });
  const other = await service.createFlow({ projectId: project.id, name: "Holds" });
  const store = automationStudioAnswerFirstAttemptStoreOf(service, { paths: service.projectPaths, flows: service.flowPaths, projects: service.projects });
  const call = (endpoint: string, payload: Record<string, unknown>) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: cacheActor("user.reader"), payload }) as Promise<{ ok: boolean; payload?: any; error?: string; errorCode?: string }>;
  const save = async (flowId: string, attemptId: string, status: "working" | "achieved", startedAtMs: number, over: Partial<AutomationStudioAnswerFirstAttemptRecord> & { taskId?: string } = {}) => {
    const { taskId, ...fields } = over;
    // A working row is one something in this process is working on; a person's read tells any other as interrupted (`task-attempt-wiring.test.ts`).
    if (status === "working") automationStudioAnswerFirstLiveAttemptsOf(service).claim(attemptId);
    await store.save(project.id, flowId, { attempt: { ...attemptOn(flowId, attemptId, status, startedAtMs, taskId), projectId: project.id }, tried: TRIED, ...(status === "achieved" ? { result: confirmed(attemptId) } : {}), ...fields });
  };
  const attemptsFile = (flowId: string) => path.join(service.flowPaths.flowDirectory(project.id, flowId), "answer-attempts.json");
  const locatorFile = service.projectPaths.projectFile(project.id, "indexes", "answer-attempts.json");
  return { service, project, flow, other, store, call, save, attemptsFile, locatorFile };
}

describe("get-task-attempt", () => {
  it("answers one attempt with its result, what it left saved and the attempt it is told against, each as the contract reads it", async () => {
    const { project, flow, call, save } = await world();
    await save(flow.flowId, "attempt.1", "achieved", 1_000);
    await save(flow.flowId, "attempt.2", "achieved", 5_000, { candidateId: "candidate.2" });
    const response = await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, { projectId: project.id, attemptId: "attempt.2" });
    expect(response.ok).toBe(true);
    const { outcome } = response.payload;
    expect(parseAutomationStudioTaskAttempt(outcome.attempt).ok).toBe(true);
    expect(parseAutomationStudioTaskResult(outcome.result).ok).toBe(true);
    expect(parseAutomationStudioSavedState(outcome.saved).ok).toBe(true);
    expect(outcome.attempt.attemptId).toBe("attempt.2");
    expect(outcome.attempt.spend.usd).toBe(0.42);
    expect(outcome.saved).toEqual({ state: "partly_works", trust: "unproven", flowId: flow.flowId, savedAtMs: 5_900 });
    expect(outcome.comparedTo.attemptId).toBe("attempt.1");
  });

  it("names nothing it has no record of: no saved state without a draft, nothing to compare on a first attempt", async () => {
    const { project, flow, call, save } = await world();
    await save(flow.flowId, "attempt.1", "achieved", 1_000);
    const { outcome } = (await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, { projectId: project.id, attemptId: "attempt.1" })).payload;
    expect(outcome.saved).toBeUndefined();
    expect(outcome.comparedTo).toBeUndefined();
  });

  it("compares an attempt only with an ended one at the same task", async () => {
    const { project, flow, call, save } = await world();
    await save(flow.flowId, "attempt.other-task", "achieved", 1_000, { taskId: "task.other" });
    await save(flow.flowId, "attempt.still-going", "working", 2_000);
    await save(flow.flowId, "attempt.now", "achieved", 3_000);
    const { outcome } = (await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, { projectId: project.id, attemptId: "attempt.now" })).payload;
    expect(outcome.comparedTo).toBeUndefined();
  });

  it("refuses an attempt it cannot find, in plain words", async () => {
    const { project, call } = await world();
    const response = await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, { projectId: project.id, attemptId: "attempt.none" });
    expect(response).toMatchObject({ ok: false, error: "I could not find that attempt.", errorCode: "task_attempt.not_found" });
  });

  it("refuses an attempt whose file it cannot read, and never calls it not found", async () => {
    const { project, flow, call, save, attemptsFile } = await world();
    await save(flow.flowId, "attempt.1", "achieved", 1_000);
    await writeFile(attemptsFile(flow.flowId), "not json at all");
    const response = await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, { projectId: project.id, attemptId: "attempt.1" });
    expect(response).toMatchObject({ ok: false, errorCode: "task_attempt.unreadable" });
    expect(response.error).toMatch(/could not be read/u);
    expect(response.error).not.toContain(flow.flowId);
  });

  it("refuses when the record of where attempts are cannot be read, and never calls it not found", async () => {
    const { project, flow, call, save, locatorFile } = await world();
    await save(flow.flowId, "attempt.1", "achieved", 1_000);
    expect(existsSync(locatorFile)).toBe(true);
    await writeFile(locatorFile, JSON.stringify({ version: 1, data: { kind: "something else" } }));
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, { projectId: project.id, attemptId: "attempt.1" })).toMatchObject({ ok: false, errorCode: "task_attempt.unreadable" });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, { projectId: project.id, conversationId: "conversation.1" })).toMatchObject({ ok: false, errorCode: "task_attempt.unreadable" });
  });

  it("refuses a request that names no attempt", async () => {
    const { project, call } = await world();
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, { projectId: project.id })).toMatchObject({ ok: false, error: "Attempt identifier is required." });
  });
});

describe("list-conversation-task-attempts", () => {
  it("is an empty list for a thread with none", async () => {
    const { project, call } = await world();
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, { projectId: project.id, conversationId: "conversation.none" })).toEqual({ ok: true, payload: { outcomes: [] } });
  });

  it("lists a thread's attempts oldest first across its Flows, a working row included", async () => {
    const { project, flow, other, store, call, save } = await world();
    await store.locator.noteConversation(project.id, "conversation.1", flow.flowId);
    await store.locator.noteConversation(project.id, "conversation.1", other.flowId);
    const now = Date.now();
    await save(flow.flowId, "attempt.b", "achieved", now + 2_000);
    await save(other.flowId, "attempt.a", "achieved", now + 1_000);
    await save(flow.flowId, "attempt.c", "working", now + 3_000);
    const { outcomes } = (await call(AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, { projectId: project.id, conversationId: "conversation.1" })).payload;
    expect(outcomes.map((outcome: { attempt: { attemptId: string; status: string } }) => [outcome.attempt.attemptId, outcome.attempt.status])).toEqual([["attempt.a", "achieved"], ["attempt.b", "achieved"], ["attempt.c", "working"]]);
  });

  it("gives a thread only the attempts made while it held the Flow", async () => {
    const { project, flow, store, call, save } = await world();
    const before = Date.now() - 60_000;
    await save(flow.flowId, "attempt.before-either", "achieved", before);
    await store.locator.noteConversation(project.id, "conversation.first", flow.flowId);
    const inFirst = Date.now();
    await save(flow.flowId, "attempt.first", "achieved", inFirst);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await store.locator.noteConversation(project.id, "conversation.second", flow.flowId);
    await save(flow.flowId, "attempt.second", "achieved", Date.now());
    const ids = async (conversationId: string) => (await call(AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, { projectId: project.id, conversationId })).payload.outcomes.map((outcome: { attempt: { attemptId: string } }) => outcome.attempt.attemptId);
    expect(await ids("conversation.first")).toEqual(["attempt.first"]);
    expect(await ids("conversation.second")).toEqual(["attempt.second"]);
  });

  it("refuses a thread one of whose files it cannot read, and never lists it as empty", async () => {
    const { project, flow, store, call, save, attemptsFile } = await world();
    await store.locator.noteConversation(project.id, "conversation.1", flow.flowId);
    await save(flow.flowId, "attempt.1", "achieved", Date.now());
    await writeFile(attemptsFile(flow.flowId), JSON.stringify({ version: 1, data: { kind: "answer_first_attempts", schemaVersion: 1, projectId: project.id, flowId: flow.flowId, attempts: [{ attempt: { status: "failed" }, tried: TRIED }] } }));
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, { projectId: project.id, conversationId: "conversation.1" })).toMatchObject({ ok: false, errorCode: "task_attempt.unreadable" });
  });
});

describe("the attempt store under the routes", () => {
  it("keeps an old Flow with no locator entry readable by Flow, and only by Flow", async () => {
    const { project, flow, store, call, attemptsFile } = await world();
    const attempt = { ...attemptOn(flow.flowId, "attempt.old", "achieved", 1_000), projectId: project.id };
    await mkdir(path.dirname(attemptsFile(flow.flowId)), { recursive: true });
    await writeFile(attemptsFile(flow.flowId), JSON.stringify({ version: 1, data: { kind: "answer_first_attempts", schemaVersion: 1, projectId: project.id, flowId: flow.flowId, attempts: [{ attempt, result: confirmed("attempt.old"), tried: TRIED }] } }));
    await expect(store.get(project.id, flow.flowId, "attempt.old")).resolves.toMatchObject({ attempt: { attemptId: "attempt.old" } });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.getTaskAttempt, { projectId: project.id, attemptId: "attempt.old" })).toMatchObject({ ok: false, errorCode: "task_attempt.not_found" });
  });
});
