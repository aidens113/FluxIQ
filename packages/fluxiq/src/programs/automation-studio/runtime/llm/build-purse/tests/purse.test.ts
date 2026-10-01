import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse } from "../purse.ts";
import { automationStudioLlmProjectedCallCostUsd } from "../projected-cost.ts";
import { AutomationStudioLlmBuildPurseRefused } from "../refused.ts";
import { automationStudioLlmBuildPurseRun, automationStudioLlmCurrentBuildPurse } from "../run.ts";
import { automationStudioLlmBuildPurseHoldCall } from "../harness-hold.ts";
import { createAutomationStudioDeepSeekProvider } from "../../deepseek/index.ts";

const call = (projectedCostUsd: number | undefined) => ({ projectedCostUsd, estimatedInputTokens: 477_506, maxOutputTokens: 8_000 });

describe("a build's purse", () => {
  it("refuses a call whose worst case would take what is spent past the ceiling, before it is sent", () => {
    // `run-mup2u8o3-6697c4be`: $0.154 spent, and the ninth decision priced at
    // worst at 477,506 uncached input tokens and 8,000 reply tokens.
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, spentUsd: () => 0.1539 });
    const deepSeek = createAutomationStudioDeepSeekProvider({ secretReference: { kind: "secret_reference", id: "secret:deepseek" }, model: "deepseek-flash", resolveSecret: async () => "unused" });
    const projected = automationStudioLlmProjectedCallCostUsd(deepSeek, 477_506, 8_000);
    expect(projected).toBeCloseTo(0.1529, 4);

    const held = purse.hold(call(projected));

    expect(held).toEqual({ ok: false, refusal: { code: "llm_budget.run_cost_limit", projectedCostUsd: projected, estimatedInputTokens: 477_506, maxOutputTokens: 8_000, spentUsd: 0.1539, pendingUsd: 0, ceilingUsd: 0.25 } });
    expect(purse.refusal).toEqual((held as { refusal: unknown }).refusal);
  });

  it("holds what calls in flight may cost, and gives it back when one was never sent", () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25 });
    const first = purse.hold(call(0.15));
    expect(first.ok).toBe(true);
    expect(purse.pendingUsd()).toBeCloseTo(0.15, 9);
    // In flight, the first call's worst case leaves no room for a second like it.
    expect(purse.hold(call(0.15)).ok).toBe(false);
    if (first.ok) first.hold.release();
    expect(purse.pendingUsd()).toBe(0);
    expect(purse.spentUsd()).toBe(0);
    expect(purse.hold(call(0.15)).ok).toBe(true);
  });

  it("charges what a call reported, the hold where it reported nothing, and never twice what the accounting also counted", () => {
    let accounted = 0;
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, spentUsd: () => accounted });
    const cached = purse.hold(call(0.15));
    if (cached.ok) cached.hold.settle({ inputTokens: 477_506, outputTokens: 100, totalTokens: 477_606, estimatedCostUsd: 0.01 });
    accounted = 0.01;
    expect(purse.spentUsd()).toBeCloseTo(0.01, 9);
    const silent = purse.hold(call(0.05));
    if (silent.ok) silent.hold.settle();
    expect(purse.spentUsd()).toBeCloseTo(0.06, 9);
  });

  it("counts a call that cost more than it was held at as a breach", () => {
    let breaches = 0;
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, onBreach: () => { breaches += 1; } });
    const held = purse.hold(call(0.02));
    if (held.ok) held.hold.settle({ inputTokens: 10, outputTokens: 10, totalTokens: 20, estimatedCostUsd: 0.03 });
    expect(purse.breaches).toBe(1);
    expect(breaches).toBe(1);
    const exact = purse.hold(call(0.02));
    if (exact.ok) exact.hold.settle({ inputTokens: 10, outputTokens: 10, totalTokens: 20, estimatedCostUsd: 0.02 });
    expect(purse.breaches).toBe(1);
  });

  it("refuses an unpriced call only once nothing is left, rather than holding the whole ceiling", () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, spentUsd: () => 0.2 });
    expect(purse.hold(call(undefined)).ok).toBe(true);
    const spent = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, spentUsd: () => 0.25 });
    expect(spent.hold(call(undefined))).toMatchObject({ ok: false, refusal: { spentUsd: 0.25, ceilingUsd: 0.25 } });
  });
});

describe("a call made under a purse", () => {
  it("is seen by the harness's hold, and nothing outside it is", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25 });
    expect(automationStudioLlmCurrentBuildPurse()).toBeUndefined();
    expect(automationStudioLlmBuildPurseHoldCall({ provider: {}, estimatedInputTokens: 1, maxOutputTokens: 1 })).toBeUndefined();
    await automationStudioLlmBuildPurseRun(purse, async () => {
      await Promise.resolve();
      expect(automationStudioLlmCurrentBuildPurse()).toBe(purse);
    });
    expect(automationStudioLlmCurrentBuildPurse()).toBeUndefined();
  });

  it("ends as the refusal whatever the caller made of the failed call, and says in figures why", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, spentUsd: () => 0.2 });
    const priced = { estimateCostUsd: () => 0.1 };
    let diagnostic: unknown;
    const thrown = automationStudioLlmBuildPurseRun(purse, async () => {
      const held = automationStudioLlmBuildPurseHoldCall({ provider: priced, estimatedInputTokens: 300_000, maxOutputTokens: 8_000 });
      diagnostic = held && !held.ok ? held.diagnostic : undefined;
      throw new Error("the caller's own reading of the failed result");
    });
    await expect(thrown).rejects.toBeInstanceOf(AutomationStudioLlmBuildPurseRefused);
    expect(diagnostic).toMatchObject({
      severity: "error",
      code: "llm_budget.run_cost_limit",
      message: "The build's spending limit of $0.2500 cannot pay for this call: $0.2000 is spent, $0.0000 is held for calls in flight and this request (300000 input tokens, 8000 for the reply) would cost up to $0.1000. It was not sent.",
      metadata: { projectedCostUsd: 0.1, spentUsd: 0.2, ceilingUsd: 0.25 }
    });
    // A call that returned normally after a refusal ends the same way.
    await expect(automationStudioLlmBuildPurseRun(purse, async () => {
      automationStudioLlmBuildPurseHoldCall({ provider: priced, estimatedInputTokens: 300_000, maxOutputTokens: 8_000 });
      return "swallowed";
    })).rejects.toBeInstanceOf(AutomationStudioLlmBuildPurseRefused);
  });
});
