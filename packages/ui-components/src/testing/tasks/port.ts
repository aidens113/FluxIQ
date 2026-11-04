// A tasks port with no Core behind it, for building and testing the tasks screen. It holds
// tasks in memory and answers as a real adapter does (a failure is a failed `ChatResult`,
// never a throw). It owns the attempts, and its `results` is the `ChatResultsPort` over the
// same attempts, so Add budget, Run again and Carry on show up in the next read of a task.
// It starts nothing real and spends nothing: carrying on and running again only leave a
// `working` attempt.

import type { ChatResult, ChatResultsPort, ChatTaskAttempt, ChatTaskOutcome } from "../../chat/ports/index.ts";
import type { TaskStep, TaskSummary, TasksPort } from "../../screens/tasks/index.ts";
import { createFakeChatResultsPort, fakeTaskOutcomes } from "../results/index.ts";
import type { FakeTask } from "./fixtures.ts";

export type FakeTasksOptions = {
  tasks: readonly FakeTask[];
  /** Methods the port leaves out, to test a client that cannot carry them. */
  without?: ReadonlyArray<"readSteps" | "carryOn" | "rename" | "remove">;
  /** `false`: the spend is not real (`ChatResultsPort.reportsSpend`). */
  reportsSpend?: false;
};

export type FakeTasksCall = { method: string; query: unknown };

type Failure = Extract<ChatResult<never>, { ok: false }>;

export type FakeTasksPort = TasksPort & {
  /** The results port over the same attempts. */
  readonly results: ChatResultsPort;
  readonly calls: readonly FakeTasksCall[];
  /** Makes the next call to `method` (of this port or `results`) answer this failure. */
  failNext(method: string, failure: Failure): void;
  /** What the port holds now, as the list would read it. */
  snapshot(): readonly TaskSummary[];
};

const GONE: Failure = { ok: false, sentence: "That task could not be found.", code: "failed" };

/** A port over `options.tasks`. */
export function createFakeTasksPort(options: FakeTasksOptions): FakeTasksPort {
  const tasks = structuredClone([...options.tasks]);
  const calls: FakeTasksCall[] = [];
  const failures = new Map<string, Failure>();
  const rowsSource = createFakeChatResultsPort({ outcomes: tasks.flatMap((task) => task.attempts) });
  const without = new Set(options.without ?? []);

  const failing = (method: string, query: unknown): Failure | undefined => {
    calls.push({ method, query });
    const failure = failures.get(method);
    failures.delete(method);
    return failure;
  };
  const find = (taskId: string): FakeTask | undefined => tasks.find((task) => task.summary.taskId === taskId);
  const findAttempt = (attemptId: string): ChatTaskOutcome | undefined => tasks.flatMap((task) => task.attempts).find((outcome) => outcome.attempt.attemptId === attemptId);
  const summary = (task: FakeTask): TaskSummary => {
    const latest = task.attempts[0]!;
    return { ...task.summary, latest, attemptCount: task.attempts.length, updatedAtMs: latest.attempt.endedAtMs ?? latest.attempt.startedAtMs };
  };
  const newest = (): FakeTask[] => [...tasks].sort((a, b) => summary(b).updatedAtMs - summary(a).updatedAtMs);

  const results: ChatResultsPort = {
    ...(options.reportsSpend === undefined ? {} : { reportsSpend: options.reportsSpend }),
    async readThread(query) {
      const failure = failing("results.readThread", query);
      if (failure) return failure;
      const held = tasks.filter((task) => task.summary.conversationId === query.conversationId).flatMap((task) => [...task.attempts].reverse());
      return { ok: true, value: { outcomes: structuredClone(held) } };
    },
    async readAttempt(query) {
      const failure = failing("results.readAttempt", query);
      if (failure) return failure;
      const found = findAttempt(query.attemptId);
      return found === undefined ? { ok: false, sentence: "That attempt could not be found.", code: "failed" } : { ok: true, value: structuredClone(found) };
    },
    async exportRows(query) {
      const failure = failing("results.exportRows", query);
      return failure ?? rowsSource.exportRows(query);
    },
    async runAgain(query) {
      const failure = failing("results.runAgain", query);
      if (failure) return failure;
      const task = find(query.taskId);
      if (task === undefined) return GONE;
      const last = task.attempts[0]!.attempt;
      const attemptId = `${query.taskId}-again-${task.attempts.length + 1}`;
      const attempt: ChatTaskAttempt = {
        taskId: query.taskId, attemptId, ordinal: task.attempts.length + 1, projectId: last.projectId, path: last.flowId === undefined ? "explore" : "run_flow", status: "working",
        spend: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, ms: 0 }, budget: { usd: last.budget.usd }, liveSteps: 0, loopsCaught: fakeTaskOutcomes().working.attempt.loopsCaught, startedAtMs: (last.endedAtMs ?? last.startedAtMs) + 1
      };
      if (last.flowId !== undefined) attempt.flowId = last.flowId;
      task.attempts.unshift({ attempt });
      return { ok: true, value: { attemptId } };
    },
    async addBudgetAndCarryOn(query) {
      const failure = failing("results.addBudgetAndCarryOn", query);
      if (failure) return failure;
      const found = findAttempt(query.attemptId);
      if (found === undefined) return { ok: false, sentence: "That attempt could not be found.", code: "failed" };
      if (found.attempt.status !== "budget_out") return { ok: false, sentence: "That attempt has not run out of budget.", code: "refused" };
      const { endedAtMs: _ended, status: _status, ...fields } = found.attempt;
      const budgetUsd = fields.budget.usd + query.addUsd;
      found.attempt = { ...fields, status: "working", budget: { usd: budgetUsd } };
      return { ok: true, value: { attemptId: query.attemptId, budgetUsd } };
    }
  };

  const port: FakeTasksPort = {
    results,
    calls,
    failNext: (method, failure) => void failures.set(method, failure),
    snapshot: () => structuredClone(newest().map(summary)),
    async list(query) {
      const failure = failing("list", query);
      if (failure) return failure;
      const text = query.text?.trim().toLowerCase() ?? "";
      const matching = newest().map(summary).filter((task) => text === "" || task.title.toLowerCase().includes(text));
      const start = query.cursor === undefined ? 0 : Number(query.cursor);
      const page = matching.slice(start, start + query.limit);
      return { ok: true, value: { tasks: structuredClone(page), nextCursor: start + query.limit < matching.length ? String(start + query.limit) : null } };
    },
    async read(query) {
      const failure = failing("read", query);
      if (failure) return failure;
      const task = find(query.taskId);
      return task === undefined ? GONE : { ok: true, value: structuredClone({ task: summary(task), attempts: task.attempts }) };
    },
    async readSteps(query) {
      const failure = failing("readSteps", query);
      if (failure) return failure;
      const held: TaskStep[] | undefined = tasks.map((task) => task.steps?.[query.attemptId]).find((steps) => steps !== undefined);
      return { ok: true, value: { steps: structuredClone(held ?? []) } };
    },
    async carryOn(query) {
      const failure = failing("carryOn", query);
      if (failure) return failure;
      const found = findAttempt(query.attemptId);
      if (found === undefined) return { ok: false, sentence: "That attempt could not be found.", code: "failed" };
      const { status: _status, ...fields } = found.attempt as ChatTaskAttempt & { waitingFor?: string };
      const { waitingFor: _waitingFor, ...rest } = fields as typeof fields & { waitingFor?: string };
      found.attempt = { ...rest, status: "working" } as ChatTaskAttempt;
      return { ok: true, value: { attemptId: query.attemptId } };
    },
    async rename(query) {
      const failure = failing("rename", query);
      if (failure) return failure;
      const task = find(query.taskId);
      if (task === undefined) return GONE;
      task.summary.title = query.title;
      return { ok: true, value: {} };
    },
    async remove(query) {
      const failure = failing("remove", query);
      if (failure) return failure;
      const index = tasks.findIndex((task) => task.summary.taskId === query.taskId);
      if (index < 0) return GONE;
      tasks.splice(index, 1);
      return { ok: true, value: {} };
    }
  };
  for (const name of without) delete (port as Partial<Record<typeof name, unknown>>)[name];
  return port;
}
