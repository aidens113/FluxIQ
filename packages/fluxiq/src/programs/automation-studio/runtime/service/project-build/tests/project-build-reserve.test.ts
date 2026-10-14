// What a project build's supervisor keeps back of the Flow's purse (t551):
// the judged whole run and one repair round, held at the judge's own pricing,
// and never carved into a brief's allowance.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES, AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE } from "../reserve.ts";

describe("a project build's reserve", () => {
  it("is the judged whole run and one repair round's judged run, at the judge's reserve pricing", () => {
    expect(AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE).toEqual({
      calls: 4,
      unpriced: { inputTokens: AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.judgeInputTokens, outputTokens: AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.judgeReplyTokens }
    });
  });

  it("keeps four judge calls back from every allowance, so none can be carved from it", () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, maxCalls: 20 });
    purse.keepBackForJudging({ ...AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE, unpriced: { ...AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE.unpriced } });
    // The first judge call prices the reserve: each of its four calls is held at $0.015.
    const judged = purse.hold({ projectedCostUsd: 0.015, estimatedInputTokens: 1_000, maxOutputTokens: 100, judge: true });
    if (!judged.ok) throw new Error("expected the judge call to be held");
    judged.hold.settle({ estimatedCostUsd: 0.005 });
    expect(purse.keptBackUsd()).toBeCloseTo(0.06, 9);
    expect(purse.allocatableUsd()).toBeCloseTo(0.1 - 0.005 - 0.06, 9);
    expect(purse.allowance({ briefId: "brief.book", role: "builder", usd: 0.036 })).toMatchObject({ ok: false, refusal: { code: "llm_budget.allowance_unavailable", keptBackUsd: 0.06 } });
    expect(purse.allowance({ briefId: "brief.repair", role: "repair", usd: 0.036 }).ok).toBe(false);
    expect(purse.allowance({ briefId: "brief.book", role: "builder", usd: 0.035 }).ok).toBe(true);
  });
});
