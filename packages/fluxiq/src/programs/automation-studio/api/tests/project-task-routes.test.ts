// @fluxiq-test-group real-sql
// Covers handlers/task/project-tasks.ts: a project's tasks listed from what each task remembers, renamed, given their own
// humanness level, and forgotten, on a real service's disk. Rename, settings and remove touch the task's memory entry and nothing else.

import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught, type AutomationStudioTaskAttempt, type AutomationStudioTaskResult } from "@fluxiq/contracts/automation";
import { GlobalProgramApiRegistry } from "../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstAttemptStoreOf } from "../../../../framework/automation-service/service/answer-first/attempt-store/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf } from "../../../../framework/automation-service/service/answer-first/task-memory/index.ts";
import { registerAutomationStudioApi } from "../handlers/index.ts";
import { createCacheApiTestService } from "../handlers/tests/test-service.ts";
import { cacheActor } from "../handlers/tests/test-actor.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const SOON = Date.now() + 1_000;
const TRIED = { version: 1 as const, tried: [], approaches: 0 };

function attempt(projectId: string, flowId: string, taskId: string, attemptId: string, ordinal: number, startedAtMs: number): AutomationStudioTaskAttempt {
  return {
    taskId, attemptId, ordinal, projectId, flowId, runId: `explore.${attemptId}`, path: "explore", status: "achieved",
    spend: { calls: 3, inputTokens: 100, outputTokens: 50, usd: 0.42, ms: 900 }, budget: { usd: 5 }, liveSteps: 2, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs, endedAtMs: startedAtMs + 900
  } as AutomationStudioTaskAttempt;
}

async function world() {
  const { service, cleanup } = await createCacheApiTestService();
  cleanups.push(cleanup);
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service);
  const project = await service.createProject({ name: "Tasks" });
  const other = await service.createProject({ name: "Elsewhere" });
  const loans = await service.createFlow({ projectId: project.id, name: "Loans" });
  const holds = await service.createFlow({ projectId: project.id, name: "Holds" });
  const store = automationStudioAnswerFirstAttemptStoreOf(service, { paths: service.projectPaths, flows: service.flowPaths, projects: service.projects });
  const memory = automationStudioAnswerFirstTaskMemoryOf(service, { paths: service.projectPaths, projects: service.projects });
  const call = (endpoint: string, payload: Record<string, unknown>) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: cacheActor("user.reader"), payload }) as Promise<{ ok: boolean; payload?: any; error?: string; errorCode?: string }>;
  /** A task that ran twice on its Flow: a row for each attempt, and the task's own memory of both. */
  const task = async (taskId: string, flowId: string, at: number, conversationId?: string) => {
    if (conversationId) await store.locator.noteConversation(project.id, conversationId, flowId);
    for (const [n, started] of [[1, at], [2, at + 5_000]] as const) {
      const attemptId = `${taskId}.attempt.${n}`;
      await store.save(project.id, flowId, { attempt: attempt(project.id, flowId, taskId, attemptId, n, started), tried: TRIED, result: { attemptId, kind: "plain_answer", label: "confirmed", timesChecked: 1, source: "exploration", acts: [], answerText: { text: "Three loans.", author: "model" }, checkedWhat: "The list of loans." } as AutomationStudioTaskResult });
      await memory.update(project.id, taskId, (current) => ({ ...current, flowId, attempts: [...current.attempts, { attemptId, flowId, ordinal: n, route: "build", steps: [] }] }));
    }
  };
  return { service, project, other, loans, holds, store, memory, call, task };
}

describe("list-project-tasks", () => {
  it("lists each task with its latest attempt, newest first, named by its Flow and opened from its thread", async () => {
    const { project, loans, holds, call, task } = await world();
    await task("task.loans", loans.flowId, SOON, "conversation.loans");
    await task("task.holds", holds.flowId, SOON + 100_000);
    const response = await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks, { projectId: project.id });
    expect(response.ok, `${response.error} ${response.errorCode}`).toBe(true);
    expect(response.payload.tasks.map((item: { taskId: string }) => item.taskId)).toEqual(["task.holds", "task.loans"]);
    const loansTask = response.payload.tasks[1];
    expect(loansTask).toMatchObject({ flowId: loans.flowId, title: "Loans", conversationId: "conversation.loans", attemptCount: 2 });
    expect(loansTask.latest.attempt.attemptId).toBe("task.loans.attempt.2");
    expect(response.payload.tasks[0].conversationId).toBeUndefined();
    expect(response.payload.nextCursor).toBeNull();
  });

  it("pages, and never lists another project's tasks", async () => {
    const { project, other, loans, holds, call, task } = await world();
    await task("task.loans", loans.flowId, SOON);
    await task("task.holds", holds.flowId, SOON + 100_000);
    const first = await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks, { projectId: project.id, limit: 1 });
    expect(first.payload.tasks).toHaveLength(1);
    expect(first.payload.nextCursor).toBe("1");
    const second = await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks, { projectId: project.id, limit: 1, cursor: first.payload.nextCursor });
    expect(second.payload.tasks.map((item: { taskId: string }) => item.taskId)).toEqual(["task.loans"]);
    expect(second.payload.nextCursor).toBeNull();
    expect((await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks, { projectId: other.id })).payload).toEqual({ tasks: [], nextCursor: null });
  });

  it("leaves out a task whose latest attempt cannot be found, and asks for a project", async () => {
    const { project, loans, call, memory } = await world();
    await memory.update(project.id, "task.ghost", (current) => ({ ...current, flowId: loans.flowId, attempts: [{ attemptId: "gone", flowId: loans.flowId, ordinal: 1, route: "build", steps: [] }] }));
    expect((await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks, { projectId: project.id })).payload.tasks).toEqual([]);
    expect((await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks, {})).ok).toBe(false);
  });
});

describe("rename-task and remove-task", () => {
  it("renames only the task's own name, and a task it does not hold is refused in words", async () => {
    const { project, loans, call, task, service } = await world();
    await task("task.loans", loans.flowId, SOON);
    const renamed = await call(AUTOMATION_STUDIO_ENDPOINTS.renameTask, { projectId: project.id, taskId: "task.loans", title: "  Loans   due this week " });
    expect(renamed).toMatchObject({ ok: true, payload: { taskId: "task.loans", title: "Loans due this week" } });
    const listed = await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks, { projectId: project.id });
    expect(listed.payload.tasks[0].title).toBe("Loans due this week");
    expect((await service.getFlow(project.id, loans.flowId)).name).toBe("Loans");
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.renameTask, { projectId: project.id, taskId: "task.loans", title: "   " })).toMatchObject({ ok: false, errorCode: "task.title_required" });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.renameTask, { projectId: project.id, taskId: "task.none", title: "x" })).toMatchObject({ ok: false, errorCode: "task.not_found" });
  });

  it("removes the task's memory and nothing else: the Flow and its attempts stay, and a second remove says it is gone", async () => {
    const { project, loans, call, task, service, store, memory } = await world();
    await task("task.loans", loans.flowId, SOON, "conversation.loans");
    expect(await memory.attemptLocation(project.id, "task.loans.attempt.1")).toBeDefined();
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.removeTask, { projectId: project.id, taskId: "task.loans" })).toMatchObject({ ok: true, payload: { taskId: "task.loans", removed: true } });
    expect((await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks, { projectId: project.id })).payload.tasks).toEqual([]);
    expect(await memory.get(project.id, "task.loans")).toBeUndefined();
    expect(await memory.attemptLocation(project.id, "task.loans.attempt.1")).toBeUndefined();
    expect((await service.getFlow(project.id, loans.flowId)).flowId).toBe(loans.flowId);
    expect((await store.list(project.id, loans.flowId)).map((row) => row.attempt.attemptId)).toEqual(["task.loans.attempt.1", "task.loans.attempt.2"]);
    const thread = await call(AUTOMATION_STUDIO_ENDPOINTS.listConversationTaskAttempts, { projectId: project.id, conversationId: "conversation.loans" });
    expect(thread.payload.outcomes.length).toBeGreaterThan(0);
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.removeTask, { projectId: project.id, taskId: "task.loans" })).toMatchObject({ ok: false, errorCode: "task.not_found" });
    expect(existsSync(service.projectPaths.projectFile(project.id, "task-memory", "task.loans.json"))).toBe(false);
  });
});

describe("update-task-settings", () => {
  it("sets and clears the task's own humanness, and the list carries it while it is set", async () => {
    const { project, loans, call, task, memory, service } = await world();
    await task("task.loans", loans.flowId, SOON);
    const listedBefore = await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks, { projectId: project.id });
    expect(listedBefore.payload.tasks[0]).not.toHaveProperty("humanness");
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.updateTaskSettings, { projectId: project.id, taskId: "task.loans", humanness: 40 })).toEqual({ ok: true, payload: { taskId: "task.loans", humanness: 40 } });
    expect((await memory.get(project.id, "task.loans"))?.humanness).toBe(40);
    expect((await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks, { projectId: project.id })).payload.tasks[0]).toMatchObject({ taskId: "task.loans", humanness: 40 });
    // A stored 0 is a level of its own, not a removal.
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.updateTaskSettings, { projectId: project.id, taskId: "task.loans", humanness: 0 })).toEqual({ ok: true, payload: { taskId: "task.loans", humanness: 0 } });
    expect((await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks, { projectId: project.id })).payload.tasks[0].humanness).toBe(0);
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.updateTaskSettings, { projectId: project.id, taskId: "task.loans", humanness: null })).toEqual({ ok: true, payload: { taskId: "task.loans", humanness: null } });
    expect(await memory.get(project.id, "task.loans")).not.toHaveProperty("humanness");
    expect((await call(AUTOMATION_STUDIO_ENDPOINTS.listProjectTasks, { projectId: project.id })).payload.tasks[0]).not.toHaveProperty("humanness");
    // The rest of the task's memory and its Flow are untouched.
    expect((await memory.get(project.id, "task.loans"))?.attempts).toHaveLength(2);
    expect((await service.getFlow(project.id, loans.flowId)).metadata?.humanness).toBeUndefined();
  });

  it("refuses a level no save would take, a missing level and a task it does not hold", async () => {
    const { project, loans, call, task, memory } = await world();
    await task("task.loans", loans.flowId, SOON);
    for (const humanness of [101, -1, 2.5, "x"]) {
      expect(await call(AUTOMATION_STUDIO_ENDPOINTS.updateTaskSettings, { projectId: project.id, taskId: "task.loans", humanness })).toMatchObject({ ok: false, errorCode: "task.humanness_invalid" });
    }
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.updateTaskSettings, { projectId: project.id, taskId: "task.loans" })).toMatchObject({ ok: false, errorCode: "task.humanness_invalid" });
    expect(await memory.get(project.id, "task.loans")).not.toHaveProperty("humanness");
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.updateTaskSettings, { projectId: project.id, taskId: "task.none", humanness: 40 })).toMatchObject({ ok: false, errorCode: "task.not_found" });
    expect(await memory.get(project.id, "task.none")).toBeUndefined();
  });
});
