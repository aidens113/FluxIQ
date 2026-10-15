// An allowance topped up from the purse it was carved from when its next call
// does not fit it (t627): granted only from what the purse could carve beyond
// its own finishing, bounded by the allowance's own size, recorded with its
// amount and reason, and never past the ceiling or into the judging reserve.
// When the purse cannot pay, the allowance refuses exactly as before.
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseHoldCall, automationStudioLlmBuildPurseScope, automationStudioLlmFlowPurseScope, type AutomationStudioLlmBuildPurseCall } from "../index.ts";

const call = (projectedCostUsd: number, judge = false): AutomationStudioLlmBuildPurseCall => ({ projectedCostUsd, estimatedInputTokens: 1_000, maxOutputTokens: 100, ...(judge ? { judge: true } : {}) });

function carve(purse: AutomationStudioLlmBuildPurse, briefId: string, usd: number): AutomationStudioLlmBuildPurse {
  const carved = purse.allowance({ briefId, role: "builder", usd });
  if (!carved.ok) throw new Error(`expected an allowance of ${usd} for ${briefId}`);
  return carved.allowance;
}

/** Hold a call and settle it at `costUsd`; whether it was held. */
function spend(purse: AutomationStudioLlmBuildPurse, heldUsd: number, costUsd: number): boolean {
  const held = purse.hold(call(heldUsd));
  if (held.ok) held.hold.settle({ estimatedCostUsd: costUsd });
  return held.ok;
}

/** A project build's purse as the supervisor opens it: $0.25, judging for the whole run and one repair round priced, its finishing calls kept back. */
function projectBuild(): AutomationStudioLlmBuildPurse {
  const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, maxCalls: 250 });
  build.keepBackForJudging({ calls: 4, unpriced: { inputTokens: 8_000, outputTokens: 1_250 } });
  build.keepBackCallsFromAllowances(10);
  // A judge call held at $0.01 prices the reserve's four at $0.04.
  const judged = build.hold(call(0.01, true));
  if (judged.ok) judged.hold.settle({ estimatedCostUsd: 0.004 });
  return build;
}

describe("an allowance short of its next call", () => {
  it("is topped up from the build's purse and continues, with the judging reserve and the ceiling intact, and the next brief is carved from what is left", () => {
    const build = projectBuild();
    expect(build.keptBackUsd()).toBeCloseTo(0.04, 9);
    // Two subflows and the build's finishing: three shares, as the brief sizing splits them.
    const share = build.allocatableUsd() / 3;
    const first = carve(build, "brief-1", share);
    // The builder's calls are held at $0.025 at worst and cost $0.002 at a cached rate, until what is left cannot hold the next.
    let calls = 0;
    while (first.leftUsd() >= 0.025) {
      expect(spend(first, 0.025, 0.002)).toBe(true);
      calls += 1;
    }
    expect(calls).toBe(22);
    const leftBefore = first.leftUsd();
    // Before t627 this call was refused `llm_budget.run_cost_limit` with $0.184 still in the build's purse.
    const held = first.hold(call(0.025));
    expect(held.ok).toBe(true);
    if (held.ok) held.hold.settle({ estimatedCostUsd: 0.002 });
    const [grant, ...more] = first.toppedUp();
    expect(more).toEqual([]);
    expect(grant!.shortfallUsd).toBeCloseTo(0.025 - leftBefore, 9);
    expect(grant!.usd).toBeCloseTo(grant!.shortfallUsd + 0.025, 9);
    expect(grant!.heldUsd).toBe(0.025);
    expect(grant!.reason).toMatch(/^The next call, held at \$0\.0250, was \$0\.0003 short of this allowance; the build's purse could still give \$0\.09\d\d beyond its judging reserve, other briefs' allowances and its own finishing, so \$0\.0253 was added\.$/);
    expect(first.ceilingUsd).toBeCloseTo(share + grant!.usd, 9);
    expect(first.carvedUsd).toBe(share);
    // The builder goes on: one grant carries it several calls at what calls actually cost.
    for (let index = 0; index < 5; index += 1) expect(spend(first, 0.025, 0.002)).toBe(true);
    expect(first.toppedUp()).toHaveLength(1);
    // Nothing above moved: the build's ceiling, its judging reserve, and the reserve still fits.
    expect(build.ceilingUsd).toBe(0.25);
    expect(build.keptBackUsd()).toBeCloseTo(0.04, 9);
    expect(build.judgingFits()).toBe(true);
    expect(build.spentUsd() + build.pendingUsd()).toBeLessThanOrEqual(0.25);
    expect(build.attributedSpend()).toMatchObject([{ briefId: "brief-1", allottedUsd: share, topUps: [{ usd: grant!.usd }] }]);
    // Its subflow passed; the second brief, sized at dispatch, is carved from what the first left.
    first.close();
    expect(build.allocatableUsd()).toBeCloseTo(0.25 - 0.004 - first.spentUsd() - 0.04, 9);
    const second = carve(build, "brief-2", share);
    expect(spend(second, 0.025, 0.002)).toBe(true);
    expect(second.toppedUp()).toEqual([]);
    expect(build.attributedSpend().map((entry) => [entry.briefId, entry.topUps?.length ?? 0])).toEqual([["brief-1", 1], ["brief-2", 0]]);
  });

  it("refuses exactly as before when the build's purse has nothing it can give", () => {
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    build.keepBackForJudging({ calls: 4, unpriced: { inputTokens: 8_000, outputTokens: 1_250 } });
    const judged = build.hold(call(0.01, true));
    if (judged.ok) judged.hold.settle({ estimatedCostUsd: 0.004 });
    const cart = carve(build, "brief.cart", 0.02);
    // A sibling holds the rest of what could be carved.
    carve(build, "brief.search", build.allocatableUsd());
    expect(build.allocatableUsd()).toBe(0);
    expect(spend(cart, 0.015, 0.015)).toBe(true);
    const refused = cart.hold(call(0.01));
    expect(refused).toEqual({ ok: false, refusal: { code: "llm_budget.run_cost_limit", projectedCostUsd: 0.01, estimatedInputTokens: 1_000, maxOutputTokens: 100, spentUsd: 0.015, pendingUsd: 0, ceilingUsd: 0.02, allowance: { role: "builder", briefId: "brief.cart" } } });
    expect(cart.toppedUp()).toEqual([]);
    expect(cart.ceilingUsd).toBe(0.02);
    expect(build.refusal).toBeUndefined();
  });

  it("leaves what the build's own finishing calls are kept at", () => {
    // The same build three times, differing only in the calls kept back for its finishing.
    const outcome = (finishingCalls: number) => {
      const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
      build.keepBackCallsFromAllowances(finishingCalls);
      for (let index = 0; index < 4; index += 1) spend(build, 0.002, 0.001);
      const brief = carve(build, "brief.a", 0.01);
      for (let index = 0; index < 9; index += 1) expect(spend(brief, 0.002, 0.001)).toBe(true);
      // $0.008 could still be carved; the next call, held at $0.002, is $0.001 short.
      carve(build, "brief.b", build.allocatableUsd() - 0.008);
      return { held: brief.hold(call(0.002)).ok, topUps: brief.toppedUp() };
    };
    // None kept: the shortfall and one call more are granted.
    const none = outcome(0);
    expect(none.held).toBe(true);
    expect(none.topUps[0]!.usd).toBeCloseTo(0.003, 9);
    expect(none.topUps[0]!.availableUsd).toBeCloseTo(0.008, 9);
    // Three kept: $0.002 for the first at worst, $0.001 for each after it at the average, so $0.004 can still be given.
    const three = outcome(3);
    expect(three.held).toBe(true);
    expect(three.topUps[0]!.availableUsd).toBeCloseTo(0.004, 9);
    expect(three.topUps[0]!.usd).toBeCloseTo(0.003, 9);
    // Ten kept: $0.011, more than can be carved, so nothing is granted and the call is refused.
    const ten = outcome(10);
    expect(ten.held).toBe(false);
    expect(ten.topUps).toEqual([]);
  });

  it("is topped up by at most what it was carved at, in all", () => {
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1 });
    const brief = carve(build, "brief.a", 0.01);
    let held = 0;
    while (spend(brief, 0.004, 0.004)) held += 1;
    const toppedUp = brief.toppedUp().reduce((sum, grant) => sum + grant.usd, 0);
    expect(brief.toppedUp().length).toBeGreaterThan(0);
    expect(toppedUp).toBeLessThanOrEqual(0.01 + 1e-9);
    expect(brief.spentUsd()).toBeLessThanOrEqual(0.02 + 1e-9);
    // Two calls on its own $0.01, a grant of $0.006 for two more, and the last $0.004 of its bound for one: then it refuses.
    expect(held).toBe(5);
    expect(brief.refusal).toMatchObject({ code: "llm_budget.run_cost_limit", allowance: { briefId: "brief.a" } });
    expect(brief.refusal && "ceilingUsd" in brief.refusal ? brief.refusal.ceilingUsd : undefined).toBeCloseTo(0.01 + toppedUp, 9);
  });

  it("is never topped up once closed, and keeps no grant for a call a purse above refused", () => {
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, maxCalls: 2 });
    const closed = carve(build, "brief.closed", 0.01);
    closed.close();
    expect(closed.hold(call(0.02))).toMatchObject({ ok: false, refusal: { closed: true } });
    expect(closed.toppedUp()).toEqual([]);
    // The build's two calls: one spent here, so the next call is short of the allowance and refused by the build's call cap.
    expect(spend(build, 0.001, 0.001)).toBe(true);
    const capped = carve(build, "brief.capped", 0.01);
    expect(spend(capped, 0.008, 0.008)).toBe(true);
    expect(capped.hold(call(0.005))).toMatchObject({ ok: false, refusal: { code: "llm_budget.run_call_limit", maxCalls: 2 } });
    expect(capped.toppedUp()).toEqual([]);
    expect(capped.ceilingUsd).toBe(0.01);
  });

  it("never takes the Flow's purse past its ceiling", async () => {
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.05, carriedUsd: 0.04 });
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const brief = carve(build, "brief.a", 0.01);
    const hold = (cost: number) => automationStudioLlmBuildPurseHoldCall({ provider: { estimateCostUsd: () => cost }, estimatedInputTokens: 1_000, maxOutputTokens: 100 });
    const outcome = await automationStudioLlmFlowPurseScope(flow, async () => await automationStudioLlmBuildPurseScope(brief, async () => hold(0.02)));
    // The build's purse could top the brief up, the Flow's could not pay: the call is refused on the Flow's ceiling.
    expect(outcome).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_cost_limit", metadata: { ceilingUsd: 0.05, carriedUsd: 0.04 } } });
    expect([flow.pendingUsd(), build.pendingUsd(), brief.pendingUsd()]).toEqual([0, 0, 0]);
    expect(flow.spentUsd()).toBe(0.04);
  });
});
