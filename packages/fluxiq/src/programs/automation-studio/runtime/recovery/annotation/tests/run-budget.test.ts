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
  it("bounds an ungranted recovery by $0.25 and 144,000 tokens, with the call count only a backstop", () => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitGrantBudget: false });

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
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitGrantBudget: false, maxTokensPerRun: 20_000, policyMaxEstimatedCostUsdPerRun: 0.1 });

    expect(budget.ledger).toMatchObject({ maxTotalTokensPerRun: 20_000, maxEstimatedCostUsdPerRun: 0.1 });
    // A policy can only lower the ungranted purse, never raise it.
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitGrantBudget: false, policyMaxEstimatedCostUsdPerRun: 5 }).ledger.maxEstimatedCostUsdPerRun).toBe(0.25);
  });

  // A resolver's call count is a real outside limit -- a grant mints exactly
  // that many authorisations -- so it is honoured, and a small one divides the
  // purse among the calls it can actually make.
  it("takes a resolver's declared call count at its word and sizes the purse to it", () => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitGrantBudget: false, resolution: { maxCallsPerRun: 2 } });

    expect(budget.ledger).toEqual({ maxCallsPerRun: 2, maxTotalTokensPerRun: 12_000, maxOutputTokensPerRun: 12_000, maxEstimatedCostUsdPerRun: 0.25 });
    expect(budget.maxEstimatedCostUsdPerCall).toBe(0.125);
    // Said, so a stage may plan by it; the backstop is never offered as one.
    expect(budget.declaredCallsPerRun).toBe(2);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitGrantBudget: false }).declaredCallsPerRun).toBeUndefined();
  });

  it("uses a grant's own total, and never more than Core's per-recovery ceiling", () => {
    const granted = resolveAutomationStudioRecoveryRunBudget({ explicitGrantBudget: true, resolution: { maxCallsPerRun: 10, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 1.5 } });
    expect(granted.ledger).toEqual({ maxCallsPerRun: 10, maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: 1.5 });
    expect(granted.maxEstimatedCostUsdPerCall).toBeCloseTo(0.15, 8);

    // A resolver that gives a per-call cost and no total would otherwise be
    // multiplied into $6; the ceiling holds it at $2.
    const untotalled = resolveAutomationStudioRecoveryRunBudget({ explicitGrantBudget: true, resolution: { maxEstimatedCostUsd: 0.25 } });
    expect(AUTOMATION_STUDIO_RECOVERY_MAX_ESTIMATED_COST_USD_PER_RUN).toBe(2);
    expect(untotalled.ledger.maxEstimatedCostUsdPerRun).toBe(2);
    expect(resolveAutomationStudioRecoveryRunBudget({ explicitGrantBudget: true, resolution: { maxTotalEstimatedCostUsd: 9 } }).ledger.maxEstimatedCostUsdPerRun).toBe(2);
  });

  // The grant commits each call's reservation, rounded to a billionth, against
  // its total. Every call it authorised must still fit on the last one, or the
  // grant refuses it and revokes itself while the run still has money.
  it.each([10, 25, 26, 64])("fits every reservation of a %i-call grant inside the grant's total", (calls) => {
    const total = 2;
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitGrantBudget: true, resolution: { maxCallsPerRun: calls, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: total } });
    const rounded = (value: number) => Math.round(value * 1_000_000_000) / 1_000_000_000;
    let committed = 0;
    for (let call = 0; call < calls; call += 1) {
      expect(rounded(committed + budget.maxEstimatedCostUsdPerCall)).toBeLessThanOrEqual(total);
      committed = rounded(committed + budget.maxEstimatedCostUsdPerCall);
    }
    expect(budget.ledger.maxCallsPerRun).toBe(calls);
    // And the token pot is what issuing that grant confirmed: per-call limit times calls.
    expect(budget.ledger.maxTotalTokensPerRun).toBe(10_000 * calls);
  });

  it("caps the token pot at a resolver's whole-run token exposure, however many calls it authorised", () => {
    const budget = resolveAutomationStudioRecoveryRunBudget({ explicitGrantBudget: true, resolution: { maxCallsPerRun: 26, maxTotalTokensPerRun: 100_000, maxTotalEstimatedCostUsd: 2 } });

    expect(budget.ledger).toEqual({ maxCallsPerRun: 26, maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: 2 });
  });

  it("ignores a nonsensical declared call count rather than letting it zero the run", () => {
    for (const maxCallsPerRun of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveAutomationStudioRecoveryRunBudget({ explicitGrantBudget: false, resolution: { maxCallsPerRun } }).ledger.maxCallsPerRun).toBe(AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP);
    }
  });
});
