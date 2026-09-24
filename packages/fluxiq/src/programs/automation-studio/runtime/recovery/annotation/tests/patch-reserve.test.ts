import { describe, expect, it } from "vitest";
import { AutomationStudioLlmRunBudgetLedger } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS, AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS } from "../../exploration-budget.ts";
import { holdAutomationStudioRecoveryPatchReserve } from "../patch-reserve.ts";

// The patch's share, set aside on the run's ledger before an exploration may
// spend anything, and the exploration's call ceiling with that share removed.
describe("holdAutomationStudioRecoveryPatchReserve", () => {
  it("holds one patch-sized call on the ledger until it is released", () => {
    const runBudget = ledger(26);
    spendOne(runBudget, "request.diagnosis");
    const reserve = holdAutomationStudioRecoveryPatchReserve({ runBudget, runId: "run.one", declaredCallsPerRun: 26, maxEstimatedCostUsd: 2 / 26 });

    expect(runBudget.snapshot("run.one")).toMatchObject({ calls: 1, pendingCalls: 1 });
    reserve.release();
    reserve.release();
    expect(runBudget.snapshot("run.one")).toMatchObject({ calls: 1, pendingCalls: 0, totalTokens: 1_400 });
  });

  it("lowers a declared exploration ceiling to the calls left after the patch's", () => {
    const runBudget = ledger(26);
    spendOne(runBudget, "request.diagnosis");
    const reserve = holdAutomationStudioRecoveryPatchReserve({ runBudget, runId: "run.one", declaredCallsPerRun: 26, maxEstimatedCostUsd: 0.01 });

    // 26 declared, 1 spent on the diagnosis, 1 held for the patch.
    expect(reserve.explorationBudget).toMatchObject({ maxProviderCalls: 24, maxActions: 25 });
    // A larger grant raises the exploration with it, up to Core's ceiling. No
    // call has been spent on this run yet, so only the patch's is taken off.
    const wide = holdAutomationStudioRecoveryPatchReserve({ runBudget: ledger(64), runId: "run.two", declaredCallsPerRun: 64, maxEstimatedCostUsd: 0.01 });
    expect(wide.explorationBudget).toMatchObject({ maxProviderCalls: 63, maxActions: AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxActions });
    // A small one keeps the default action backstop and at least one decision,
    // which the held call on the ledger then refuses by name.
    const narrow = holdAutomationStudioRecoveryPatchReserve({ runBudget: ledger(2), runId: "run.three", declaredCallsPerRun: 2, maxEstimatedCostUsd: 0.01 });
    expect(narrow.explorationBudget).toMatchObject({ maxProviderCalls: 1, maxActions: AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS.maxActions });
  });

  // A recovery that will re-plan after looking makes two calls after the
  // exploration, not one. Holding one call's share for two is the same defect
  // this file exists to prevent, one call further along: the exploration would
  // leave the re-plan affordable and the patch not, so a run that looked,
  // changed its mind and knew what to repair would propose nothing.
  it("holds a share for every call that comes after the exploration, not only the patch's", () => {
    const runBudget = ledger(26);
    spendOne(runBudget, "request.diagnosis");
    const tokenLimits = { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 };
    const reserve = holdAutomationStudioRecoveryPatchReserve({ runBudget, runId: "run.one", declaredCallsPerRun: 26, tokenLimits, maxEstimatedCostUsd: 0.01, reservedCalls: 2 });

    // 26 declared, 1 spent on the diagnosis, 2 held for the re-plan and the patch.
    expect(reserve.explorationBudget).toMatchObject({ maxProviderCalls: 23 });
    // Two calls' worth of tokens is held, not one: a ledger with room for
    // 100,000 and 1,400 spent refuses an exploration decision that would leave
    // less than the two held calls need.
    const squeezed = runBudget.reserve({ runId: "run.one", requestId: "request.explore", estimatedInputTokens: 78_000, maxOutputTokens: 2_000, maxEstimatedCostUsd: 0.01 });
    expect(squeezed.ok).toBe(false);
    reserve.release();
    expect(runBudget.reserve({ runId: "run.one", requestId: "request.explore.again", estimatedInputTokens: 78_000, maxOutputTokens: 2_000, maxEstimatedCostUsd: 0.01 }).ok).toBe(true);
  });

  it("leaves the exploration's defaults alone when no call count was declared", () => {
    const reserve = holdAutomationStudioRecoveryPatchReserve({ runBudget: ledger(undefined), runId: "run.one", maxEstimatedCostUsd: 0.01 });

    expect(reserve.explorationBudget).toBeUndefined();
    reserve.release();
  });

  it("takes no hold the run cannot afford, and releasing it is harmless", () => {
    const runBudget = new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 5, maxTotalTokensPerRun: 5_000, maxOutputTokensPerRun: 5_000, maxEstimatedCostUsdPerRun: 1 });
    const reserve = holdAutomationStudioRecoveryPatchReserve({ runBudget, runId: "run.one", declaredCallsPerRun: 5, maxEstimatedCostUsd: 0.1 });

    expect(runBudget.snapshot("run.one").pendingCalls).toBe(0);
    reserve.release();
    expect(runBudget.snapshot("run.one").pendingCalls).toBe(0);
  });
});

function ledger(maxCallsPerRun: number | undefined): AutomationStudioLlmRunBudgetLedger {
  return new AutomationStudioLlmRunBudgetLedger({
    ...(maxCallsPerRun === undefined ? {} : { maxCallsPerRun }),
    maxTotalTokensPerRun: 100_000,
    maxOutputTokensPerRun: 100_000,
    maxEstimatedCostUsdPerRun: 2
  });
}

function spendOne(runBudget: AutomationStudioLlmRunBudgetLedger, requestId: string): void {
  const lease = runBudget.reserve({ runId: "run.one", requestId, estimatedInputTokens: 8_000, maxOutputTokens: 2_000, maxEstimatedCostUsd: 0.01 });
  if (!lease.ok) throw new Error(lease.diagnostic.code);
  lease.lease.complete({ inputTokens: 1_200, outputTokens: 200, totalTokens: 1_400 });
}
