import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS, AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP, AutomationStudioLlmRunBudgetLedger, estimateAutomationStudioDeepSeekCostUsd } from "../../../llm/index.ts";
import {
  AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES,
  resolveAutomationStudioRecoveryRunBudget
} from "../run-budget.ts";

// The numbers one recovery runs under. These are the answer to "what is the
// most one recovery can cost", so they are pinned rather than inferred.
describe("resolveAutomationStudioRecoveryRunBudget", () => {
  // A resolver that names no per-call limits gets the harness's default, which
  // is the model's window: 1,000,000 tokens with an 8,000-token reply reserve
  // (2026-09-30; it was 10,000 and 2,000).
  const WINDOW = AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS.maxTotalTokens;
  // Core's own default token pot (6,000 per share, 144,000 in all) is gone:
  // it refused a whole page's diagnosis outright. The purse binds.
  it("bounds a recovery nobody asked for by $0.25 and the per-call limit times the shares, with the call count only a backstop", () => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false });

    expect(budget.ledger).toEqual({
      maxCallsPerRun: AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP,
      maxTotalTokensPerRun: WINDOW * AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES,
      // No per-call output limit was named, so the output pot is the token pot.
      maxOutputTokensPerRun: WINDOW * AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES,
      maxEstimatedCostUsdPerRun: 0.25
    });
    expect(budget.maxEstimatedCostUsdPerCall).toBeCloseTo(0.25 / AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES, 8);
    expect(budget.maxEstimatedCostUsdPerCall * AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES).toBeLessThanOrEqual(0.25);
  });

  it("lets what a person set bind as written", () => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false, maxTokensPerRun: 20_000, policyMaxEstimatedCostUsdPerRun: 0.1 });

    expect(budget.ledger).toMatchObject({ maxTotalTokensPerRun: 20_000, maxEstimatedCostUsdPerRun: 0.1 });
    // A policy can only lower that purse, never raise it.
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false, policyMaxEstimatedCostUsdPerRun: 5 }).ledger.maxEstimatedCostUsdPerRun).toBe(0.25);
  });

  // A resolver's call count is a real outside limit, so it is honoured, and a
  // small one divides the purse among the calls it can actually make.
  it("takes a resolver's declared call count at its word and sizes the purse to it", () => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false, resolution: { maxCallsPerRun: 2 } });

    expect(budget.ledger).toEqual({ maxCallsPerRun: 2, maxTotalTokensPerRun: 2 * WINDOW, maxOutputTokensPerRun: 2 * WINDOW, maxEstimatedCostUsdPerRun: 0.25 });
    expect(budget.maxEstimatedCostUsdPerCall).toBe(0.125);
    // Said, so a stage may plan by it; the backstop is never offered as one.
    expect(budget.declaredCallsPerRun).toBe(2);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false }).declaredCallsPerRun).toBeUndefined();
  });

  it("uses a smaller resolver total for a run a person asked for, and never more than the run cost ceiling", () => {
    const asked = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxCallsPerRun: 10, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 0.15 } });
    expect(asked.ledger).toEqual({ maxCallsPerRun: 10, maxTotalTokensPerRun: 10 * WINDOW, maxOutputTokensPerRun: 10 * WINDOW, maxEstimatedCostUsdPerRun: 0.15 });
    expect(asked.maxEstimatedCostUsdPerCall).toBeCloseTo(0.015, 8);

    // A resolver that gives a per-call cost and no total would otherwise be
    // multiplied into $6; the ceiling holds it at $0.25.
    const untotalled = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxEstimatedCostUsd: 0.25 } });
    expect(untotalled.ledger.maxEstimatedCostUsdPerRun).toBe(0.25);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxTotalEstimatedCostUsd: 9 } }).ledger.maxEstimatedCostUsdPerRun).toBe(0.25);
  });

  // The ledger reserves each call's share, rounded to a billionth, against the
  // total. Every declared call must still fit on the last one, or it is
  // refused on cost while the run still has money.
  it.each([10, 25, 26, 64])("fits every reservation of a %i-call run inside its total", (calls) => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxCallsPerRun: calls, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 } });
    const total = budget.ledger.maxEstimatedCostUsdPerRun;
    expect(total).toBe(0.25);
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

    expect(budget.ledger).toEqual({ maxCallsPerRun: 26, maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: 0.25 });
  });

  // The Flow's configured spend limit lowers the ceiling of a run a person
  // asked for, and the resolver's total lowers it too; neither raises it.
  it("holds a run a person asked for to the smallest of the ceiling, the resolver's total and the Flow's limit", () => {
    const resolution = { maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 };
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution, policyMaxEstimatedCostUsdPerRun: 0.2 }).ledger.maxEstimatedCostUsdPerRun).toBe(0.2);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxTotalEstimatedCostUsd: 0.15 }, policyMaxEstimatedCostUsdPerRun: 0.2 }).ledger.maxEstimatedCostUsdPerRun).toBe(0.15);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution, policyMaxEstimatedCostUsdPerRun: 5 }).ledger.maxEstimatedCostUsdPerRun).toBe(0.25);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution }).ledger.maxEstimatedCostUsdPerRun).toBe(0.25);
  });

  it("ignores a nonsensical declared call count rather than letting it zero the run", () => {
    for (const maxCallsPerRun of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false, resolution: { maxCallsPerRun } }).ledger.maxCallsPerRun).toBe(AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP);
    }
  });
});

// The user's rule: a run costs at most $0.25, whoever asked for it. A run a
// person asked for used to take the Flow's configured figure, or the
// resolver's $2 default total, up to a $2 recovery ceiling.
describe("the recovery's cost ceiling", () => {
  const hostDefaults = { maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 };

  it("defaults a recovery a person asked for to $0.25, and derives each call's reservation from it", () => {
    for (const resolution of [hostDefaults, { maxEstimatedCostUsd: 0.25 }, undefined]) {
      const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution });
      expect(budget.ledger.maxEstimatedCostUsdPerRun, JSON.stringify(resolution)).toBe(0.25);
      expect(budget.maxEstimatedCostUsdPerCall).toBeCloseTo(0.25 / AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES, 8);
    }
  });

  it("never lets the Flow's setting raise it, and lets it lower it", () => {
    for (const explicitRunBudget of [true, false]) {
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget, resolution: hostDefaults, policyMaxEstimatedCostUsdPerRun: 1 }).ledger.maxEstimatedCostUsdPerRun).toBe(0.25);
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget, resolution: hostDefaults, policyMaxEstimatedCostUsdPerRun: 0.1 }).ledger.maxEstimatedCostUsdPerRun).toBe(0.1);
    }
  });
});

// A recovery that is one part of a refuted result's repair is handed what the
// repair's purse has left, and that is its total (`../../refuted-result/purse.ts`).
describe("a recovery that is part of a repair", () => {
  it("is held to what the repair has left, which lowers the total like any other limit and never raises it", () => {
    for (const explicitRunBudget of [true, false]) {
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget, resolution: { maxTotalEstimatedCostUsd: 2 }, costLeftUsd: 0.05 }).ledger.maxEstimatedCostUsdPerRun).toBe(0.05);
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget, policyMaxEstimatedCostUsdPerRun: 0.03, costLeftUsd: 0.05 }).ledger.maxEstimatedCostUsdPerRun).toBe(0.03);
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget, costLeftUsd: 1 }).ledger.maxEstimatedCostUsdPerRun).toBe(0.25);
    }
  });
});

// `run-munutuvf-6a1c548a` and `run-munv9eqy-1827b928`: a live repair under the
// $0.25 purse with the Flow's 64 declared calls reserved an even share,
// $0.0039, per call, and its $0.0041 and $0.0044 plan-stage diagnoses were
// each counted a budget breach, which failed both runs. A call now reserves its
// own worst case, and the purse still binds.
describe("a recovery call's reservation", () => {
  const live = { maxCallsPerRun: 64, tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 0.25 };

  it("is one call's worst case at the model's peak rates, so an ordinary diagnosis is no breach", () => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model: "deepseek-flash" });
    expect(budget.maxEstimatedCostUsdPerCall).toBeCloseTo(estimateAutomationStudioDeepSeekCostUsd(48_000, 8_000, 0, "deepseek-flash"), 8);
    expect(budget.maxEstimatedCostUsdPerCall).toBeGreaterThan(0.25 / 64);

    const ledger = new AutomationStudioLlmRunBudgetLedger(budget.ledger);
    const reserved = ledger.reserve({ runId: "run-1", requestId: "diagnosis-plan", estimatedInputTokens: 13_189, maxOutputTokens: 8_000, maxEstimatedCostUsd: budget.maxEstimatedCostUsdPerCall });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    reserved.lease.complete({ inputTokens: 13_189, outputTokens: 498, totalTokens: 13_687, estimatedCostUsd: 0.004441404 });
    expect(ledger.snapshot("run-1")).toMatchObject({ calls: 1, budgetBreaches: 0 });
  });

  it("is priced for the model the provider calls, and Core's default model when that is not a priced one", () => {
    const pro = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model: "deepseek-v4-pro" });
    expect(pro.maxEstimatedCostUsdPerCall).toBeCloseTo(estimateAutomationStudioDeepSeekCostUsd(48_000, 8_000, 0, "deepseek-v4-pro"), 8);
    const mock = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model: "mock" });
    expect(mock.maxEstimatedCostUsdPerCall).toBeCloseTo(estimateAutomationStudioDeepSeekCostUsd(48_000, 8_000), 8);
  });

  it("never exceeds the purse or the resolver's per-call cost, and the purse still stops the run before it is passed", () => {
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model: "deepseek-flash", costLeftUsd: 0.01 }).maxEstimatedCostUsdPerCall).toBe(0.01);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { ...live, maxEstimatedCostUsd: 0.005 }, model: "deepseek-flash" }).maxEstimatedCostUsdPerCall).toBe(0.005);

    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: live, model: "deepseek-flash" });
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
    expect(spent).toBeLessThanOrEqual(0.25);
    expect(ledger.snapshot("run-2")).toMatchObject({ budgetBreaches: 0 });
    expect(spent).toBeGreaterThan(0.25 - 2 * budget.maxEstimatedCostUsdPerCall);
  });
});

// 2026-09-30: the per-request limits are the model's whole window (992,000 /
// 8,000 / 1,000,000). A call's worst case at that size is the whole $0.25
// purse, so the ledger must be charged each request's own measured size, not
// the window, or it admits one call and refuses the rest.
describe("a recovery at the window profile", () => {
  const WINDOW = { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 };
  const price = (inputTokens: number, outputTokens: number) => estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens, 0, "deepseek-flash");

  it.each([true, false])("admits call after call when each reserves its own size under the ceiling (explicit: %s)", (explicitRunBudget) => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget, resolution: { tokenLimits: WINDOW, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 0.25 }, model: "deepseek-flash" });
    // The ceiling is the whole purse at this profile ...
    expect(budget.maxEstimatedCostUsdPerCall).toBe(0.25);
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
