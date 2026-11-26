import { describe, expect, it } from "vitest";
import { AutomationStudioLlmRunBudgetLedger, estimateAutomationStudioDeepSeekCostUsd } from "../../../../llm/index.ts";
import { holdAutomationStudioRecoveryPatchReserve } from "../patch-reserve.ts";

// The share of every call after the exploration, set aside on the run's ledger
// before an exploration may spend anything. The exploration has no call ceiling
// of its own (t1057): the purse, with these shares held, is what ends it.
describe("holdAutomationStudioRecoveryPatchReserve", () => {
  it("holds one patch-sized call on the ledger until it is released", () => {
    const runBudget = ledger();
    spendOne(runBudget, "request.diagnosis");
    const reserve = holdAutomationStudioRecoveryPatchReserve({ runBudget, runId: "run.one", maxEstimatedCostUsd: 2 / 26 });

    expect(runBudget.snapshot("run.one")).toMatchObject({ calls: 1, pendingCalls: 1 });
    reserve.release();
    reserve.release();
    expect(runBudget.snapshot("run.one")).toMatchObject({ calls: 1, pendingCalls: 0, totalTokens: 1_400 });
  });

  // The reserve is money kept back for the calls after the exploration, never a slot in a count of calls: no count of
  // calls ends a run (t1056). The exploration spends the purse down to what is held and is refused there for money,
  // on the purse's own cost code; released, the held dollars pay for the re-plan and the patch.
  it("keeps back the price of every call after the exploration, so the exploration is refused only for money", () => {
    const runBudget = ledger(0.1);
    spendOne(runBudget, "request.diagnosis", 0.01);
    const reserve = holdAutomationStudioRecoveryPatchReserve({ runBudget, runId: "run.one", maxEstimatedCostUsd: 0.02, reservedCalls: 2 });
    expect(runBudget.snapshot("run.one")).toMatchObject({ calls: 1, pendingCalls: 2 });

    // $0.10 purse, $0.01 spent on the diagnosis, $0.04 held: two $0.02 decisions fit, and a third, which the purse
    // alone could pay for, is refused because it would spend the held dollars.
    for (const id of ["explore.1", "explore.2"]) spendOne(runBudget, id, 0.02);
    const refused = runBudget.reserve({ runId: "run.one", requestId: "explore.3", estimatedInputTokens: 1_000, maxOutputTokens: 1_000, maxEstimatedCostUsd: 0.02 });
    expect(refused.ok ? undefined : refused.diagnostic.code).toBe("llm_budget.run_cost_limit");
    reserve.release();
    // The held dollars are back for the re-plan and the patch.
    spendOne(runBudget, "request.replan", 0.02);
    spendOne(runBudget, "request.patch", 0.02);
    expect(runBudget.snapshot("run.one")).toMatchObject({ calls: 5, pendingCalls: 0, estimatedCostUsd: expect.closeTo(0.09, 6) });
  });

  // A recovery that will re-plan after looking makes two calls after the
  // exploration, not one. Holding one call's share for two is the same defect
  // this file exists to prevent, one call further along: the exploration would
  // leave the re-plan affordable and the patch not, so a run that looked,
  // changed its mind and knew what to repair would propose nothing.
  it("holds a share for every call that comes after the exploration, not only the patch's", () => {
    const runBudget = ledger();
    spendOne(runBudget, "request.diagnosis");
    const tokenLimits = { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 };
    const reserve = holdAutomationStudioRecoveryPatchReserve({ runBudget, runId: "run.one", tokenLimits, maxEstimatedCostUsd: 0.01, reservedCalls: 2 });

    // One pending reservation per held call: 1 spent, 2 held.
    expect(runBudget.snapshot("run.one").pendingCalls).toBe(2);
    // Two calls' worth of tokens is held, not one, each sized on the diagnosis
    // this run already made (1,200 input tokens) plus the reply's allowance:
    // 6,400 in all. A ledger with room for 100,000 and 1,400 spent refuses an
    // exploration decision of 93,000 that one held call (3,200) would admit.
    const squeezed = runBudget.reserve({ runId: "run.one", requestId: "request.explore", estimatedInputTokens: 91_000, maxOutputTokens: 2_000, maxEstimatedCostUsd: 0.01 });
    expect(squeezed.ok).toBe(false);
    reserve.release();
    expect(runBudget.reserve({ runId: "run.one", requestId: "request.explore.again", estimatedInputTokens: 91_000, maxOutputTokens: 2_000, maxEstimatedCostUsd: 0.01 }).ok).toBe(true);
  });

  // 2026-09-30: at the window profile (992,000 / 8,000 / 1,000,000) one call's
  // worst case is the whole $0.25 purse, so a hold sized on the token limit was
  // never affordable and the patch lost its share. Sized on the diagnosis and
  // priced by the provider, it is held and the exploration still spends.
  it("holds a diagnosis-sized, provider-priced share at the window profile, and the exploration still runs", () => {
    const WINDOW = { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 };
    const price = ({ inputTokens, outputTokens }: { inputTokens: number; outputTokens: number }) => estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens, 0, "deepseek-flash");
    const runBudget = new AutomationStudioLlmRunBudgetLedger({ maxTotalTokensPerRun: 24_000_000, maxOutputTokensPerRun: 24_000_000, maxEstimatedCostUsdPerRun: 0.25 });
    const diagnosis = runBudget.reserve({ runId: "run.one", requestId: "request.diagnosis", estimatedInputTokens: 40_000, maxOutputTokens: 8_000, maxEstimatedCostUsd: price({ inputTokens: 40_000, outputTokens: 8_000 }) });
    if (!diagnosis.ok) throw new Error(diagnosis.diagnostic.code);
    diagnosis.lease.complete({ inputTokens: 30_000, outputTokens: 900, totalTokens: 30_900, estimatedCostUsd: price({ inputTokens: 30_000, outputTokens: 900 }) });

    const reserve = holdAutomationStudioRecoveryPatchReserve({ runBudget, runId: "run.one", tokenLimits: WINDOW, maxEstimatedCostUsd: 0.25, reservedCalls: 2, estimateCostUsd: price });
    expect(runBudget.snapshot("run.one").pendingCalls).toBe(2);
    const decision = runBudget.reserve({ runId: "run.one", requestId: "request.explore", estimatedInputTokens: 30_000, maxOutputTokens: 8_000, maxEstimatedCostUsd: price({ inputTokens: 30_000, outputTokens: 8_000 }) });
    expect(decision.ok).toBe(true);
    reserve.release();
    // Unpriced and sized on the window, as before, the hold is the whole purse and is not taken -- no part of it.
    const fresh = new AutomationStudioLlmRunBudgetLedger({ maxTotalTokensPerRun: 24_000_000, maxOutputTokensPerRun: 24_000_000, maxEstimatedCostUsdPerRun: 0.25 });
    const unpriced = holdAutomationStudioRecoveryPatchReserve({ runBudget: fresh, runId: "run.two", tokenLimits: WINDOW, maxEstimatedCostUsd: 0.25, reservedCalls: 2 });
    expect(fresh.snapshot("run.two").pendingCalls).toBe(0);
    unpriced.release();
  });

  it("takes no hold the run cannot afford, and releasing it is harmless", () => {
    const runBudget = new AutomationStudioLlmRunBudgetLedger({ maxTotalTokensPerRun: 5_000, maxOutputTokensPerRun: 5_000, maxEstimatedCostUsdPerRun: 1 });
    const reserve = holdAutomationStudioRecoveryPatchReserve({ runBudget, runId: "run.one", maxEstimatedCostUsd: 0.1 });

    expect(runBudget.snapshot("run.one").pendingCalls).toBe(0);
    reserve.release();
    expect(runBudget.snapshot("run.one").pendingCalls).toBe(0);
  });
});

function ledger(purseUsd = 2): AutomationStudioLlmRunBudgetLedger {
  return new AutomationStudioLlmRunBudgetLedger({
    maxTotalTokensPerRun: 100_000,
    maxOutputTokensPerRun: 100_000,
    maxEstimatedCostUsdPerRun: purseUsd
  });
}

/** One call, held at `usd` and, when a price is given, charged exactly that. */
function spendOne(runBudget: AutomationStudioLlmRunBudgetLedger, requestId: string, usd?: number): void {
  const lease = runBudget.reserve({ runId: "run.one", requestId, estimatedInputTokens: 8_000, maxOutputTokens: 2_000, maxEstimatedCostUsd: usd ?? 0.01 });
  if (!lease.ok) throw new Error(lease.diagnostic.code);
  lease.lease.complete({ inputTokens: 1_200, outputTokens: 200, totalTokens: 1_400, ...(usd === undefined ? {} : { estimatedCostUsd: usd }) });
}
