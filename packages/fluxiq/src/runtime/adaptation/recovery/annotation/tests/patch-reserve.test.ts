import { describe, expect, it } from "vitest";
import { AutomationStudioLlmRunBudgetLedger, estimateAutomationStudioDeepSeekCostUsd } from "../../../../llm/index.ts";
import { holdAutomationStudioRecoveryPatchReserve } from "../patch-reserve.ts";

// The share of every call after the exploration, set aside on the run's ledger
// before an exploration may spend anything. The exploration has no call ceiling
// of its own (t1057): the purse, with these shares held, is what ends it.
describe("holdAutomationStudioRecoveryPatchReserve", () => {
  it("holds one patch-sized call on the ledger until it is released", () => {
    const runBudget = ledger(26);
    spendOne(runBudget, "request.diagnosis");
    const reserve = holdAutomationStudioRecoveryPatchReserve({ runBudget, runId: "run.one", maxEstimatedCostUsd: 2 / 26 });

    expect(runBudget.snapshot("run.one")).toMatchObject({ calls: 1, pendingCalls: 1 });
    reserve.release();
    reserve.release();
    expect(runBudget.snapshot("run.one")).toMatchObject({ calls: 1, pendingCalls: 0, totalTokens: 1_400 });
  });

  // Until t1057 a declared call count also lowered the exploration's own call ceiling to what remained after the
  // patch. The ledger does that now by itself: each held call is one pending call, so the exploration's decisions are
  // refused on the purse's own call code once only the held calls are left.
  it("leaves a declared call count's last calls to what comes after the exploration, on the ledger itself", () => {
    const runBudget = ledger(6);
    spendOne(runBudget, "request.diagnosis");
    const reserve = holdAutomationStudioRecoveryPatchReserve({ runBudget, runId: "run.one", maxEstimatedCostUsd: 0.01, reservedCalls: 2 });

    // 6 declared, 1 spent on the diagnosis, 2 held: three exploration decisions fit, and the fourth is refused.
    for (const id of ["explore.1", "explore.2", "explore.3"]) spendOne(runBudget, id);
    const refused = runBudget.reserve({ runId: "run.one", requestId: "explore.4", estimatedInputTokens: 1_000, maxOutputTokens: 1_000, maxEstimatedCostUsd: 0.01 });
    expect(refused.ok ? undefined : refused.diagnostic.code).toBe("llm_budget.run_call_limit");
    reserve.release();
    // Both held calls are back for the re-plan and the patch.
    spendOne(runBudget, "request.replan");
    spendOne(runBudget, "request.patch");
    expect(runBudget.snapshot("run.one")).toMatchObject({ calls: 6, pendingCalls: 0 });
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
    const reserve = holdAutomationStudioRecoveryPatchReserve({ runBudget, runId: "run.one", tokenLimits, maxEstimatedCostUsd: 0.01, reservedCalls: 2 });

    // One pending call per held call: 26 declared, 1 spent, 2 held.
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
