import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse } from "../purse.ts";
import { automationStudioLlmProjectedCallCostUsd } from "../projected-cost.ts";
import { AutomationStudioLlmBuildPurseRefused } from "../refused.ts";
import { automationStudioLlmBuildPurseRun, automationStudioLlmBuildPurseScope, automationStudioLlmCurrentBuildPurse } from "../run.ts";
import { automationStudioLlmBuildPurseHoldCall } from "../harness-hold.ts";
import { createAutomationStudioDeepSeekProvider } from "../../deepseek/index.ts";

/** A peak instant, Wednesday 2026-09-30 02:00 UTC: DeepSeek bills calls at their send time, peak or off-peak (t254), and these figures are peak. */
const PEAK_CLOCK = (): number => Date.UTC(2026, 8, 30, 2);

const call = (projectedCostUsd: number | undefined) => ({ projectedCostUsd, estimatedInputTokens: 477_506, maxOutputTokens: 8_000 });

describe("a build's purse", () => {
  it("refuses a call whose worst case would take what is spent past the ceiling, before it is sent", () => {
    // `run-mup2u8o3-6697c4be`: $0.154 spent, and the ninth decision priced at
    // worst at 477,506 uncached input tokens and 8,000 reply tokens.
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, spentUsd: () => 0.1539 });
    const deepSeek = createAutomationStudioDeepSeekProvider({ now: PEAK_CLOCK, secretReference: { kind: "secret_reference", id: "secret:deepseek" }, model: "deepseek-flash", resolveSecret: async () => "unused" });
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

  it("holds an unpriced call at the most any call here has reported costing, so like calls stop before the ceiling (t234)", () => {
    // A refuted result's repair ladder: $0.03 a call, unpriced, under $0.10. Held at nothing, the fourth call went out at $0.09 and the ladder spent $0.12.
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    let sent = 0;
    for (let i = 0; i < 10; i += 1) {
      const held = purse.hold(call(undefined));
      if (!held.ok) break;
      sent += 1;
      held.hold.settle({ inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.03 });
    }
    expect(sent).toBe(3);
    expect(purse.spentUsd()).toBeCloseTo(0.09, 9);
    expect(purse.refusal).toMatchObject({ spentUsd: 0.09, ceilingUsd: 0.1 });
    expect(purse.refusal?.code).toBe("llm_budget.run_cost_limit");
    if (purse.refusal?.code !== "llm_budget.run_cost_limit") throw new Error("Expected a cost-only refusal");
    expect(purse.refusal.projectedCostUsd).toBeUndefined();
  });

  it("counts what earlier builds of the same Flow creation spent, and says so when it refuses (t234)", () => {
    // run-muqbzu32-8691a65e stopped with $0.0738 spent of $0.10; building again carried a fresh ceiling.
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.0738 });
    expect(purse.carriedUsd).toBe(0.0738);
    expect(purse.spentUsd()).toBeCloseTo(0.0738, 9);
    expect(purse.leftUsd()).toBeCloseTo(0.0262, 9);
    // The next decision at worst: about 79,460 estimated input tokens all uncached and 2,000 reply tokens fits; more does not.
    const fits = purse.hold({ projectedCostUsd: 0.0262, estimatedInputTokens: 79_400, maxOutputTokens: 2_000 });
    expect(fits.ok).toBe(true);
    if (fits.ok) fits.hold.settle({ inputTokens: 79_000, outputTokens: 120, totalTokens: 79_120, estimatedCostUsd: 0.0151 });
    expect(purse.spentUsd()).toBeCloseTo(0.0889, 9);
    const refused = purse.hold({ projectedCostUsd: 0.0275, estimatedInputTokens: 84_000, maxOutputTokens: 2_000 });
    expect(refused).toMatchObject({ ok: false, refusal: { spentUsd: 0.0889, carriedUsd: 0.0738, ceilingUsd: 0.1, projectedCostUsd: 0.0275 } });
    expect(purse.leftUsd()).toBeCloseTo(0.0111, 9);
  });

  it("refuses a carried spend that is not a finite, non-negative amount", () => {
    expect(() => new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: Number.NaN })).toThrow();
    expect(() => new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: -0.01 })).toThrow();
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

  it("holds every call made inside a build's scope, and throws nothing for a refusal the caller reads itself (t234)", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.09 });
    const priced = { estimateCostUsd: () => 0.02 };
    const outcome = await automationStudioLlmBuildPurseScope(purse, async () => {
      // A judge's call, made inside the build with no loop around it.
      const held = automationStudioLlmBuildPurseHoldCall({ provider: priced, estimatedInputTokens: 20_000, maxOutputTokens: 2_000 });
      return held && !held.ok ? held.diagnostic.code : "sent";
    });
    expect(outcome).toBe("llm_budget.run_cost_limit");
    expect(purse.refusal).toMatchObject({ spentUsd: 0.09, carriedUsd: 0.09, projectedCostUsd: 0.02 });
    expect(automationStudioLlmCurrentBuildPurse()).toBeUndefined();
  });
});

// t254: judging is kept back while a build explores, and a reply is held at a
// reserve, never a cap, so an overshoot is recorded rather than hidden.
describe("a build's purse keeping its judging back (t254)", () => {
  /** DeepSeek flash's peak rates, every input token a miss: how the harness prices a hold. */
  const flash = (inputTokens: number, outputTokens: number) => (inputTokens * 0.3 + outputTokens * 1.2) / 1_000_000;
  const decision = (projectedCostUsd: number) => ({ projectedCostUsd, estimatedInputTokens: 20_000, maxOutputTokens: 750, price: flash });
  const judgeCall = (projectedCostUsd: number) => ({ projectedCostUsd, estimatedInputTokens: 6_409, maxOutputTokens: 1_250, judge: true, price: flash });
  const JUDGING = { calls: 2, unpriced: { inputTokens: 8_000, outputTokens: 1_250 } };

  it("refuses a decision that would fit only by spending the judging pair, and says what was kept back", () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.08 });
    purse.keepBackForJudging(JUDGING);
    // Before any judge is priced, each judge call of the pair is held at the standing allowance: 8,000 input and 1,250 reply tokens.
    expect(purse.keptBackUsd()).toBe(0);
    const fits = purse.hold(decision(0.01));
    expect(fits.ok).toBe(true);
    if (fits.ok) fits.hold.settle({ estimatedCostUsd: 0.004 });
    expect(purse.keptBackUsd()).toBeCloseTo(2 * flash(8_000, 1_250), 12);
    // $0.084 spent: a $0.01 decision fits the $0.016 left, but not beside the $0.0078 pair.
    const refused = purse.hold(decision(0.01));
    expect(refused).toMatchObject({ ok: false, refusal: { spentUsd: 0.084, pendingUsd: 0, keptBackUsd: expect.closeTo(0.0078, 9), projectedCostUsd: 0.01 } });
    // The judge draws on the pair: its call fits where the decision did not.
    const judged = purse.hold(judgeCall(flash(6_409, 1_250)));
    expect(judged.ok).toBe(true);
    // Once a judge is priced, the pair is held at the largest judge call priced.
    expect(purse.judgingHoldUsd()).toBeCloseTo(2 * flash(6_409, 1_250), 12);
    // The reserve is never charged: what is spent is only what calls settled at.
    expect(purse.spentUsd()).toBeCloseTo(0.084, 12);
    expect(purse.leftUsd()).toBeCloseTo(0.016 - flash(6_409, 1_250), 12);
  });

  it("keeps nothing back for a build the phases gave no judge", () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.08 });
    expect(purse.hold(decision(0.019)).ok).toBe(true);
    expect(purse.keptBackUsd()).toBe(0);
    expect(purse.judgingHoldUsd()).toBeUndefined();
  });

  it("states the judging reserve in a refused call's message", () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.09 });
    purse.keepBackForJudging(JUDGING);
    const diagnostic = (() => {
      let said: unknown;
      void automationStudioLlmBuildPurseScope(purse, async () => {
        const held = automationStudioLlmBuildPurseHoldCall({ provider: { estimateCostUsd: ({ inputTokens, outputTokens }) => flash(inputTokens, outputTokens) }, estimatedInputTokens: 10_000, maxOutputTokens: 750 });
        said = held && !held.ok ? held.diagnostic.message : undefined;
      });
      return said;
    })();
    expect(diagnostic).toBe("The build's spending limit of $0.1000 cannot pay for this call: $0.0900 is spent, $0.0000 is held for calls in flight, $0.0078 is kept back for judging the Flow and this request (10000 input tokens, 750 for the reply) would cost up to $0.0039. It was not sent.");
  });

  // Live run run-mux6nxst-c9bca37c (D3-5): the next round opened with 47 of 48 calls spent. The pair kept back for
  // judging is held only against calls that are not a judge's, so nothing said the pair itself no longer fitted, and the
  // reserve judgement's confirming call was refused after its first yes.
  it("says whether the whole judging kept back can still be held, on calls and on cost", () => {
    // Nothing kept back: nothing to fit.
    const none = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, maxCalls: 1, carriedUsd: 0.1 });
    expect(none.judgingFits()).toBe(true);

    // Calls: 47 of 48 spent leaves one call, and the pair needs two.
    const calls = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1, maxCalls: 48 });
    calls.keepBackForJudging(JUDGING);
    for (let index = 0; index < 46; index += 1) {
      const held = calls.hold(decision(0.0001));
      if (!held.ok) throw new Error(`expected decision ${index} to fit`);
      held.hold.settle({ estimatedCostUsd: 0.0001 });
    }
    expect(calls.judgingFits()).toBe(true);
    const judgeCallHeld = calls.hold(judgeCall(0.0001));
    if (!judgeCallHeld.ok) throw new Error("expected the judge call to fit");
    // In flight, the call counts: 46 spent, 1 pending and the pair is 49 of 48.
    expect(calls.judgingFits()).toBe(false);
    judgeCallHeld.hold.settle({ estimatedCostUsd: 0.0001 });
    expect(calls.spentCalls()).toBe(47);
    expect(calls.judgingFits()).toBe(false);

    // Cost: the pair at the standing allowance, $0.0078, once a decision has brought the price, beside $0.09 carried of $0.10.
    const cost = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.09 });
    cost.keepBackForJudging(JUDGING);
    const priced = cost.hold(decision(0.001));
    if (priced.ok) priced.hold.settle({ estimatedCostUsd: 0.001 });
    expect(cost.judgingFits()).toBe(true);
    const more = cost.hold(decision(0.001));
    if (more.ok) more.hold.settle({ estimatedCostUsd: 0.0013 });
    // $0.0923 spent: $0.0077 left, short of the $0.0078 pair.
    expect(cost.judgingFits()).toBe(false);

    // A pair nothing could price yet is not refused on cost.
    const unpriced = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.0999 });
    unpriced.keepBackForJudging(JUDGING);
    expect(unpriced.judgingHoldUsd()).toBeUndefined();
    expect(unpriced.judgingFits()).toBe(true);
  });

  it("records a reply that cost more than its reserve as a breach and its overshoot in dollars, never hidden", () => {
    let told = 0;
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.098, onBreach: () => { told += 1; } });
    // A decision held at its 750-token reply reserve replied with 1,500 tokens: $0.0009 more than its hold.
    const held = purse.hold({ projectedCostUsd: flash(1_000, 750), estimatedInputTokens: 1_000, maxOutputTokens: 750 });
    if (!held.ok) throw new Error("expected the hold to fit");
    held.hold.settle({ inputTokens: 1_000, outputTokens: 1_500, totalTokens: 2_500, estimatedCostUsd: flash(1_000, 1_500) });
    expect(purse.breaches).toBe(1);
    expect(told).toBe(1);
    expect(purse.overshootUsd).toBeCloseTo(flash(0, 750), 12);
    // The ceiling was crossed by that overshoot alone, and nothing more fits.
    expect(purse.spentUsd()).toBeCloseTo(0.098 + flash(1_000, 1_500), 12);
    expect(purse.leftUsd()).toBe(0);
    expect(purse.hold({ projectedCostUsd: 0.0001, estimatedInputTokens: 10, maxOutputTokens: 750 }).ok).toBe(false);
  });
});
