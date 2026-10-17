// A judge paid by a brief's allowance first, and by the purse it was carved
// from only when the allowance cannot pay (t685, `../judge-backstop.ts`): the
// allowance and its top-ups pay while they can, the backstop pays what they
// cannot from the judging reserve, a refusal met first is put back when the
// backstop paid, and nothing changes outside a backstopped scope or for a call
// that is not a judge's.
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseJudgeBackstopScope, automationStudioLlmBuildPurseScope, type AutomationStudioLlmBuildPurseCall } from "../index.ts";

const JUDGE_USD = 0.005;
const price = () => JUDGE_USD;
const judge = (projectedCostUsd = JUDGE_USD): AutomationStudioLlmBuildPurseCall => ({ projectedCostUsd, estimatedInputTokens: 1_000, maxOutputTokens: 100, judge: true, price });
const decision = (projectedCostUsd: number): AutomationStudioLlmBuildPurseCall => ({ projectedCostUsd, estimatedInputTokens: 1_000, maxOutputTokens: 100, price });

/** A build purse of `ceilingUsd` with `spentUsd` already settled, keeping four judge calls back, and one builder allowance of `allowanceUsd`. */
function build(ceilingUsd: number, spentUsd: number, allowanceUsd: number) {
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd });
  if (spentUsd > 0) {
    const held = purse.hold({ projectedCostUsd: undefined, estimatedInputTokens: 1, maxOutputTokens: 1 });
    if (!held.ok) throw new Error("expected the earlier spend to be held");
    held.hold.settle({ estimatedCostUsd: spentUsd });
  }
  purse.keepBackForJudging({ calls: 4, unpriced: { inputTokens: 1_000, outputTokens: 100 } });
  // The purse learns the provider's price, as the harness's first call brings it; that call is never sent.
  const learned = purse.hold(decision(0));
  if (!learned.ok) throw new Error("expected the price-learning call to be held");
  learned.hold.release();
  expect(purse.refusal).toBeUndefined();
  const carved = purse.allowance({ role: "builder", briefId: "brief-1", usd: allowanceUsd });
  if (!carved.ok) throw new Error(`expected an allowance of ${allowanceUsd}: ${JSON.stringify(carved.refusal)}`);
  return { purse, allowance: carved.allowance };
}

function settle(held: ReturnType<AutomationStudioLlmBuildPurse["hold"]>): void {
  if (!held.ok) throw new Error(`expected the call to be held: ${JSON.stringify(held.refusal)}`);
  held.hold.settle({ estimatedCostUsd: JUDGE_USD });
}

describe("a judge's backstop", () => {
  it("lets the allowance pay a judge call it can, and the reserve stays whole", async () => {
    const { purse, allowance } = build(0.25, 0, 0.2);
    await automationStudioLlmBuildPurseJudgeBackstopScope(allowance, purse, async () => {
      for (let call = 0; call < 6; call += 1) settle(allowance.hold(judge()));
    });
    expect(allowance.spentUsd()).toBeCloseTo(6 * JUDGE_USD, 9);
    expect(purse.attributedSpend()).toEqual([expect.objectContaining({ role: "builder", briefId: "brief-1", spentUsd: expect.closeTo(6 * JUDGE_USD, 9) })]);
    allowance.close();
    expect(purse.judgingFits()).toBe(true);
  });

  it("holds a judge call the allowance and its top-ups cannot pay against the backstop, putting the allowance's refusal back", async () => {
    // $0.225 spent of $0.25 and four judge calls kept back: $0.005 could be carved, too little for a judge call and the top-up's finishing.
    const { purse, allowance } = build(0.25, 0.225, 0.001);
    await automationStudioLlmBuildPurseJudgeBackstopScope(allowance, purse, async () => {
      settle(allowance.hold(judge()));
      settle(allowance.hold(judge()));
      expect(allowance.refusal).toBeUndefined();
      expect(purse.refusal).toBeUndefined();
    });
    // The reserve paid both: none of it is the brief's spend.
    expect(allowance.spentUsd()).toBe(0);
    expect(purse.spentUsd()).toBeCloseTo(0.225 + 2 * JUDGE_USD, 9);
  });

  it("refuses with the backstop's figures when neither can pay", async () => {
    const { purse, allowance } = build(0.25, 0.225, 0.001);
    await automationStudioLlmBuildPurseJudgeBackstopScope(allowance, purse, async () => {
      const held = allowance.hold(judge(0.03));
      expect(held.ok).toBe(false);
      if (held.ok) return;
      expect(held.refusal).toMatchObject({ code: "llm_budget.run_cost_limit", ceilingUsd: 0.25 });
      expect(held.refusal).not.toHaveProperty("allowance");
    });
  });

  it("is no backstop for a call that is not a judge's", async () => {
    const { purse, allowance } = build(0.25, 0.225, 0.001);
    await automationStudioLlmBuildPurseJudgeBackstopScope(allowance, purse, async () => {
      expect(allowance.hold(decision(JUDGE_USD)).ok).toBe(false);
    });
  });

  // A candidate builder's own trials on a plan of several subflows are asked under a plain scope of the allowance.
  it("changes nothing outside a backstopped scope: the allowance alone refuses a judge call it cannot pay", async () => {
    const { allowance } = build(0.25, 0.225, 0.001);
    await automationStudioLlmBuildPurseScope(allowance, async () => {
      const held = allowance.hold(judge());
      expect(held.ok).toBe(false);
      if (!held.ok) expect(held.refusal).toMatchObject({ allowance: { briefId: "brief-1" } });
    });
    expect(allowance.hold(judge()).ok).toBe(false);
  });

  it("names only a purse the allowance was carved from", async () => {
    const { allowance } = build(0.25, 0, 0.1);
    const other = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1 });
    await expect(automationStudioLlmBuildPurseJudgeBackstopScope(allowance, other, async () => undefined)).rejects.toThrow("carved from");
    await expect(automationStudioLlmBuildPurseJudgeBackstopScope(allowance, allowance, async () => undefined)).rejects.toThrow("carved from");
  });
});
