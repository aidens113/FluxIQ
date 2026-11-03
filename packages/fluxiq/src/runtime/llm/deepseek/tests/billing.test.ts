// What a DeepSeek call is charged, and what goes on the wire about its reply
// (t254; user, 2026-10-03: "It should be billed at how much it actually costs,
// and i never told you to add any cap on output. Remove that").
//
// A call is charged at the rate in force when it is sent -- half outside
// DeepSeek's peak hours, on the UTC clock -- with its cached input at the cached
// rate, and held before it is sent at the rate in force then, all input
// uncached. No request sends `max_tokens`.
import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmHarnessInput } from "../../harness.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../index.ts";
import { AutomationStudioLlmProviderRetryLedger } from "../../provider-retry/index.ts";
import { automationStudioDeepSeekOffPeakAt, createAutomationStudioDeepSeekProvider, estimateAutomationStudioDeepSeekCostUsd } from "../index.ts";

/** Wednesday 2026-09-30, 02:00 UTC: inside the 01:00-04:00 peak window. */
const PEAK = Date.UTC(2026, 8, 30, 2);
/** Saturday 2026-10-03, 05:00 UTC: the weekend is off-peak all day (live run murzln6g ran then). */
const SATURDAY = Date.UTC(2026, 9, 3, 5);
/** DeepSeek flash's published peak rates per million tokens. */
const MISS = 0.3, HIT = 0.006, OUT = 1.2;

function deepSeek(now: () => number, usage: Record<string, unknown>, seen: string[] = []) {
  return createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => "test-secret",
    model: "deepseek-flash",
    now,
    fetchImpl: (async (_url: unknown, init?: RequestInit) => {
      seen.push(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "diagnosis", summary: "Judged." }) } }], usage }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch
  });
}

function call(provider: NonNullable<AutomationStudioLlmHarnessInput["provider"]>, taskKind: AutomationStudioLlmHarnessInput["taskKind"]) {
  return runAutomationStudioLlmHarness({
    taskKind, projectId: "project.llm", flowId: "flow.checkout", runId: "run.billing", instructions: [], provider,
    ...(taskKind === "evidence_tool_decision" ? { evidenceLoop: { iteration: 1, tools: [], evidence: [], decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema([], { type: "object" }, true), completionSchema: { type: "object" }, canComplete: true } } : {}),
    providerRetry: { wait: async () => {}, ledger: new AutomationStudioLlmProviderRetryLedger(), maxAttempts: 1 }
  });
}

describe("DeepSeek's off-peak hours, on the UTC clock", () => {
  it("bills weekends all day and weekdays outside 01:00-04:00 and 06:00-10:00 at half", () => {
    expect(automationStudioDeepSeekOffPeakAt(SATURDAY)).toBe(true);
    expect(automationStudioDeepSeekOffPeakAt(Date.UTC(2026, 9, 4, 2))).toBe(true); // Sunday 02:00
    expect(automationStudioDeepSeekOffPeakAt(PEAK)).toBe(false);
    expect(automationStudioDeepSeekOffPeakAt(Date.UTC(2026, 8, 30, 0, 59))).toBe(true);
    expect(automationStudioDeepSeekOffPeakAt(Date.UTC(2026, 8, 30, 4))).toBe(true);
    expect(automationStudioDeepSeekOffPeakAt(Date.UTC(2026, 8, 30, 6))).toBe(false);
    expect(automationStudioDeepSeekOffPeakAt(Date.UTC(2026, 8, 30, 9, 59))).toBe(false);
    expect(automationStudioDeepSeekOffPeakAt(Date.UTC(2026, 8, 30, 10))).toBe(true);
  });

  it("prices a call at half off-peak, and at the peak rate where no time is given", () => {
    expect(estimateAutomationStudioDeepSeekCostUsd(10_000, 500, 4_000, "deepseek-flash", SATURDAY)).toBeCloseTo(estimateAutomationStudioDeepSeekCostUsd(10_000, 500, 4_000, "deepseek-flash", PEAK) / 2, 15);
    expect(estimateAutomationStudioDeepSeekCostUsd(10_000, 500, 4_000, "deepseek-flash")).toBe(estimateAutomationStudioDeepSeekCostUsd(10_000, 500, 4_000, "deepseek-flash", PEAK));
  });
});

describe("what a DeepSeek call is charged and held at", () => {
  // 21,424 input tokens, 13,568 of them served from cache, and 248 output: a judge-sized call.
  const usage = { prompt_tokens: 21_424, completion_tokens: 248, total_tokens: 21_672, prompt_cache_hit_tokens: 13_568, prompt_cache_miss_tokens: 7_856 };
  const billedAtPeak = (7_856 * MISS + 13_568 * HIT + 248 * OUT) / 1_000_000;

  it("charges an off-peak call half, its cached input at the cached rate, from the usage DeepSeek reports", async () => {
    const result = await call(deepSeek(() => SATURDAY, usage), "loop_verification");
    expect(result.ok).toBe(true);
    expect(result.usage).toMatchObject({ inputTokens: 21_424, cacheHitInputTokens: 13_568, outputTokens: 248 });
    expect(result.usage?.estimatedCostUsd).toBeCloseTo(billedAtPeak / 2, 15);
  });

  it("charges a peak call the full rate, its cached input at the cached rate", async () => {
    const result = await call(deepSeek(() => PEAK, usage), "loop_verification");
    expect(result.usage?.estimatedCostUsd).toBeCloseTo(billedAtPeak, 15);
  });

  it("charges a call by when it was sent, not when its reply was read", async () => {
    // Sent at 00:59:59 on a Wednesday (off-peak), answered after the 01:00 peak window opened.
    const times = [Date.UTC(2026, 8, 30, 0, 59, 59), Date.UTC(2026, 8, 30, 1, 0, 5)];
    let read = 0;
    const result = await call(deepSeek(() => times[Math.min(read++, 1)]!, usage), "loop_verification");
    expect(result.usage?.estimatedCostUsd).toBeCloseTo(billedAtPeak / 2, 15);
  });

  it("holds a call before it is sent at the rate in force then, every input token uncached", () => {
    const offPeak = deepSeek(() => SATURDAY, usage);
    const peak = deepSeek(() => PEAK, usage);
    expect(peak.estimateCostUsd?.({ inputTokens: 21_424, outputTokens: 1_250 })).toBeCloseTo((21_424 * MISS + 1_250 * OUT) / 1_000_000, 15);
    expect(offPeak.estimateCostUsd?.({ inputTokens: 21_424, outputTokens: 1_250 })).toBeCloseTo((21_424 * MISS + 1_250 * OUT) / 2_000_000, 15);
  });
});

describe("no reply cap on any build, judge or repair request", () => {
  it("sends no max_tokens on a build decision, a judge call or a recovery diagnosis", async () => {
    const seen: string[] = [];
    const provider = deepSeek(() => PEAK, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, seen);
    for (const kind of ["evidence_tool_decision", "loop_verification", "runtime_diagnosis"] as const) await call(provider, kind);
    expect(seen).toHaveLength(3);
    for (const body of seen) {
      const sent = JSON.parse(body) as Record<string, unknown>;
      expect(sent).toMatchObject({ model: "deepseek-flash", temperature: 0 });
      expect(sent).not.toHaveProperty("max_tokens");
    }
  });

  it("takes a reply longer than the window check set aside, since no cap was sent", async () => {
    const provider = deepSeek(() => PEAK, { prompt_tokens: 100, completion_tokens: 9_000, total_tokens: 9_100 });
    const result = await call(provider, "loop_verification");
    expect(result.request.tokenLimits.maxOutputTokens).toBe(8_000);
    expect(result.ok).toBe(true);
    expect(result.usage).toMatchObject({ outputTokens: 9_000 });
  });
});
