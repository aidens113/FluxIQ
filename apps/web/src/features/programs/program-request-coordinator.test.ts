import { afterEach, describe, expect, it, vi } from "vitest";
import { coordinateProgramRequest, programRequestPolicy, resetProgramRequestCoordinatorForTests } from "./program-request-coordinator";

afterEach(() => {
  resetProgramRequestCoordinatorForTests();
  vi.useRealTimers();
});

describe("global program request coordinator", () => {
  it("deduplicates concurrent reads and gives each caller independent cancellation", async () => {
    let resolveRequest!: (value: { ok: true; payload: string }) => void;
    const execute = vi.fn(() => new Promise<{ ok: true; payload: string }>((resolve) => { resolveRequest = resolve; }));
    const firstController = new AbortController();
    const policy = { timeoutMs: 1_000, retries: 0, deduplicate: true, retryDelayMs: 0 };
    const first = coordinateProgramRequest({ key: "GET:/snapshot", policy, signal: firstController.signal, execute });
    const second = coordinateProgramRequest({ key: "GET:/snapshot", policy, execute });
    firstController.abort();
    resolveRequest({ ok: true, payload: "ready" });
    await expect(first).resolves.toMatchObject({ aborted: true });
    await expect(second).resolves.toEqual({ ok: true, payload: "ready" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh read when a replacement consumer arrives after the last consumer aborted", async () => {
    const firstController = new AbortController();
    const policy = { timeoutMs: 1_000, retries: 0, deduplicate: true, retryDelayMs: 0 };
    const execute = vi.fn((signal: AbortSignal) => new Promise<{ ok: true; payload: string } | { ok: false; aborted: true }>((resolve) => {
      const call = execute.mock.calls.length;
      if (call === 1) signal.addEventListener("abort", () => resolve({ ok: false, aborted: true }), { once: true });
      else resolve({ ok: true, payload: "replacement-ready" });
    }));

    const abandoned = coordinateProgramRequest({ key: "GET:/database-manager/snapshot", policy, signal: firstController.signal, execute });
    firstController.abort();
    const replacement = coordinateProgramRequest({ key: "GET:/database-manager/snapshot", policy, execute });

    await expect(abandoned).resolves.toMatchObject({ aborted: true });
    await expect(replacement).resolves.toEqual({ ok: true, payload: "replacement-ready" });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("retries retryable reads but never retries mutations", async () => {
    const read = vi.fn<() => Promise<{ ok: boolean; retryable?: boolean; error?: string; payload?: string }>>()
      .mockResolvedValueOnce({ ok: false, retryable: true, error: "temporary" })
      .mockResolvedValueOnce({ ok: true, payload: "done" });
    await expect(coordinateProgramRequest({ key: "GET:/retry", policy: { timeoutMs: 1_000, retries: 1, deduplicate: false, retryDelayMs: 0 }, execute: read })).resolves.toMatchObject({ ok: true });
    expect(read).toHaveBeenCalledTimes(2);

    const mutation = vi.fn().mockResolvedValue({ ok: false, retryable: true, error: "temporary" });
    await coordinateProgramRequest({ key: "POST:/run", policy: programRequestPolicy("production-runner", "start", "POST"), execute: mutation });
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it("times out stalled reads with an actionable response", async () => {
    vi.useFakeTimers();
    const pending = coordinateProgramRequest({
      key: "GET:/slow",
      policy: { timeoutMs: 25, retries: 0, deduplicate: false, retryDelayMs: 0 },
      execute: (signal) => new Promise<{ ok: false; aborted: true }>((resolve) => signal.addEventListener("abort", () => resolve({ ok: false, aborted: true }), { once: true }))
    });
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).resolves.toMatchObject({ ok: false, status: 408, code: "request_timeout", retryable: true });
  });

  it("publishes view-appropriate policies", () => {
    expect(programRequestPolicy("docs", "snapshot", "GET")).toMatchObject({ timeoutMs: 20_000, retries: 2, deduplicate: true });
    expect(programRequestPolicy("docs", "get-page", "POST")).toMatchObject({ timeoutMs: 20_000, retries: 2, deduplicate: true });
    expect(programRequestPolicy("database-manager", "list-records", "POST")).toMatchObject({ timeoutMs: 15_000, retries: 2, deduplicate: true });
    expect(programRequestPolicy("deployment-sync", "sync", "POST")).toMatchObject({ timeoutMs: 120_000, retries: 0, deduplicate: false });
    expect(programRequestPolicy("identity-access", "update-user", "POST")).toMatchObject({ timeoutMs: 30_000, retries: 0, deduplicate: false });
  });
});
