// Test support: a FluxNodeService that records its calls and serves canned answers, with a
// run whose event log the test can add to while a client is reading it.
import type { FluxNodeRunEvent, FluxNodeRunStateBody } from "@fluxiq/contracts/fluxnode";
import type { FluxNodeCaller, FluxNodeService } from "../../../framework/automation-service/service/fluxnode/index.ts";

export const FAKE_RUN_STATE: FluxNodeRunStateBody = {
  runId: "run_1",
  name: "notes.today",
  state: "running",
  startedAt: 1,
  eventsPath: "/api/fluxnode/v1/runs/run_1/events",
  cost: { calls: 0, tokens: 0, usd: 0 }
};

export const FAKE_RESULT = {
  runId: "run_1",
  name: "notes.today",
  flowId: "flow_9",
  flowPath: "notes/today",
  status: "stopped",
  verdict: { label: "unverified" },
  path: "explored",
  cost: { calls: 3, tokens: 1200, usd: 0.02 },
  timings: { startedAt: 1, endedAt: 2, durationMs: 1 }
} as const;

export function fakeEvent(seq: number, type: "step" | "cost" | "ended"): FluxNodeRunEvent {
  const common = { runId: "run_1", seq, at: seq };
  if (type === "step") return { ...common, type, flowId: "flow_9", stepId: `step_${seq}`, label: "Open the page", state: "started" };
  if (type === "cost") return { ...common, type, cost: { calls: 1, tokens: 10, usd: 0 }, budgetUsd: 5 };
  return { ...common, type, result: FAKE_RESULT };
}

export type FakeFluxNodeService = FluxNodeService & {
  calls: Array<{ method: string; caller: FluxNodeCaller; args: unknown[] }>;
  /** Adds an event to run_1's log and wakes a reader waiting for one. */
  push(event: FluxNodeRunEvent): void;
  /** Aborted signals of `events` calls, in order. */
  signals: AbortSignal[];
};

export function createFakeFluxNodeService(stored: FluxNodeRunEvent[] = []): FakeFluxNodeService {
  const log = [...stored];
  const waiting: Array<() => void> = [];
  const calls: FakeFluxNodeService["calls"] = [];
  const signals: AbortSignal[] = [];
  const record = (method: string, caller: FluxNodeCaller, ...args: unknown[]): void => {
    calls.push({ method, caller, args });
  };
  const missing = { ok: false, refusal: { code: "unknown_run", message: "There is no such run." } } as const;
  return {
    calls,
    signals,
    push(event) {
      log.push(event);
      for (const wake of waiting.splice(0)) wake();
    },
    async register(caller, request) {
      record("register", caller, request);
      return { ok: true, value: { name: "notes.today", specHash: "a".repeat(64), flowPath: "notes/today", created: true } };
    },
    async start(caller, request) {
      record("start", caller, request);
      if (request.idempotencyKey === "conflict") return { ok: false, refusal: { code: "idempotency_conflict", message: "That key was used for a different request." } };
      return { ok: true, value: FAKE_RUN_STATE };
    },
    async get(caller, runId) {
      record("get", caller, runId);
      return runId === "missing" ? missing : { ok: true, value: FAKE_RUN_STATE };
    },
    async events(caller, runId, afterSeq, signal) {
      record("events", caller, runId, afterSeq);
      signals.push(signal);
      if (runId === "missing") return missing;
      async function* read(): AsyncGenerator<FluxNodeRunEvent> {
        let index = 0;
        for (;;) {
          while (index < log.length) {
            const event = log[index++]!;
            if (event.seq <= afterSeq) continue;
            yield event;
            if (event.type === "ended") return;
          }
          if (signal.aborted) return;
          await new Promise<void>((resolve) => {
            waiting.push(resolve);
            signal.addEventListener("abort", () => resolve(), { once: true });
          });
          if (signal.aborted) return;
        }
      }
      return { ok: true, value: read() };
    },
    async answer(caller, runId, answer) {
      record("answer", caller, runId, answer);
      return runId === "missing" ? missing : { ok: true, value: { accepted: true } };
    },
    async stop(caller, runId, request) {
      record("stop", caller, runId, request);
      return runId === "ended" ? { ok: false, refusal: { code: "run_ended", message: "The run has ended." } } : { ok: true, value: FAKE_RUN_STATE };
    },
    async list(caller, query) {
      record("list", caller, query);
      return { ok: true, value: { runs: [] } };
    },
    async exportFlow(caller, name, request) {
      record("exportFlow", caller, name, request);
      return { ok: false, refusal: { code: "unknown_fluxnode", message: "There is no such FluxNode." } };
    }
  };
}
