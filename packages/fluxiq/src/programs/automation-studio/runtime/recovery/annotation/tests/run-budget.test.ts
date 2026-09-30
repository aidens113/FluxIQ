import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP } from "../../../llm/index.ts";
import {
  AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES,
  AUTOMATION_STUDIO_RECOVERY_MAX_ESTIMATED_COST_USD_PER_RUN,
  resolveAutomationStudioRecoveryRunBudget
} from "../run-budget.ts";

// The numbers one recovery runs under. These are the answer to "what is the
// most one recovery can cost", so they are pinned rather than inferred.
describe("resolveAutomationStudioRecoveryRunBudget", () => {
  it("bounds a recovery nobody asked for by $0.25 and 144,000 tokens, with the call count only a backstop", () => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false });

    expect(budget.ledger).toEqual({
      maxCallsPerRun: AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP,
      maxTotalTokensPerRun: 144_000,
      maxOutputTokensPerRun: 144_000,
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

    expect(budget.ledger).toEqual({ maxCallsPerRun: 2, maxTotalTokensPerRun: 12_000, maxOutputTokensPerRun: 12_000, maxEstimatedCostUsdPerRun: 0.25 });
    expect(budget.maxEstimatedCostUsdPerCall).toBe(0.125);
    // Said, so a stage may plan by it; the backstop is never offered as one.
    expect(budget.declaredCallsPerRun).toBe(2);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false }).declaredCallsPerRun).toBeUndefined();
  });

  it("uses the resolver's total for a run a person asked for, and never more than Core's per-recovery ceiling", () => {
    const asked = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxCallsPerRun: 10, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 1.5 } });
    expect(asked.ledger).toEqual({ maxCallsPerRun: 10, maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: 1.5 });
    expect(asked.maxEstimatedCostUsdPerCall).toBeCloseTo(0.15, 8);

    // A resolver that gives a per-call cost and no total would otherwise be
    // multiplied into $6; the ceiling holds it at $2.
    const untotalled = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxEstimatedCostUsd: 0.25 } });
    expect(AUTOMATION_STUDIO_RECOVERY_MAX_ESTIMATED_COST_USD_PER_RUN).toBe(2);
    expect(untotalled.ledger.maxEstimatedCostUsdPerRun).toBe(2);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxTotalEstimatedCostUsd: 9 } }).ledger.maxEstimatedCostUsdPerRun).toBe(2);
  });

  // The ledger reserves each call's share, rounded to a billionth, against the
  // total. Every declared call must still fit on the last one, or it is
  // refused on cost while the run still has money.
  it.each([10, 25, 26, 64])("fits every reservation of a %i-call run inside its total", (calls) => {
    const total = 2;
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxCallsPerRun: calls, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: total } });
    const rounded = (value: number) => Math.round(value * 1_000_000_000) / 1_000_000_000;
    let committed = 0;
    for (let call = 0; call < calls; call += 1) {
      expect(rounded(committed + budget.maxEstimatedCostUsdPerCall)).toBeLessThanOrEqual(total);
      committed = rounded(committed + budget.maxEstimatedCostUsdPerCall);
    }
    expect(budget.ledger.maxCallsPerRun).toBe(calls);
    // And the token pot is the per-call limit times the calls.
    expect(budget.ledger.maxTotalTokensPerRun).toBe(10_000 * calls);
  });

  it("caps the token pot at a resolver's whole-run token exposure, however many calls it declared", () => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxCallsPerRun: 26, maxTotalTokensPerRun: 100_000, maxTotalEstimatedCostUsd: 2 } });

    expect(budget.ledger).toEqual({ maxCallsPerRun: 26, maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: 2 });
  });

  // The Flow's configured spend limit is the ceiling of a run a person asked
  // for, in place of the resolver's default total, and still under Core's own.
  it("holds a run a person asked for to the Flow's configured ceiling when one is set", () => {
    const resolution = { maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 };
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution, policyMaxEstimatedCostUsdPerRun: 0.6 }).ledger.maxEstimatedCostUsdPerRun).toBe(0.6);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution: { maxTotalEstimatedCostUsd: 0.5 }, policyMaxEstimatedCostUsdPerRun: 1.2 }).ledger.maxEstimatedCostUsdPerRun).toBe(1.2);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution, policyMaxEstimatedCostUsdPerRun: 5 }).ledger.maxEstimatedCostUsdPerRun).toBe(2);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: true, resolution }).ledger.maxEstimatedCostUsdPerRun).toBe(2);
  });

  it("ignores a nonsensical declared call count rather than letting it zero the run", () => {
    for (const maxCallsPerRun of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitRunBudget: false, resolution: { maxCallsPerRun } }).ledger.maxCallsPerRun).toBe(AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP);
    }
  });
});
