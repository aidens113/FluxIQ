// What a retried provider call actually does, and what it writes down.
//
// The clock and the waiting are injected, so these assert the loop's arithmetic
// rather than the passage of time: a test that really waited four seconds to
// prove a backoff would be a test nobody runs. The scripted provider advances
// the clock by however long each attempt is supposed to have taken, and the
// scripted wait advances it by whatever it was asked to wait -- so elapsed time
// in these tests is exactly the time the loop believes it spent.

import { describe, expect, it } from "vitest";
import { AutomationStudioLlmProviderError } from "../../provider-contract.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../harness.ts";
import { automationStudioLlmProviderCall } from "../call.ts";
import { AutomationStudioLlmProviderRetryLedger } from "../ledger.ts";
import { AUTOMATION_STUDIO_LLM_PROVIDER_RETRY_LIMITS } from "../limits.ts";

const LIMITS = AUTOMATION_STUDIO_LLM_PROVIDER_RETRY_LIMITS;
const ANSWER = { response: { kind: "diagnosis", summary: "The control moved." } };
const FIRST_BACKOFF_MS = LIMITS.backoffMs[0] ?? 0;

describe("a provider call that meets a temporary fault", () => {
  it("asks again on a 429, honouring the wait the provider asked for", async () => {
    const clock = scriptedClock();
    const waits: number[] = [];
    // A structurally typed failure, because that is the shape an adapter that
    // carries a Retry-After would throw: Core's DeepSeek adapter does not carry
    // one yet, and the policy must be ready for the one that does.
    const provider = answering(clock, [{ throws: { code: "llm.provider_rate_limited", retryable: true, status: 429, message: "rate limited", retryAfter: "2" } }, { returns: ANSWER }]);
    const outcome = await automationStudioLlmProviderCall({ provider: provider.provider, request: request(), now: clock.now, wait: recordWaits(clock, waits) });

    expect(outcome.ok).toBe(true);
    expect(provider.asked).toBe(2);
    expect(waits).toEqual([2_000]);
    expect(outcome.retry.stop).toBe("answered");
    expect(outcome.retry.retries).toBe(1);
    expect(outcome.retry.waitedMs).toBe(2_000);
    expect(outcome.retry.attempts).toEqual([
      { attempt: 1, code: "llm.provider_rate_limited", status: 429, retryable: true, elapsedMs: 0, waitedMs: 2_000, waitSource: "provider_hint" }
    ]);
  });

  it("asks again on a 500, waiting the backoff table when the provider asked for nothing", async () => {
    const clock = scriptedClock();
    const waits: number[] = [];
    const provider = answering(clock, [
      { throws: new AutomationStudioLlmProviderError("llm.provider_http_error", "upstream", true, 500) },
      { throws: new AutomationStudioLlmProviderError("llm.provider_http_error", "upstream", true, 500) },
      { returns: ANSWER }
    ]);
    const outcome = await automationStudioLlmProviderCall({ provider: provider.provider, request: request(), now: clock.now, wait: recordWaits(clock, waits) });

    expect(outcome.ok).toBe(true);
    expect(provider.asked).toBe(3);
    expect(waits).toEqual([...LIMITS.backoffMs]);
    expect(outcome.retry.retries).toBe(2);
    expect(outcome.retry.attempts.map((attempt) => attempt.waitSource)).toEqual(["backoff", "backoff"]);
    expect(outcome.retry.attempts.map((attempt) => attempt.status)).toEqual([500, 500]);
  });

  it("gives up under the name of the bound that stopped it once the attempts are spent", async () => {
    const clock = scriptedClock();
    const provider = answering(clock, [{ throws: rateLimited() }, { throws: rateLimited() }, { throws: rateLimited() }, { returns: ANSWER }]);
    const outcome = await automationStudioLlmProviderCall({ provider: provider.provider, request: request(), now: clock.now, wait: recordWaits(clock, []) });

    expect(outcome.ok).toBe(false);
    expect(provider.asked).toBe(LIMITS.maxAttempts);
    expect(outcome.retry.stop).toBe("attempts_exhausted");
    expect(outcome.retry.attempts).toHaveLength(LIMITS.maxAttempts);
    // The failure the caller reports is the provider's own, not the loop's.
    expect(outcome.ok === false && outcome.failure.code).toBe("llm.provider_rate_limited");
  });
});

describe("a provider call that meets a deterministic refusal", () => {
  it("asks once for a 400 and reports it, spending nothing on being told twice", async () => {
    const clock = scriptedClock();
    const provider = answering(clock, [{ throws: new AutomationStudioLlmProviderError("llm.provider_http_error", "invalid request", false, 400) }]);
    const outcome = await automationStudioLlmProviderCall({
      provider: provider.provider,
      request: request(),
      now: clock.now,
      wait: async () => { throw new Error("nothing may wait for a refusal that will answer the same way."); }
    });

    expect(provider.asked).toBe(1);
    expect(outcome.ok).toBe(false);
    expect(outcome.retry.stop).toBe("not_retryable");
    expect(outcome.retry.retries).toBe(0);
    expect(outcome.retry.waitedMs).toBe(0);
    expect(outcome.retry.addedMs).toBe(0);
  });

  it("asks once for a rejected credential", async () => {
    const clock = scriptedClock();
    const provider = answering(clock, [{ throws: new AutomationStudioLlmProviderError("llm.provider_auth_failed", "credential", false, 401) }]);
    const outcome = await automationStudioLlmProviderCall({ provider: provider.provider, request: request(), now: clock.now, wait: recordWaits(clock, []) });

    expect(provider.asked).toBe(1);
    expect(outcome.retry.stop).toBe("not_retryable");
  });
});

describe("what a retried call may cost", () => {
  it("stays inside the per-call ceiling when every attempt is slow", async () => {
    const clock = scriptedClock();
    // Every attempt burns its whole 25 000 ms deadline, which is the Lab's.
    const provider = answering(clock, [{ throws: rateLimited(), takesMs: 25_000 }, { throws: rateLimited(), takesMs: 25_000 }, { throws: rateLimited(), takesMs: 25_000 }]);
    const outcome = await automationStudioLlmProviderCall({ provider: provider.provider, request: request({ timeoutMs: 25_000 }), now: clock.now, wait: recordWaits(clock, []) });

    // One retry, not two: a second would have projected 79 000 ms against a
    // 60 000 ms ceiling.
    expect(provider.asked).toBe(2);
    expect(outcome.retry.stop).toBe("call_deadline");
    expect(clock.now()).toBeLessThanOrEqual(LIMITS.maxCallMs);
    // What the retrying added: the one backoff, and the retried attempt itself.
    expect(outcome.retry.addedMs).toBe(FIRST_BACKOFF_MS + 25_000);
  });

  it("stops retrying once the run has spent its whole allowance, across calls", async () => {
    const clock = scriptedClock();
    const ledger = new AutomationStudioLlmProviderRetryLedger();
    ledger.spend("run.busy", LIMITS.maxRunAddedMs - 1_000);
    const provider = answering(clock, [{ throws: rateLimited() }, { returns: ANSWER }]);
    const outcome = await automationStudioLlmProviderCall({ provider: provider.provider, request: request(), now: clock.now, runId: "run.busy", ledger, wait: recordWaits(clock, []) });

    expect(provider.asked).toBe(1);
    expect(outcome.retry.stop).toBe("run_allowance");
  });

  it("charges the run for every wait and every retried attempt", async () => {
    const clock = scriptedClock();
    const ledger = new AutomationStudioLlmProviderRetryLedger();
    const provider = answering(clock, [{ throws: rateLimited() }, { returns: ANSWER, takesMs: 4_000 }]);
    await automationStudioLlmProviderCall({ provider: provider.provider, request: request(), now: clock.now, runId: "run.charged", ledger, wait: recordWaits(clock, []) });

    // The first backoff, plus the retried attempt's own 4 000 ms. A call that
    // answers first time charges nothing at all.
    expect(ledger.addedMs("run.charged")).toBe(FIRST_BACKOFF_MS + 4_000);
  });

  it("stops when the caller's signal is aborted while it is waiting", async () => {
    const clock = scriptedClock();
    const controller = new AbortController();
    const provider = answering(clock, [{ throws: rateLimited() }, { returns: ANSWER }]);
    const outcome = await automationStudioLlmProviderCall({
      provider: provider.provider,
      request: request(),
      now: clock.now,
      signal: controller.signal,
      wait: async () => { controller.abort(); }
    });

    expect(provider.asked).toBe(1);
    expect(outcome.retry.stop).toBe("cancelled");
    // The fault reported is the one that was actually met, not the cancellation.
    expect(outcome.ok === false && outcome.failure.code).toBe("llm.provider_rate_limited");
  });
});

function rateLimited(): AutomationStudioLlmProviderError {
  return new AutomationStudioLlmProviderError("llm.provider_rate_limited", "rate limited", true, 429);
}

type ScriptedClock = { now: () => number; advance: (milliseconds: number) => void };

/** A clock that moves only when a test says it moved. */
function scriptedClock(): ScriptedClock {
  let at = 0;
  return { now: () => at, advance: (milliseconds) => { at += milliseconds; } };
}

/**
 * A provider that answers a scripted list, one entry per attempt, and advances
 * the clock by however long that attempt took.
 *
 * A `throws` entry is thrown exactly as written, so a test can throw the real
 * failure class or the structurally typed shape a foreign adapter would.
 */
function answering(
  clock: ScriptedClock,
  script: readonly ({ returns: unknown; takesMs?: number } | { throws: unknown; takesMs?: number })[]
): { provider: AutomationStudioLlmProvider; readonly asked: number } {
  let asked = 0;
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "deepseek", model: "deepseek-flash" },
    runTask: async () => {
      const step = script[asked];
      asked += 1;
      if (step === undefined) throw new Error(`The provider was asked ${asked} times and the script has ${script.length} answers.`);
      clock.advance(step.takesMs ?? 0);
      if ("throws" in step) throw step.throws;
      return step.returns;
    }
  };
  return { provider, get asked() { return asked; } };
}

/** A wait that spends the clock but not the suite's wall time. */
function recordWaits(clock: ScriptedClock, waits: number[]): (milliseconds: number) => Promise<void> {
  return async (milliseconds) => {
    waits.push(milliseconds);
    clock.advance(milliseconds);
  };
}

/**
 * The one field the loop reads off a request, plus the identity a provider echoes.
 *
 * Built by hand rather than packed: this exercises the retry loop, and packing a
 * real context would put a hundred lines of instruction resolution between the
 * test and what it asserts.
 */
function request(overrides: Partial<AutomationStudioLlmTaskRequest> = {}): AutomationStudioLlmTaskRequest {
  return { requestId: "request.retried", idempotencyKey: "request.retried", timeoutMs: 20_000, ...overrides } as AutomationStudioLlmTaskRequest;
}
