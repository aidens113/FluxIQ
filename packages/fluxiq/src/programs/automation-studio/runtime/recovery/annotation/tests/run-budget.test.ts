import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS,
  AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP,
  AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD as CEILING,
  AutomationStudioLlmRunBudgetLedger,
  estimateAutomationStudioDeepSeekCostUsd
} from "../../../llm/index.ts";
import {
  AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES,
  resolveAutomationStudioRecoveryRunBudget
} from "../run-budget.ts";

// The numbers one recovery runs under. These are the answer to "what is the
// most one recovery can cost", so they are pinned to the run cost ceiling
// (`CEILING`, $0.10 since 2026-10-01) rather than inferred.
describe("resolveAutomationStudioRecoveryRunBudget", () => {
  // A resolver that names no per-call limits gets the harness's default, which
  // is the model's window: 1,000,000 tokens with an 8,000-token reply reserve
  // (2026-09-30; it was 10,000 and 2,000).
  const WINDOW = AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS.maxTotalTokens;
  // Core's own default token pot (6,000 per share, 144,000 in all) is gone:
  // it refused a whole page's diagnosis outright. The purse binds.
  it("bounds a recovery nobody asked for by the run cost ceiling and the per-call limit times the shares, with the call count only a backstop", () => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false });

    expect(budget.ledger).toEqual({
      maxCallsPerRun: AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP,
      maxTotalTokensPerRun: WINDOW * AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES,
      // No per-call output limit was named, so the output pot is the token pot.
      maxOutputTokensPerRun: WINDOW * AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES,
      maxEstimatedCostUsdPerRun: CEILING
    });
    expect(budget.maxEstimatedCostUsdPerCall).toBeCloseTo(CEILING / AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES, 8);
    expect(budget.maxEstimatedCostUsdPerCall * AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES).toBeLessThanOrEqual(CEILING);
  });

  it("lets what a person set bind as written", () => {
    const policy = CEILING * 0.4;
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false, maxTokensPerRun: 20_000, policyMaxEstimatedCostUsdPerRun: policy });

    expect(budget.ledger).toMatchObject({ maxTotalTokensPerRun: 20_000, maxEstimatedCostUsdPerRun: policy });
    // A policy can only lower that purse, never raise it.
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false, policyMaxEstimatedCostUsdPerRun: 5 }).ledger.maxEstimatedCostUsdPerRun).toBe(CEILING);
  });

  // A resolver's call count is a real outside limit, so it is honoured, and a
  // small one divides the purse among the calls it can actually make.
  it("takes a resolver's declared call count at its word and sizes the purse to it", () => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false, resolution: { maxCallsPerRun: 2 } });

    expect(budget.ledger).toEqual({ maxCallsPerRun: 2, maxTotalTokensPerRun: 2 * WINDOW, maxOutputTokensPerRun: 2 * WINDOW, maxEstimatedCostUsdPerRun: CEILING });
    expect(budget.maxEstimatedCostUsdPerCall).toBeCloseTo(CEILING / 2, 12);
    // Said, so a stage may plan by it; the backstop is never offered as one.
    expect(budget.declaredCallsPerRun).toBe(2);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false }).declaredCallsPerRun).toBeUndefined();
  });

  it("uses a smaller resolver total for a run a person asked for, and never more than the run cost ceiling", () => {
    const resolverTotal = CEILING * 0.6;
    const asked = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxCallsPerRun: 10, maxEstimatedCostUsd: CEILING, maxTotalEstimatedCostUsd: resolverTotal } });
    expect(asked.ledger).toEqual({ maxCallsPerRun: 10, maxTotalTokensPerRun: 10 * WINDOW, maxOutputTokensPerRun: 10 * WINDOW, maxEstimatedCostUsdPerRun: resolverTotal });
    expect(asked.maxEstimatedCostUsdPerCall).toBeCloseTo(resolverTotal / 10, 8);

    // A resolver that gives a per-call cost and no total would otherwise be
    // multiplied into many times the ceiling; the ceiling holds it.
    const untotalled = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxEstimatedCostUsd: CEILING } });
    expect(untotalled.ledger.maxEstimatedCostUsdPerRun).toBe(CEILING);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxTotalEstimatedCostUsd: 9 } }).ledger.maxEstimatedCostUsdPerRun).toBe(CEILING);
  });

  // The ledger reserves each call's share, rounded to a billionth, against the
  // total. Every declared call must still fit on the last one, or it is
  // refused on cost while the run still has money.
  it.each([10, 25, 26, 64])("fits every reservation of a %i-call run inside its total", (calls) => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxCallsPerRun: calls, maxEstimatedCostUsd: CEILING, maxTotalEstimatedCostUsd: 2 } });
    const total = budget.ledger.maxEstimatedCostUsdPerRun;
    expect(total).toBe(CEILING);
    const rounded = (value: number) => Math.round(value * 1_000_000_000) / 1_000_000_000;
    // A resolver that declared no per-call limits has no worst case of its own
    // to reserve -- the default is the whole window, which no call fills -- so
    // each call reserves an even share, and every declared call fits.
    expect(budget.maxEstimatedCostUsdPerCall).toBeCloseTo(total / calls, 8);
    const admitted = Math.min(calls, Math.floor(total / budget.maxEstimatedCostUsdPerCall));
    let committed = 0;
    for (let call = 0; call < admitted; call += 1) {
      expect(rounded(committed + budget.maxEstimatedCostUsdPerCall)).toBeLessThanOrEqual(total);
      committed = rounded(committed + budget.maxEstimatedCostUsdPerCall);
    }
    expect(budget.ledger.maxCallsPerRun).toBe(calls);
    // And the token pot is the per-call limit times the calls.
    expect(budget.ledger.maxTotalTokensPerRun).toBe(WINDOW * calls);
  });

  it("caps the token pot at a resolver's whole-run token exposure, however many calls it declared", () => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxCallsPerRun: 26, maxTotalTokensPerRun: 100_000, maxTotalEstimatedCostUsd: 2 } });

    expect(budget.ledger).toEqual({ maxCallsPerRun: 26, maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: CEILING });
  });

  // The Flow's configured spend limit lowers the ceiling of a run a person
  // asked for, and the resolver's total lowers it too; neither raises it.
  it("holds a run a person asked for to the smallest of the ceiling, the resolver's total and the Flow's limit", () => {
    const resolution = { maxEstimatedCostUsd: CEILING, maxTotalEstimatedCostUsd: 2 };
    const policy = CEILING * 0.8;
    const resolverTotal = CEILING * 0.6;
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution, policyMaxEstimatedCostUsdPerRun: policy }).ledger.maxEstimatedCostUsdPerRun).toBe(policy);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxTotalEstimatedCostUsd: resolverTotal }, policyMaxEstimatedCostUsdPerRun: policy }).ledger.maxEstimatedCostUsdPerRun).toBe(resolverTotal);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution, policyMaxEstimatedCostUsdPerRun: 5 }).ledger.maxEstimatedCostUsdPerRun).toBe(CEILING);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution }).ledger.maxEstimatedCostUsdPerRun).toBe(CEILING);
  });

  it("ignores a nonsensical declared call count rather than letting it zero the run", () => {
    for (const maxCallsPerRun of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false, resolution: { maxCallsPerRun } }).ledger.maxCallsPerRun).toBe(AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP);
    }
  });
});

// The user's rule: a run costs at most the run cost ceiling ($0.10 since
// 2026-10-01; it was $0.25), whoever asked for it. A run a
// person asked for used to take the Flow's configured figure, or the
// resolver's $2 default total, up to a $2 recovery ceiling.
describe("the recovery's cost ceiling", () => {
  const hostDefaults = { maxEstimatedCostUsd: CEILING, maxTotalEstimatedCostUsd: 2 };

  it("defaults a recovery a person asked for to the ceiling, and derives each call's reservation from it", () => {
    for (const resolution of [hostDefaults, { maxEstimatedCostUsd: CEILING }, undefined]) {
      const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution });
      expect(budget.ledger.maxEstimatedCostUsdPerRun, JSON.stringify(resolution)).toBe(CEILING);
      expect(budget.maxEstimatedCostUsdPerCall).toBeCloseTo(CEILING / AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES, 8);
    }
  });

  it("never lets the Flow's setting raise it, and lets it lower it", () => {
    for (const explicitRunBudget of [true, false]) {
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget, resolution: hostDefaults, policyMaxEstimatedCostUsdPerRun: 1 }).ledger.maxEstimatedCostUsdPerRun).toBe(CEILING);
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget, resolution: hostDefaults, policyMaxEstimatedCostUsdPerRun: CEILING * 0.4 }).ledger.maxEstimatedCostUsdPerRun).toBe(CEILING * 0.4);
    }
  });
});

// A recovery that is one part of a refuted result's repair is handed what the
// repair's purse has left, and that is its total (`../../refuted-result/purse.ts`).
describe("a recovery that is part of a repair", () => {
  it("is held to what the repair has left, which lowers the total like any other limit and never raises it", () => {
    for (const explicitRunBudget of [true, false]) {
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget, resolution: { maxTotalEstimatedCostUsd: 2 }, costLeftUsd: CEILING * 0.2 }).ledger.maxEstimatedCostUsdPerRun).toBe(CEILING * 0.2);
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget, policyMaxEstimatedCostUsdPerRun: CEILING * 0.12, costLeftUsd: CEILING * 0.2 }).ledger.maxEstimatedCostUsdPerRun).toBe(CEILING * 0.12);
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget, costLeftUsd: 1 }).ledger.maxEstimatedCostUsdPerRun).toBe(CEILING);
    }
  });
});

// `run-munutuvf-6a1c548a` and `run-munv9eqy-1827b928`: a live repair under the
// $0.25 purse (the ceiling then) with the Flow's 64 declared calls reserved an even share,
// $0.0039, per call, and its $0.0041 and $0.0044 plan-stage diagnoses were
// each counted a budget breach, which failed both runs. A call now reserves its
// own worst case, and the purse still binds.
describe("a recovery call's reservation", () => {
  // Monday 2026-10-05 02:00 UTC, inside DeepSeek's 01:00-04:00 peak window, and
  // Saturday 2026-10-03 12:00 UTC, off-peak (`../../../llm/deepseek/pricing.ts`).
  const PEAK_MS = Date.UTC(2026, 9, 5, 2);
  const OFF_PEAK_MS = Date.UTC(2026, 9, 3, 12);
  const peak = () => PEAK_MS;
  const offPeak = () => OFF_PEAK_MS;
  const live = { maxCallsPerRun: 64, tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }, maxEstimatedCostUsd: CEILING, maxTotalEstimatedCostUsd: CEILING };

  it("is one call's worst case at the model's peak rates, so an ordinary diagnosis is no breach", () => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model: "deepseek-flash", now: peak });
    expect(budget.maxEstimatedCostUsdPerCall).toBeCloseTo(estimateAutomationStudioDeepSeekCostUsd(48_000, 8_000, 0, "deepseek-flash"), 8);
    expect(budget.maxEstimatedCostUsdPerCall).toBeGreaterThan(CEILING / 64);

    const ledger = new AutomationStudioLlmRunBudgetLedger(budget.ledger);
    const reserved = ledger.reserve({ runId: "run-1", requestId: "diagnosis-plan", estimatedInputTokens: 13_189, maxOutputTokens: 8_000, maxEstimatedCostUsd: budget.maxEstimatedCostUsdPerCall });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    reserved.lease.complete({ inputTokens: 13_189, outputTokens: 498, totalTokens: 13_687, estimatedCostUsd: 0.004441404 });
    expect(ledger.snapshot("run-1")).toMatchObject({ calls: 1, budgetBreaches: 0 });
  });

  it("is priced for the model the provider calls, and Core's default model when that is not a priced one", () => {
    const pro = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model: "deepseek-v4-pro", now: peak });
    expect(pro.maxEstimatedCostUsdPerCall).toBeCloseTo(estimateAutomationStudioDeepSeekCostUsd(48_000, 8_000, 0, "deepseek-v4-pro"), 8);
    const mock = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model: "mock", now: peak });
    expect(mock.maxEstimatedCostUsdPerCall).toBeCloseTo(estimateAutomationStudioDeepSeekCostUsd(48_000, 8_000), 8);
  });

  // t254 (user 2026-10-03: "It should be billed at how much it actually
  // costs"): a call is held at the rate in force when it is held, as the build
  // purse holds one, so off-peak it is half the peak hold.
  it("is half the peak worst case off-peak, and the peak one at peak", () => {
    for (const model of ["deepseek-flash", "deepseek-v4-pro"]) {
      const atPeak = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model, now: peak });
      const offPeakBudget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model, now: offPeak });
      expect(atPeak.maxEstimatedCostUsdPerCall, model).toBeCloseTo(estimateAutomationStudioDeepSeekCostUsd(48_000, 8_000, 0, model as "deepseek-flash"), 9);
      expect(offPeakBudget.maxEstimatedCostUsdPerCall, model).toBeCloseTo(atPeak.maxEstimatedCostUsdPerCall / 2, 9);
      expect(offPeakBudget.maxEstimatedCostUsdPerCall, model).toBeCloseTo(estimateAutomationStudioDeepSeekCostUsd(48_000, 8_000, 0, model as "deepseek-flash", OFF_PEAK_MS), 9);
      // The purse is the same whenever the run is: only what one call holds changes.
      expect(offPeakBudget.ledger).toEqual(atPeak.ledger);
    }
  });

  // t254: the rate is the one in force when each call is made, not when the
  // budget was set. A recovery resolved off-peak that ran into the peak window
  // held its peak calls at half their rate, and the ledger read each as a breach.
  it("prices each call at the rate in force when that call is made, not when the budget was resolved", () => {
    for (const model of ["deepseek-flash", "deepseek-v4-pro"] as const) {
      let clockMs = OFF_PEAK_MS;
      const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model, now: () => clockMs });
      const peakWorstCase = estimateAutomationStudioDeepSeekCostUsd(48_000, 8_000, 0, model, PEAK_MS);
      const offPeakWorstCase = estimateAutomationStudioDeepSeekCostUsd(48_000, 8_000, 0, model, OFF_PEAK_MS);
      // Resolved off-peak: the figure fixed at resolution is the off-peak one.
      expect(budget.maxEstimatedCostUsdPerCall, model).toBeCloseTo(offPeakWorstCase, 9);
      expect(budget.maxEstimatedCostUsdPerCallAt(), model).toBeCloseTo(offPeakWorstCase, 9);

      // The run moves into the peak window: the next call is held at the peak rate.
      clockMs = PEAK_MS;
      const atPeak = budget.maxEstimatedCostUsdPerCallAt();
      expect(atPeak, model).toBeCloseTo(peakWorstCase, 9);
      expect(atPeak, model).toBeCloseTo(budget.maxEstimatedCostUsdPerCall * 2, 9);
      expect(budget.maxEstimatedCostUsdPerCallAt(OFF_PEAK_MS), model).toBeCloseTo(offPeakWorstCase, 9);

      // And back out of it: an off-peak call is held at the off-peak rate again.
      clockMs = OFF_PEAK_MS;
      expect(budget.maxEstimatedCostUsdPerCallAt(), model).toBeCloseTo(offPeakWorstCase, 9);

      // The ledger holds the peak call at its peak price, so a call that costs
      // its full peak worst case is no breach; held at the resolution-time
      // figure, it was one.
      const ledger = new AutomationStudioLlmRunBudgetLedger(budget.ledger);
      const charged = { inputTokens: 48_000, outputTokens: 8_000, totalTokens: 56_000, estimatedCostUsd: Math.floor(peakWorstCase * 1_000_000_000) / 1_000_000_000 };
      const held = ledger.reserve({ runId: "run-peak", requestId: "peak-call", estimatedInputTokens: 48_000, maxOutputTokens: 8_000, maxEstimatedCostUsd: atPeak });
      expect(held.ok).toBe(true);
      if (held.ok) held.lease.complete(charged);
      expect(ledger.snapshot("run-peak"), model).toMatchObject({ calls: 1, budgetBreaches: 0 });
      const stale = ledger.reserve({ runId: "run-stale", requestId: "peak-call", estimatedInputTokens: 48_000, maxOutputTokens: 8_000, maxEstimatedCostUsd: budget.maxEstimatedCostUsdPerCall });
      if (stale.ok) stale.lease.complete(charged);
      expect(ledger.snapshot("run-stale"), model).toMatchObject({ calls: 1, budgetBreaches: 1 });
    }
  });

  it("keeps the even share, the resolver's per-call cost and the purse as bounds at any hour", () => {
    let clockMs = OFF_PEAK_MS;
    const capped = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { ...live, maxEstimatedCostUsd: CEILING * 0.02 }, model: "deepseek-flash", now: () => clockMs });
    const purse = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model: "deepseek-flash", costLeftUsd: CEILING * 0.04, now: () => clockMs });
    const shared = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { ...live, maxCallsPerRun: 2 }, model: "deepseek-flash", now: () => clockMs });
    for (const at of [OFF_PEAK_MS, PEAK_MS]) {
      clockMs = at;
      expect(capped.maxEstimatedCostUsdPerCallAt()).toBeLessThanOrEqual(CEILING * 0.02);
      expect(purse.maxEstimatedCostUsdPerCallAt()).toBeLessThanOrEqual(CEILING * 0.04);
      expect(shared.maxEstimatedCostUsdPerCallAt()).toBeCloseTo(CEILING / 2, 9);
    }
    clockMs = PEAK_MS;
    expect(capped.maxEstimatedCostUsdPerCallAt()).toBe(CEILING * 0.02);
  });

  it("never exceeds the purse or the resolver's per-call cost, and the purse still stops the run before it is passed", () => {
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model: "deepseek-flash", costLeftUsd: CEILING * 0.04, now: peak }).maxEstimatedCostUsdPerCall).toBe(CEILING * 0.04);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { ...live, maxEstimatedCostUsd: CEILING * 0.02 }, model: "deepseek-flash", now: peak }).maxEstimatedCostUsdPerCall).toBe(CEILING * 0.02);

    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model: "deepseek-flash", now: peak });
    const ledger = new AutomationStudioLlmRunBudgetLedger(budget.ledger);
    let spent = 0;
    for (let call = 0; call < 64; call += 1) {
      const reserved = ledger.reserve({ runId: "run-2", requestId: `call-${call}`, estimatedInputTokens: 13_000, maxOutputTokens: 8_000, maxEstimatedCostUsd: budget.maxEstimatedCostUsdPerCall });
      if (!reserved.ok) {
        expect(reserved.diagnostic.code).toBe("llm_budget.run_cost_limit");
        break;
      }
      reserved.lease.complete({ inputTokens: 13_000, outputTokens: 8_000, totalTokens: 21_000, estimatedCostUsd: 0.0135 });
      spent += 0.0135;
    }
    expect(spent).toBeLessThanOrEqual(CEILING);
    expect(ledger.snapshot("run-2")).toMatchObject({ budgetBreaches: 0 });
    expect(spent).toBeGreaterThan(CEILING - 2 * budget.maxEstimatedCostUsdPerCall);
  });
});

// 2026-09-30: the per-request limits are the model's whole window (992,000 /
// 8,000 / 1,000,000). A call's worst case at that size is the whole
// ceiling, so the ledger must be charged each request's own measured size, not
// the window, or it admits one call and refuses the rest.
describe("a recovery at the window profile", () => {
  const WINDOW = { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 };
  const price = (inputTokens: number, outputTokens: number) => estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens, 0, "deepseek-flash");

  it.each([true, false])("admits call after call when each reserves its own size under the ceiling (explicit: %s)", (explicitRunBudget) => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget, resolution: { tokenLimits: WINDOW, maxEstimatedCostUsd: CEILING, maxTotalEstimatedCostUsd: CEILING }, model: "deepseek-flash", now: () => Date.UTC(2026, 9, 5, 2) });
    // The ceiling is the whole purse at this profile ...
    expect(budget.maxEstimatedCostUsdPerCall).toBe(CEILING);
    // ... and the pot holds whole-page calls: no Core default below the window.
    expect(budget.ledger.maxTotalTokensPerRun).toBe(1_000_000 * AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES);
    const ledger = new AutomationStudioLlmRunBudgetLedger(budget.ledger);
    // Ten 30,000-token calls, each reserved at its own priced size, as the
    // harness reserves them (`../../../llm/harness/run.ts`).
    for (let call = 0; call < 10; call += 1) {
      const reserved = ledger.reserve({ runId: "run.window", requestId: `call-${call}`, estimatedInputTokens: 30_000, maxOutputTokens: WINDOW.maxOutputTokens, maxEstimatedCostUsd: Math.min(budget.maxEstimatedCostUsdPerCall, price(30_000, WINDOW.maxOutputTokens)) });
      expect(reserved.ok, `call ${call}`).toBe(true);
      if (!reserved.ok) return;
      reserved.lease.complete({ inputTokens: 25_000, outputTokens: 1_000, totalTokens: 26_000, estimatedCostUsd: price(25_000, 1_000) });
    }
    expect(ledger.snapshot("run.window")).toMatchObject({ calls: 10, budgetBreaches: 0 });
    // Reserved at the window instead, the second call is refused on cost.
    const windowLedger = new AutomationStudioLlmRunBudgetLedger(budget.ledger);
    const first = windowLedger.reserve({ runId: "run.window", requestId: "first", estimatedInputTokens: WINDOW.maxInputTokens, maxOutputTokens: WINDOW.maxOutputTokens, maxEstimatedCostUsd: budget.maxEstimatedCostUsdPerCall });
    expect(first.ok).toBe(true);
    if (first.ok) first.lease.complete({ inputTokens: 25_000, outputTokens: 1_000, totalTokens: 26_000, estimatedCostUsd: price(25_000, 1_000) });
    const second = windowLedger.reserve({ runId: "run.window", requestId: "second", estimatedInputTokens: WINDOW.maxInputTokens, maxOutputTokens: WINDOW.maxOutputTokens, maxEstimatedCostUsd: budget.maxEstimatedCostUsdPerCall });
    expect(second.ok).toBe(false);
  });
});
