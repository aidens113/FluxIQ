// Allowances carved from a build's purse for the project agents' briefs (t534):
// every call is held against the allowance and each purse above it, an
// allowance is carved only from what is neither spent, in flight, kept back for
// judging nor promised to another, and concurrent allowances refuse on their
// own money.
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, AutomationStudioLlmBuildPurseRefused, automationStudioLlmBuildPurseHoldCall, automationStudioLlmBuildPurseRun, automationStudioLlmBuildPurseScope, automationStudioLlmFlowPurseScope, type AutomationStudioLlmBuildPurseCall } from "../index.ts";

const call = (projectedCostUsd: number | undefined, judge = false): AutomationStudioLlmBuildPurseCall => ({ projectedCostUsd, estimatedInputTokens: 1_000, maxOutputTokens: 100, ...(judge ? { judge: true } : {}) });

function carve(purse: AutomationStudioLlmBuildPurse, briefId: string, usd: number, role = "builder"): AutomationStudioLlmBuildPurse {
  const carved = purse.allowance({ briefId, role, usd });
  if (!carved.ok) throw new Error(`expected an allowance of ${usd} for ${briefId}`);
  return carved.allowance;
}

function settled(held: ReturnType<AutomationStudioLlmBuildPurse["hold"]>, costUsd: number): void {
  if (!held.ok) throw new Error("expected the call to be held");
  held.hold.settle({ estimatedCostUsd: costUsd });
}

describe("an allowance carved from a build's purse", () => {
  it("holds each call against itself and the purse above, and charges both what it settled at", () => {
    const charged: number[] = [];
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, onSettled: (usd) => charged.push(usd) });
    const allowance = carve(build, "brief.cart", 0.04);
    const held = allowance.hold(call(0.01));
    expect(held.ok).toBe(true);
    expect(allowance.pendingUsd()).toBe(0.01);
    expect(build.pendingUsd()).toBe(0.01);
    settled(held, 0.008);
    expect(allowance.spentUsd()).toBe(0.008);
    expect(build.spentUsd()).toBe(0.008);
    expect(build.pendingUsd()).toBe(0);
    expect(charged).toEqual([0.008]);
    expect(allowance.parent).toBe(build);
    expect(allowance.attribution).toEqual({ role: "builder", briefId: "brief.cart" });
  });

  it("refuses at its own level when the call would cross the allowance, leaving the parent untouched", () => {
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const allowance = carve(build, "brief.cart", 0.02);
    settled(allowance.hold(call(0.015)), 0.015);
    const refused = allowance.hold(call(0.01));
    expect(refused).toEqual({ ok: false, refusal: { code: "llm_budget.run_cost_limit", projectedCostUsd: 0.01, estimatedInputTokens: 1_000, maxOutputTokens: 100, spentUsd: 0.015, pendingUsd: 0, ceilingUsd: 0.02, allowance: { role: "builder", briefId: "brief.cart" } } });
    expect(allowance.refusal).toEqual((refused as { refusal: unknown }).refusal);
    expect(build.refusal).toBeUndefined();
    expect(build.pendingUsd()).toBe(0);
  });

  it("refuses at the parent's level when the parent cannot pay, with the parent's figures, and the call never stays in flight on either", () => {
    let accounted = 0;
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, spentUsd: () => accounted });
    const allowance = carve(build, "brief.cart", 0.05);
    // The build's own accounting later counts spend the purse never held: the parent is now short.
    accounted = 0.09;
    const refused = allowance.hold(call(0.02));
    expect(refused).toMatchObject({ ok: false, refusal: { code: "llm_budget.run_cost_limit", ceilingUsd: 0.1, spentUsd: 0.09 } });
    expect((refused as { refusal: { allowance?: unknown } }).refusal.allowance).toBeUndefined();
    expect(allowance.refusal).toMatchObject({ ceilingUsd: 0.1 });
    expect(build.refusal).toMatchObject({ ceilingUsd: 0.1 });
    expect(allowance.pendingUsd()).toBe(0);
    expect(build.pendingUsd()).toBe(0);
  });

  it("is carved only from what is left less the judging reserve and less what open allowances still hold", () => {
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    settled(build.hold(call(0.01)), 0.01);
    build.keepBackForJudging({ calls: 2, unpriced: { inputTokens: 8_000, outputTokens: 1_250 } });
    // Price the reserve: a judge call held at $0.015 makes the pair $0.03.
    settled(build.hold(call(0.015, true)), 0.005);
    expect(build.keptBackUsd()).toBeCloseTo(0.03, 9);
    expect(build.allocatableUsd()).toBeCloseTo(0.1 - 0.015 - 0.03, 9);
    const first = carve(build, "brief.search", 0.03);
    expect(build.allocatableUsd()).toBeCloseTo(0.025, 9);
    const refused = build.allowance({ briefId: "brief.cart", role: "builder", usd: 0.03 });
    expect(refused).toMatchObject({ ok: false, refusal: { code: "llm_budget.allowance_unavailable", requestedUsd: 0.03, keptBackUsd: 0.03 } });
    if (!refused.ok) {
      expect(refused.refusal.allocatableUsd).toBeCloseTo(0.025, 9);
      expect(refused.refusal.outstandingUsd).toBeCloseTo(0.03, 9);
    }
    expect(build.allowance({ briefId: "brief.cart", role: "builder", usd: 0.025 }).ok).toBe(true);
    expect(build.allocatableUsd()).toBeCloseTo(0, 9);
    // The reserve is not allocatable even when nothing else is outstanding.
    first.close();
    const whole = build.allowance({ briefId: "brief.whole", role: "builder", usd: 0.1 - 0.015 - 0.025 });
    expect(whole.ok).toBe(false);
  });

  it("keeps what an open allowance has not spent from every other call on the parent, and gives it back when closed", () => {
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const allowance = carve(build, "brief.cart", 0.06);
    const supervisor = build.hold(call(0.05));
    expect(supervisor).toMatchObject({ ok: false, refusal: { code: "llm_budget.run_cost_limit", allottedUsd: 0.06 } });
    settled(allowance.hold(call(0.02)), 0.01);
    expect(build.allocatableUsd()).toBeCloseTo(0.1 - 0.01 - 0.05, 9);
    allowance.close();
    expect(allowance.isClosed()).toBe(true);
    expect(build.allocatableUsd()).toBeCloseTo(0.09, 9);
    expect(build.hold(call(0.05)).ok).toBe(true);
  });

  it("holds no further call once closed, while a call in flight still settles on both", () => {
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const allowance = carve(build, "brief.cart", 0.05);
    const inFlight = allowance.hold(call(0.01));
    allowance.close();
    expect(allowance.hold(call(0.001))).toMatchObject({ ok: false, refusal: { code: "llm_budget.run_cost_limit", closed: true, allowance: { briefId: "brief.cart" } } });
    settled(inFlight, 0.004);
    expect(allowance.spentUsd()).toBe(0.004);
    expect(build.spentUsd()).toBe(0.004);
    expect(() => build.close()).toThrow(/Only an allowance/);
    expect(() => allowance.allowance({ briefId: "brief.sub", role: "builder", usd: 0 })).toThrow(/closed/);
  });

  it("is one per open brief, names its brief and role, and is a finite amount", () => {
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const open = carve(build, "brief.cart", 0.01);
    expect(() => build.allowance({ briefId: "brief.cart", role: "builder", usd: 0.01 })).toThrow(/already open/);
    open.close();
    expect(build.allowance({ briefId: "brief.cart", role: "repair", usd: 0.01 }).ok).toBe(true);
    expect(() => build.allowance({ briefId: "", role: "builder", usd: 0.01 })).toThrow(/name the brief/);
    expect(() => build.allowance({ briefId: "brief.x", role: "builder", usd: Number.NaN })).toThrow(/finite/);
  });

  it("counts calls against its own call limit and the parent's", () => {
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1, maxCalls: 3 });
    const carved = build.allowance({ briefId: "brief.cart", role: "builder", usd: 0.5, maxCalls: 1 });
    if (!carved.ok) throw new Error("expected an allowance");
    settled(carved.allowance.hold(call(0.01)), 0.01);
    expect(carved.allowance.hold(call(0.01))).toMatchObject({ ok: false, refusal: { code: "llm_budget.run_call_limit", maxCalls: 1, allowance: { briefId: "brief.cart" } } });
    expect(build.spentCalls()).toBe(1);
  });

  it("attributes spend to each brief and role, nested allowances included", () => {
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const search = carve(build, "brief.search", 0.03);
    const repair = carve(build, "brief.repair", 0.02, "repair");
    const survey = carve(search, "brief.search.survey", 0.01, "survey");
    settled(search.hold(call(0.005)), 0.004);
    settled(survey.hold(call(0.005)), 0.002);
    settled(repair.hold(call(0.005)), 0.003);
    settled(build.hold(call(0.005)), 0.001);
    repair.close();
    expect(build.attributedSpend().map((entry) => ({ ...entry, spentUsd: Number(entry.spentUsd.toFixed(9)) }))).toEqual([
      { role: "builder", briefId: "brief.search", allottedUsd: 0.03, spentUsd: 0.006, calls: 2, closed: false },
      { role: "survey", briefId: "brief.search.survey", allottedUsd: 0.01, spentUsd: 0.002, calls: 1, closed: false },
      { role: "repair", briefId: "brief.repair", allottedUsd: 0.02, spentUsd: 0.003, calls: 1, closed: true }
    ]);
    expect(build.spentUsd()).toBeCloseTo(0.01, 9);
  });
});

describe("two allowances spending at once", () => {
  it("never take the parent past its ceiling, and each refuses on its own money", async () => {
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const one = carve(build, "brief.one", 0.05);
    const two = carve(build, "brief.two", 0.05);
    expect(build.allocatableUsd()).toBe(0);
    const gates: Array<() => void> = [];
    const outcomes: Record<string, string[]> = { one: [], two: [] };
    // Each brief's loop makes calls under its own run, interleaving with the other's.
    const loop = async (name: "one" | "two", allowance: AutomationStudioLlmBuildPurse, costs: number[]) => await automationStudioLlmBuildPurseRun(allowance, async () => {
      for (const cost of costs) {
        const held = automationStudioLlmBuildPurseHoldCall({ provider: { estimateCostUsd: () => cost }, estimatedInputTokens: 1_000, maxOutputTokens: 100 });
        if (!held?.ok) {
          outcomes[name]!.push("refused");
          return name;
        }
        await new Promise<void>((resolve) => gates.push(resolve));
        held.hold.settle({ estimatedCostUsd: cost });
        outcomes[name]!.push(`spent ${cost}`);
      }
      return name;
    });
    // Caught as it ends, since it ends before the other: its refusal is read below.
    const first = loop("one", one, [0.02, 0.02, 0.02]).catch((error: unknown) => error);
    const second = loop("two", two, [0.01, 0.01]);
    while (gates.length > 0) {
      gates.shift()!();
      await new Promise((resolve) => setImmediate(resolve));
      expect(build.spentUsd() + build.pendingUsd()).toBeLessThanOrEqual(0.1 + 1e-9);
    }
    expect(await first).toBeInstanceOf(AutomationStudioLlmBuildPurseRefused);
    await expect(second).resolves.toBe("two");
    expect(outcomes.one).toEqual(["spent 0.02", "spent 0.02", "refused"]);
    expect(outcomes.two).toEqual(["spent 0.01", "spent 0.01"]);
    expect(one.refusal).toMatchObject({ code: "llm_budget.run_cost_limit", allowance: { briefId: "brief.one" } });
    expect(two.refusal).toBeUndefined();
    expect(build.spentUsd()).toBeCloseTo(0.06, 9);
    expect(build.attributedSpend().map((entry) => [entry.briefId, entry.spentUsd])).toEqual([["brief.one", 0.04], ["brief.two", 0.02]]);
  });
});

describe("an allowance under the Flow's purse", () => {
  const hold = (cost: number) => automationStudioLlmBuildPurseHoldCall({ provider: { estimateCostUsd: () => cost }, estimatedInputTokens: 1_000, maxOutputTokens: 100 });

  it("holds the Flow's purse once when the Flow's purse is the one it was carved from", async () => {
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const allowance = carve(flow, "brief.cart", 0.05);
    await automationStudioLlmFlowPurseScope(flow, async () => await automationStudioLlmBuildPurseScope(allowance, async () => {
      const held = hold(0.02);
      expect(held?.ok).toBe(true);
      expect(flow.pendingUsd()).toBe(0.02);
      if (held?.ok) held.hold.settle({ estimatedCostUsd: 0.01 });
    }));
    expect(flow.spentUsd()).toBe(0.01);
  });

  it("holds the build's chain and the Flow's purse, and says an allowance refused with the brief it serves", async () => {
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const allowance = carve(build, "brief.cart", 0.03);
    const outcome = await automationStudioLlmFlowPurseScope(flow, async () => await automationStudioLlmBuildPurseScope(allowance, async () => {
      const held = hold(0.02);
      expect([flow.pendingUsd(), build.pendingUsd(), allowance.pendingUsd()]).toEqual([0.02, 0.02, 0.02]);
      if (held?.ok) held.hold.settle({ estimatedCostUsd: 0.02 });
      return hold(0.02);
    }));
    expect(outcome).toMatchObject({ ok: false, diagnostic: { code: "llm_budget.run_cost_limit", metadata: { allowance: { briefId: "brief.cart", role: "builder" }, ceilingUsd: 0.03 } } });
    expect(outcome && !outcome.ok ? outcome.diagnostic.message : "").toMatch(/^The allowance for brief brief\.cart's spending limit of \$0\.0300/);
    expect([flow.pendingUsd(), build.pendingUsd(), allowance.pendingUsd()]).toEqual([0, 0, 0]);
  });

  it("ends the allowance's run on cost when the Flow's purse refuses", async () => {
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.09 });
    const build = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const allowance = carve(build, "brief.cart", 0.05);
    const run = automationStudioLlmFlowPurseScope(flow, async () => await automationStudioLlmBuildPurseRun(allowance, async () => hold(0.02)));
    await expect(run).rejects.toMatchObject({ refusal: { code: "llm_budget.run_cost_limit", ceilingUsd: 0.1, carriedUsd: 0.09 } });
    expect([build.pendingUsd(), allowance.pendingUsd()]).toEqual([0, 0]);
  });
});
