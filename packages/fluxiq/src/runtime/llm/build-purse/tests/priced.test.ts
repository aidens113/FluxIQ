// A call whose provider prices nothing, as Studio's hold makes it (`../priced.ts`, `../observed-cost.ts`, t1056): held at
// Core's default model's rates, never as free, and never below what a call on the purse was seen to cost. The second
// part is what a build's final judged run depends on: a provider whose calls reported more than the default's rates had
// every call overshoot its hold, and the overshoot, not the judge, spent what was kept back for judging.
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseHoldCall, automationStudioLlmBuildPursePriced, automationStudioLlmBuildPurseScope } from "../index.ts";

const unpriced = {};
const JUDGING = { calls: 2, unpriced: { inputTokens: 8_000, outputTokens: 1_250 } };
const hold = (judge = false) => automationStudioLlmBuildPurseHoldCall({ provider: unpriced, estimatedInputTokens: 1_000, maxOutputTokens: 750, ...(judge ? { judge: true } : {}) });

describe("a call whose provider prices nothing", () => {
  it("is priced at Core's default model's rates, and at the provider's own price where it gives one", () => {
    const priced = automationStudioLlmBuildPursePriced(unpriced);
    const usd = priced.estimateCostUsd!({ inputTokens: 1_000, outputTokens: 750 });
    expect(usd).toBeGreaterThan(0);
    expect(automationStudioLlmBuildPursePriced({ estimateCostUsd: () => 0.07 }).estimateCostUsd!({ inputTokens: 1_000, outputTokens: 750 })).toBe(0.07);
    // A price of nothing, or one that throws, is no price.
    expect(automationStudioLlmBuildPursePriced({ estimateCostUsd: () => 0 }).estimateCostUsd!({ inputTokens: 1_000, outputTokens: 750 })).toBe(usd);
    expect(automationStudioLlmBuildPursePriced({ estimateCostUsd: () => { throw new Error("no clock"); } }).estimateCostUsd!({ inputTokens: 1_000, outputTokens: 750 })).toBe(usd);
    // Never below what was seen, never above the provider's own price.
    expect(automationStudioLlmBuildPursePriced(unpriced, () => 0.05).estimateCostUsd!({ inputTokens: 1_000, outputTokens: 750 })).toBe(0.05);
    expect(automationStudioLlmBuildPursePriced({ estimateCostUsd: () => 0.07 }, () => 0.5).estimateCostUsd!({ inputTokens: 1_000, outputTokens: 750 })).toBe(0.07);
  });

  it("is held, after a call reported costing more, at that cost: the next one that would cross the ceiling is refused unsent", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    await automationStudioLlmBuildPurseScope(purse, async () => {
      const first = hold();
      expect(first?.ok).toBe(true);
      const defaultUsd = purse.pendingUsd();
      expect(defaultUsd).toBeGreaterThan(0);
      expect(defaultUsd).toBeLessThan(0.03);
      if (first?.ok) first.hold.settle({ inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100, estimatedCostUsd: 0.04 });
      const second = hold();
      expect(purse.pendingUsd()).toBeCloseTo(0.04, 10);
      if (second?.ok) second.hold.settle({ inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100, estimatedCostUsd: 0.04 });
      // $0.08 spent; a third held at $0.04 would reach $0.12.
      expect(hold()).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_cost_limit", metadata: { projectedCostUsd: 0.04, spentUsd: 0.08 } } });
    });
    expect(purse.spentUsd()).toBeCloseTo(0.08, 10);
    // Only the first call overshot: every later one was held at what such calls cost.
    expect(purse.breaches).toBe(1);
  });

  it("holds a judge's call at what a judge's call was seen to cost, and keeps the judging pair back at that", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25 });
    purse.keepBackForJudging(JUDGING);
    const usage = (estimatedCostUsd: number) => ({ inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100, estimatedCostUsd });
    await automationStudioLlmBuildPurseScope(purse, async () => {
      const decision = hold();
      if (decision?.ok) decision.hold.settle(usage(0.01));
      // A decision does not price judging: the pair is still held at the default's price for a judge-sized call.
      expect(purse.judgingHoldUsd()).toBeLessThan(0.01);
      const first = hold(true);
      if (first?.ok) first.hold.settle(usage(0.05));
      // The first judge's call is the first seen; the second is held at what it cost, and so is the pair from then on.
      const second = hold(true);
      expect(purse.pendingUsd()).toBeCloseTo(0.05, 10);
      if (second?.ok) second.hold.settle(usage(0.05));
      expect(purse.judgingHoldUsd()).toBeCloseTo(0.1, 10);
      // $0.11 spent: a decision, held at the most any call cost ($0.05), beside the pair kept back ($0.10) would cross $0.25.
      expect(hold()).toMatchObject({ ok: false, diagnostic: { metadata: { projectedCostUsd: 0.05, keptBackUsd: 0.1 } } });
      // The pair kept back is whole, and the next judgement is paid from it.
      expect(purse.judgingFits()).toBe(true);
    });
    expect(purse.spentUsd()).toBeCloseTo(0.11, 10);
  });
});
