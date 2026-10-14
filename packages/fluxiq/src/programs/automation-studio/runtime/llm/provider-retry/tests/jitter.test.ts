// A backoff is spread only when other calls share the endpoint (t534), and the
// spread never takes a wait past its stated bounds.
//
// One loop against one endpoint waits the table exactly, as before; concurrent
// builders that met one rate limit together must not all ask again together.

import { describe, expect, it } from "vitest";
import { AutomationStudioLlmProviderError } from "../../provider-contract.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../harness.ts";
import { automationStudioLlmProviderCall } from "../call.ts";
import { automationStudioLlmProviderRetryDecision } from "../decision.ts";
import { AutomationStudioLlmProviderEndpointLoad } from "../endpoint-load.ts";
import { AUTOMATION_STUDIO_LLM_PROVIDER_RETRY_LIMITS } from "../limits.ts";

const LIMITS = AUTOMATION_STUDIO_LLM_PROVIDER_RETRY_LIMITS;
const ANSWER = { response: { kind: "diagnosis", summary: "The control moved." } };

function decide(input: Partial<Parameters<typeof automationStudioLlmProviderRetryDecision>[0]>) {
  return automationStudioLlmProviderRetryDecision({ retryable: true, cancelled: false, attempt: 1, elapsedMs: 0, timeoutMs: 20_000, runAddedMs: 0, ...input });
}

describe("a spread backoff", () => {
  it("adds at most the stated fraction of the table's wait, and nothing for no draw", () => {
    for (const [attempt, tableMs] of [[1, LIMITS.backoffMs[0]!], [2, LIMITS.backoffMs[1]!]] as const) {
      expect(decide({ attempt })).toEqual({ retry: true, waitMs: tableMs, waitSource: "backoff" });
      expect(decide({ attempt, jitter: 0 })).toEqual({ retry: true, waitMs: tableMs, waitSource: "backoff" });
      expect(decide({ attempt, jitter: 1 })).toEqual({ retry: true, waitMs: Math.round(tableMs * (1 + LIMITS.jitterRatio)), waitSource: "backoff" });
      for (const draw of [0.1, 0.37, 0.5, 0.99]) {
        const decided = decide({ attempt, jitter: draw });
        if (!decided.retry) throw new Error("a spread backoff must still retry");
        expect(decided.waitMs).toBeGreaterThanOrEqual(tableMs);
        expect(decided.waitMs).toBeLessThanOrEqual(Math.min(LIMITS.maxWaitMs, tableMs * (1 + LIMITS.jitterRatio)));
      }
    }
  });

  it("holds a nonsense draw to the bounds rather than trusting it", () => {
    const tableMs = LIMITS.backoffMs[0]!;
    expect(decide({ jitter: -3 })).toMatchObject({ waitMs: tableMs });
    expect(decide({ jitter: 40 })).toMatchObject({ waitMs: Math.round(tableMs * (1 + LIMITS.jitterRatio)) });
    expect(decide({ jitter: Number.NaN })).toMatchObject({ waitMs: tableMs });
  });

  it("still yields to a longer provider hint and never waits past maxWaitMs", () => {
    expect(decide({ jitter: 1, hintedWaitMs: 4_800 })).toEqual({ retry: true, waitMs: 4_800, waitSource: "provider_hint" });
    expect(decide({ attempt: 2, jitter: 1, hintedWaitMs: 60_000 })).toEqual({ retry: true, waitMs: LIMITS.maxWaitMs, waitSource: "provider_hint" });
  });

  it("is projected against the run's allowance at the wait actually taken", () => {
    const spreadMs = Math.round(LIMITS.backoffMs[0]! * (1 + LIMITS.jitterRatio));
    // Room for the table's wait and the next attempt's deadline, not for the spread one.
    const runAddedMs = LIMITS.maxRunAddedMs - 20_000 - LIMITS.backoffMs[0]!;
    expect(decide({ runAddedMs, jitter: 0 })).toMatchObject({ retry: true });
    expect(decide({ runAddedMs, jitter: 1 })).toEqual({ retry: false, stop: "run_allowance" });
    expect(spreadMs).toBeGreaterThan(LIMITS.backoffMs[0]!);
  });
});

describe("a provider call's backoff, alone or beside others on one endpoint", () => {
  it("waits the table exactly when it is the only call on the endpoint", async () => {
    const waits: number[] = [];
    const endpoints = new AutomationStudioLlmProviderEndpointLoad();
    const outcome = await automationStudioLlmProviderCall({ provider: provider([rateLimited(), ANSWER]), request: request(), now: () => 0, wait: async (ms) => { waits.push(ms); }, endpoints, random: () => 0.99 });
    expect(outcome.ok).toBe(true);
    expect(waits).toEqual([LIMITS.backoffMs[0]]);
  });

  it("spreads the wait when another call is in flight on the same endpoint, and not on another endpoint", async () => {
    const endpoints = new AutomationStudioLlmProviderEndpointLoad();
    const sameEndpoint = endpoints.enter(AutomationStudioLlmProviderEndpointLoad.key({ provider: "deepseek" }));
    const waits: number[] = [];
    await automationStudioLlmProviderCall({ provider: provider([rateLimited(), ANSWER]), request: request(), now: () => 0, wait: async (ms) => { waits.push(ms); }, endpoints, random: () => 0.5 });
    expect(waits).toEqual([Math.round(LIMITS.backoffMs[0]! * (1 + LIMITS.jitterRatio * 0.5))]);
    sameEndpoint();

    const elsewhere = endpoints.enter(AutomationStudioLlmProviderEndpointLoad.key({ provider: "deepseek", endpoint: "https://other.example" }));
    const alone: number[] = [];
    await automationStudioLlmProviderCall({ provider: provider([rateLimited(), ANSWER]), request: request(), now: () => 0, wait: async (ms) => { alone.push(ms); }, endpoints, random: () => 0.5 });
    expect(alone).toEqual([LIMITS.backoffMs[0]]);
    elsewhere();
  });

  it("two calls that met one rate limit together wait different spread backoffs, each within the bounds", async () => {
    const endpoints = new AutomationStudioLlmProviderEndpointLoad();
    const draws = [0.1, 0.9];
    const waits: number[] = [];
    let gate!: () => void;
    const together = new Promise<void>((resolve) => { gate = resolve; });
    let waiting = 0;
    const wait = async (ms: number): Promise<void> => {
      waits.push(ms);
      waiting += 1;
      if (waiting === 2) gate();
      await together;
    };
    const [one, two] = await Promise.all([0, 1].map(async (index) => await automationStudioLlmProviderCall({ provider: provider([rateLimited(), ANSWER]), request: request(), now: () => 0, wait, endpoints, random: () => draws[index]! })));
    expect(one?.ok && two?.ok).toBe(true);
    expect(new Set(waits).size).toBe(2);
    for (const ms of waits) {
      expect(ms).toBeGreaterThanOrEqual(LIMITS.backoffMs[0]!);
      expect(ms).toBeLessThanOrEqual(LIMITS.backoffMs[0]! * (1 + LIMITS.jitterRatio));
    }
    // Both calls left the endpoint when they ended.
    expect(endpoints.shared(AutomationStudioLlmProviderEndpointLoad.key({ provider: "deepseek" }))).toBe(false);
  });

  it("leaves the endpoint however the call ends, and only once", async () => {
    const endpoints = new AutomationStudioLlmProviderEndpointLoad();
    const key = AutomationStudioLlmProviderEndpointLoad.key({ provider: "deepseek" });
    const other = endpoints.enter(key);
    const failing = provider([new AutomationStudioLlmProviderError("llm.provider_http_error", "bad request", false, 400)]);
    const outcome = await automationStudioLlmProviderCall({ provider: failing, request: request(), now: () => 0, wait: async () => undefined, endpoints });
    expect(outcome.ok).toBe(false);
    expect(endpoints.shared(key)).toBe(false);
    const mine = endpoints.enter(key);
    expect(endpoints.shared(key)).toBe(true);
    mine();
    mine();
    expect(endpoints.shared(key)).toBe(false);
    other();
  });
});

function rateLimited(): AutomationStudioLlmProviderError {
  return new AutomationStudioLlmProviderError("llm.provider_rate_limited", "rate limited", true, 429);
}

/** A provider that throws or answers each scripted entry in turn. */
function provider(script: readonly unknown[]): AutomationStudioLlmProvider {
  let asked = 0;
  return {
    metadata: { provider: "deepseek", model: "deepseek-flash" },
    runTask: async () => {
      const step = script[asked];
      asked += 1;
      if (step instanceof Error) throw step;
      return step;
    }
  };
}

function request(): AutomationStudioLlmTaskRequest {
  return { requestId: "request.spread", idempotencyKey: "request.spread", timeoutMs: 20_000 } as AutomationStudioLlmTaskRequest;
}
