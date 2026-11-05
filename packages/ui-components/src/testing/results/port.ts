// A results port with no Core behind it, for building and testing the answer turn. It
// holds outcomes in memory, answers as a real adapter answers (a failure is a failed
// `ChatResult`, never a throw), and records what it was asked. It starts nothing real
// and spends nothing: Run again and Add budget only leave a `working` attempt the test
// can read back.

import type { ChatDownload, ChatResult, ChatResultsPort, ChatTaskOutcome } from "../../chat/ports/index.ts";
import { fakeNoLoopsCaught } from "./outcomes.ts";

/** One thread and the outcomes it holds, oldest first. */
export type FakeChatResultsThread = { conversationId: string; outcomes: readonly ChatTaskOutcome[] };

export type FakeChatResultsOptions = {
  threads?: readonly FakeChatResultsThread[];
  /** Outcomes readable by attempt id and in no thread. */
  outcomes?: readonly ChatTaskOutcome[];
  /** The host's download. Absent, a file goes only into `downloads`. */
  download?: ChatDownload;
  /** `false`: the port says its spend is not real (`ChatResultsPort.reportsSpend`). */
  reportsSpend?: false;
};

/** What was asked of the port, in order. */
export type FakeChatResultsCall = { method: keyof ChatResultsPort; query: unknown };

/** A file `exportRows` handed over. */
export type FakeChatResultsDownload = { fileName: string; contentType: string; body: string };

/** Every method present, the optional one included. A test of a client without it leaves it out itself. */
export type FakeChatResultsPort = Required<Omit<ChatResultsPort, "reportsSpend">> & {
  readonly reportsSpend?: false;
  readonly calls: readonly FakeChatResultsCall[];
  readonly downloads: readonly FakeChatResultsDownload[];
  /** Makes the next call to `method` answer this failure, for drawing a failed read. */
  failNext(method: keyof ChatResultsPort, failure: Extract<ChatResult<never>, { ok: false }>): void;
};

/** A port over the outcomes it is given. */
export function createFakeChatResultsPort(options: FakeChatResultsOptions = {}): FakeChatResultsPort {
  const threads = new Map<string, ChatTaskOutcome[]>((options.threads ?? []).map((thread) => [thread.conversationId, structuredClone([...thread.outcomes])]));
  const standalone = structuredClone([...(options.outcomes ?? [])]);
  const calls: FakeChatResultsCall[] = [];
  const downloads: FakeChatResultsDownload[] = [];
  const failures = new Map<keyof ChatResultsPort, Extract<ChatResult<never>, { ok: false }>>();

  const allOutcomes = (): ChatTaskOutcome[] => [...[...threads.values()].flat(), ...standalone];
  const failing = (method: keyof ChatResultsPort, query: unknown): Extract<ChatResult<never>, { ok: false }> | undefined => {
    calls.push({ method, query });
    const failure = failures.get(method);
    failures.delete(method);
    return failure;
  };

  return {
    ...(options.reportsSpend === undefined ? {} : { reportsSpend: options.reportsSpend }),
    calls,
    downloads,
    failNext(method, failure) {
      failures.set(method, failure);
    },
    async readThread(query) {
      const failure = failing("readThread", query);
      if (failure) return failure;
      return { ok: true, value: { outcomes: structuredClone(threads.get(query.conversationId) ?? []) } };
    },
    async readAttempt(query) {
      const failure = failing("readAttempt", query);
      if (failure) return failure;
      const found = allOutcomes().find((outcome) => outcome.attempt.attemptId === query.attemptId);
      if (!found) return { ok: false, sentence: "That attempt could not be found.", code: "failed" };
      return { ok: true, value: structuredClone(found) };
    },
    async exportRows(query) {
      const failure = failing("exportRows", query);
      if (failure) return failure;
      const found = allOutcomes().map((outcome) => outcome.result?.rows).find((rows) => rows?.runId === query.runId && rows.datasetId === query.datasetId);
      if (!found) return { ok: false, sentence: "Those rows could not be found.", code: "failed" };
      const fileName = `${query.datasetId}.${query.format}`;
      const contentType = query.format === "csv" ? "text/csv" : "application/json";
      const body = query.format === "csv" ? csvOf(found.columns, found.previewRows) : JSON.stringify(found.previewRows);
      downloads.push({ fileName, contentType, body });
      options.download?.(fileName, contentType, body);
      return { ok: true, value: { fileName } };
    },
    async runAgain(query) {
      const failure = failing("runAgain", query);
      if (failure) return failure;
      const earlier = allOutcomes().filter((outcome) => outcome.attempt.taskId === query.taskId && outcome.attempt.projectId === query.projectId);
      const last = earlier.at(-1);
      if (!last) return { ok: false, sentence: "That task could not be found.", code: "failed" };
      const attemptId = `${query.taskId}-again-${earlier.length + 1}`;
      standalone.push(againAfter(last, attemptId, earlier.length + 1));
      return { ok: true, value: { attemptId } };
    },
    async addBudgetAndCarryOn(query) {
      const failure = failing("addBudgetAndCarryOn", query);
      if (failure) return failure;
      const found = allOutcomes().find((outcome) => outcome.attempt.attemptId === query.attemptId);
      if (!found) return { ok: false, sentence: "That attempt could not be found.", code: "failed" };
      // One its Core's restart cut off carries on as it was, with nothing added; one that ran out needs some budget.
      const cutOff = found.attempt.status === "waiting_for_person" && found.attempt.waitingFor === "interrupted";
      if (found.attempt.status !== "budget_out" && !cutOff) return { ok: false, sentence: "That attempt has not run out of budget.", code: "refused" };
      if (!Number.isFinite(query.addUsd) || query.addUsd < 0 || (!cutOff && query.addUsd === 0)) return { ok: false, sentence: "Add an amount above zero.", code: "invalid_request" };
      const { endedAtMs: _endedAtMs, status: _status, ...rest } = found.attempt;
      const { waitingFor: _waitingFor, ...fields } = rest as typeof rest & { waitingFor?: unknown };
      const budgetUsd = fields.budget.usd + query.addUsd;
      found.attempt = { ...fields, status: "working", budget: { usd: budgetUsd } };
      return { ok: true, value: { attemptId: query.attemptId, budgetUsd } };
    }
  };
}

/** The new attempt a press of Run again starts: working, from the saved Flow when there is one. */
function againAfter(last: ChatTaskOutcome, attemptId: string, ordinal: number): ChatTaskOutcome {
  const { taskId, projectId, flowId, budget, startedAtMs, endedAtMs } = last.attempt;
  const attempt: ChatTaskOutcome["attempt"] = {
    taskId,
    attemptId,
    ordinal,
    projectId,
    path: flowId === undefined ? "explore" : "run_flow",
    status: "working",
    spend: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, ms: 0 },
    budget: { usd: budget.usd },
    liveSteps: 0,
    loopsCaught: fakeNoLoopsCaught(),
    startedAtMs: (endedAtMs ?? startedAtMs) + 1
  };
  if (flowId !== undefined) attempt.flowId = flowId;
  return { attempt };
}

function csvOf(columns: ReadonlyArray<{ id: string; label: string }>, rows: ReadonlyArray<Record<string, unknown>>): string {
  const lines = [columns.map((column) => cell(column.label)), ...rows.map((row) => columns.map((column) => cell(row[column.id])))];
  return lines.map((line) => line.join(",")).join("\n");
}

function cell(value: unknown): string {
  const text = value === undefined || value === null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n]/u.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}
